"""
AI Image Upscaler — Modal serverless GPU backend
=================================================

Deploys a Real-ESRGAN (2x/4x/8x) upscaler with optional GFPGAN face
restoration onto Modal's serverless GPUs. A container cold-starts on an Nvidia
T4, upscales one image, and scales back to zero — you pay per-second only while
it runs, which fits Modal's free monthly compute credits ($0/month for
personal-scale use, no subscription).

Unlike a Hugging Face Space, YOU own this web endpoint, so CORS is configured
here — the GitHub Pages frontend can call it directly with plain `fetch`.

Deploy (you run these; see README):
    pip install modal
    modal setup                 # interactive browser auth
    modal deploy modal_app.py   # prints your public URL

The printed URL (…/upscale) goes into the app's Settings as a "Modal" endpoint.
"""

import base64
import io

import modal

# ---------------------------------------------------------------------------
# Image: CUDA-capable Python with the super-resolution stack baked in.
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1", "libglib2.0-0", "wget", "git")
    # STEP 1 — install torch + numpy 1.x FIRST, in isolation.
    # `basicsr`'s setup.py imports torch at install time to detect CUDA. If torch
    # isn't present yet, its metadata generation crashes
    # (metadata-generation-failed). numpy is pinned to 1.x because torch 2.1.2
    # was built against numpy 1 — numpy 2 breaks `torch.from_numpy`
    # ("Numpy is not available").
    .pip_install(
        "numpy==1.26.4",
        "torch==2.1.2",
        "torchvision==0.16.2",
    )
    # STEP 2 — build tooling that basicsr/gfpgan need to generate metadata.
    .pip_install("setuptools<70", "wheel", "Cython")
    # STEP 3 — install basicsr and friends WITHOUT build isolation, so their
    # setup.py can import the torch from step 1.
    .run_commands(
        "pip install --no-build-isolation "
        "basicsr==1.4.2 facexlib==0.3.0 gfpgan==1.3.8 realesrgan==0.3.0"
    )
    # STEP 4 — remaining runtime deps.
    .pip_install("pillow", "opencv-python-headless")
    # STEP 5 — RE-ASSERT numpy 1.x LAST. Steps 3–4 can silently pull numpy 2 back
    # in as a transitive dep, which is what breaks torch. Force it back with
    # --no-deps so nothing else is disturbed, then verify the stack imports.
    .run_commands(
        "pip install --no-deps --force-reinstall 'numpy==1.26.4'",
        # Fail the BUILD (not the first request) if the combo is still broken.
        "python -c 'import numpy, torch; "
        "print(\"numpy\", numpy.__version__, \"torch\", torch.__version__); "
        "torch.from_numpy(numpy.zeros(1)); "
        "import basicsr, realesrgan, gfpgan; print(\"stack OK\")'",
    )
    # STEP 6 — basicsr imports torchvision.transforms.functional_tensor, removed
    # in newer torchvision. Patch the installed source so imports resolve.
    .run_commands(
        "python - <<'PY'\n"
        "import basicsr, os, glob\n"
        "root = os.path.dirname(basicsr.__file__)\n"
        "for f in glob.glob(os.path.join(root, '**', '*.py'), recursive=True):\n"
        "    s = open(f, encoding='utf-8').read()\n"
        "    if 'functional_tensor' in s:\n"
        "        s = s.replace('torchvision.transforms.functional_tensor',\n"
        "                      'torchvision.transforms.functional')\n"
        "        open(f, 'w', encoding='utf-8').write(s)\n"
        "PY"
    )
)

app = modal.App("img-upscaler", image=image)

# Persist downloaded model weights across cold starts.
weights = modal.Volume.from_name("upscaler-weights", create_if_missing=True)
WEIGHTS_DIR = "/weights"

MODEL_SCALE = 4  # Real-ESRGAN x4plus is natively 4x.

# ---------------------------------------------------------------------------
# COST GUARDRAILS — keep this comfortably inside Modal's free monthly credits.
# ---------------------------------------------------------------------------
# These caps are the difference between "free forever" and "surprise bill".
# Tune only if you understand the cost impact.
#
# - MAX_GPU_CONTAINERS: hard ceiling on how many T4s can run at once. With 1,
#   the most GPU you can ever burn is 1 GPU-second per wall-clock second, no
#   matter how many users hit the endpoint. Requests queue instead of fanning
#   out into many billed GPUs.
# - GPU_TIMEOUT_SECONDS: a single stuck upscale can never run longer than this.
# - MAX_INPUT_BYTES / MAX_INPUT_PIXELS: reject oversized inputs BEFORE booting
#   the GPU, so a huge image can't cause a long (expensive) run or an OOM.
MAX_GPU_CONTAINERS = 1
GPU_TIMEOUT_SECONDS = 90
MAX_INPUT_BYTES = 12 * 1024 * 1024  # 12 MB upload cap
MAX_INPUT_PIXELS = 4_000_000  # ~2000x2000 source; 8x of that is still huge


def _download(url: str, filename: str) -> str:
    import os

    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    dest = os.path.join(WEIGHTS_DIR, filename)
    if not os.path.isfile(dest):
        from basicsr.utils.download_util import load_file_from_url

        load_file_from_url(url=url, model_dir=WEIGHTS_DIR, file_name=filename)
        weights.commit()
    return dest


@app.cls(
    gpu="T4",
    volumes={WEIGHTS_DIR: weights},
    # Keep a warm container briefly so bursts of images avoid repeated cold
    # starts, then scale to zero (free when idle).
    scaledown_window=60,
    # Cost guardrails: never run more than one GPU at a time, and cap how long
    # any single upscale may run. See COST GUARDRAILS above.
    max_containers=MAX_GPU_CONTAINERS,
    timeout=GPU_TIMEOUT_SECONDS,
)
class Upscaler:
    @modal.enter()
    def load(self):
        """Load models once per container (on first request / cold start)."""
        import torch
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        model = RRDBNet(
            num_in_ch=3, num_out_ch=3, num_feat=64,
            num_block=23, num_grow_ch=32, scale=MODEL_SCALE,
        )
        weight_path = _download(
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
            "RealESRGAN_x4plus.pth",
        )
        self.upsampler = RealESRGANer(
            scale=MODEL_SCALE,
            model_path=weight_path,
            model=model,
            tile=512,
            tile_pad=16,
            pre_pad=0,
            half=torch.cuda.is_available(),
        )
        self._face_enhancer = None

    def _face(self):
        if self._face_enhancer is None:
            from gfpgan import GFPGANer

            gfp = _download(
                "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
                "GFPGANv1.4.pth",
            )
            self._face_enhancer = GFPGANer(
                model_path=gfp,
                upscale=MODEL_SCALE,
                arch="clean",
                channel_multiplier=2,
                bg_upsampler=self.upsampler,
            )
        return self._face_enhancer

    @modal.method()
    def run(self, img_bytes: bytes, scale: int, face_restore: bool,
            tile_size: int, tile_pad: int) -> dict:
        import numpy as np
        from PIL import Image

        image_pil = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        arr = np.array(image_pil)

        self.upsampler.tile = int(tile_size)
        self.upsampler.tile_pad = int(tile_pad)

        if face_restore:
            _, _, output = self._face().enhance(
                arr, has_aligned=False, only_center_face=False, paste_back=True
            )
        else:
            output, _ = self.upsampler.enhance(arr, outscale=MODEL_SCALE)

        result = Image.fromarray(output)

        # Real-ESRGAN always yields 4x; resample to the requested factor.
        target = (image_pil.width * scale, image_pil.height * scale)
        if (result.width, result.height) != target:
            result = result.resize(target, Image.LANCZOS)

        buf = io.BytesIO()
        result.save(buf, format="PNG")
        data = buf.getvalue()
        return {
            "image": base64.b64encode(data).decode("ascii"),
            "width": result.width,
            "height": result.height,
            "size": len(data),
        }


# ---------------------------------------------------------------------------
# Web endpoint: plain JSON in/out, CORS enabled for browser callers.
# ---------------------------------------------------------------------------

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


@app.function()
@modal.fastapi_endpoint(method="POST", docs=True)
def upscale(payload: dict):
    """POST { image: base64, scale: 2|4|8, faceRestore: bool,
             tileSize: int, tilePad: int } -> { image: base64 png, w, h, size }."""
    from fastapi.responses import JSONResponse

    try:
        b64 = payload.get("image", "")
        if "," in b64:  # tolerate a data: URL prefix
            b64 = b64.split(",", 1)[1]
        img_bytes = base64.b64decode(b64)

        # --- Guardrails: reject oversized inputs BEFORE booting the GPU. ---
        if len(img_bytes) > MAX_INPUT_BYTES:
            return JSONResponse(
                content={
                    "error": f"Image too large ({len(img_bytes) // (1024 * 1024)} MB). "
                    f"Max {MAX_INPUT_BYTES // (1024 * 1024)} MB."
                },
                status_code=413,
                headers=CORS_HEADERS,
            )
        # Cheap dimension check without loading the GPU.
        from PIL import Image

        probe = Image.open(io.BytesIO(img_bytes))
        if probe.width * probe.height > MAX_INPUT_PIXELS:
            return JSONResponse(
                content={
                    "error": "Image resolution too high. "
                    f"Max {MAX_INPUT_PIXELS // 1_000_000} megapixels."
                },
                status_code=413,
                headers=CORS_HEADERS,
            )

        scale = int(payload.get("scale", 4))
        if scale not in (2, 4, 8):
            scale = 4

        result = Upscaler().run.remote(
            img_bytes,
            scale,
            bool(payload.get("faceRestore", False)),
            int(payload.get("tileSize", 512)),
            int(payload.get("tilePad", 16)),
        )
        return JSONResponse(content=result, headers=CORS_HEADERS)
    except Exception as e:  # noqa: BLE001
        return JSONResponse(
            content={"error": str(e)}, status_code=500, headers=CORS_HEADERS
        )


@app.function()
@modal.fastapi_endpoint(method="OPTIONS")
def upscale_options():
    """CORS preflight handler."""
    from fastapi.responses import Response

    return Response(status_code=204, headers=CORS_HEADERS)
