"""
AI Image Upscaler — Hugging Face ZeroGPU Space
================================================

A Gradio backend that performs Real-ESRGAN super-resolution (2x / 4x / 8x) with
optional GFPGAN face restoration, running on Hugging Face's free ZeroGPU tier.

The heavy inference runs inside functions decorated with ``@spaces.GPU`` so the
GPU is only attached for the duration of a request — this is what keeps the
Space free to host and lets many users share it.

Deploy:
  1. Create a new Space (SDK: Gradio, Hardware: ZeroGPU).
  2. Upload this file as ``app.py`` and ``requirements.txt`` alongside it.
  3. The model weights download automatically on first run.

The frontend calls the ``/upscale`` API endpoint via ``@gradio/client``.
"""

import os

import gradio as gr
import numpy as np
import spaces
import torch
from PIL import Image

# ---------------------------------------------------------------------------
# Lazy model loading
# ---------------------------------------------------------------------------
# Models are constructed once and cached in module globals. Weights are loaded
# on CPU at import time; tensors are moved to CUDA inside the GPU-decorated call.

_upsampler = None
_face_enhancer = None
MODEL_SCALE = 4  # Real-ESRGAN x4plus is natively a 4x model.


def _get_upsampler():
    """Build (and cache) the Real-ESRGAN x4plus upsampler."""
    global _upsampler
    if _upsampler is not None:
        return _upsampler

    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=MODEL_SCALE,
    )

    weights = _download_weight(
        url="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        filename="RealESRGAN_x4plus.pth",
    )

    _upsampler = RealESRGANer(
        scale=MODEL_SCALE,
        model_path=weights,
        model=model,
        # Tiling defaults; overridden per-request below.
        tile=512,
        tile_pad=16,
        pre_pad=0,
        half=torch.cuda.is_available(),
    )
    return _upsampler


def _get_face_enhancer(upsampler):
    """Build (and cache) the GFPGAN face restorer, wired to the upsampler."""
    global _face_enhancer
    if _face_enhancer is not None:
        return _face_enhancer

    from gfpgan import GFPGANer

    weights = _download_weight(
        url="https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
        filename="GFPGANv1.4.pth",
    )

    _face_enhancer = GFPGANer(
        model_path=weights,
        upscale=MODEL_SCALE,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=upsampler,
    )
    return _face_enhancer


def _download_weight(url: str, filename: str) -> str:
    """Download a model weight into a local cache dir and return its path."""
    weights_dir = os.path.join(os.path.dirname(__file__), "weights")
    os.makedirs(weights_dir, exist_ok=True)
    dest = os.path.join(weights_dir, filename)
    if not os.path.isfile(dest):
        from basicsr.utils.download_util import load_file_from_url

        load_file_from_url(url=url, model_dir=weights_dir, file_name=filename)
    return dest


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

@spaces.GPU(duration=120)
def upscale(
    image: Image.Image,
    scale: int = 4,
    face_restore: bool = False,
    tile_size: int = 512,
    tile_pad: int = 16,
) -> Image.Image:
    """Upscale ``image`` by ``scale`` (2, 4, or 8) on the GPU.

    - 2x / 4x run directly through Real-ESRGAN (with post-downscale for 2x).
    - 8x runs a 4x Real-ESRGAN pass followed by a high-quality 2x Lanczos pass
      to stay within ZeroGPU time and memory limits.
    - ``face_restore`` routes the image through GFPGAN for portrait detail.
    - ``tile_size`` / ``tile_pad`` control the tiling strategy that prevents
      seam artifacts and out-of-memory crashes on large inputs.
    """
    if image is None:
        raise gr.Error("No image provided.")

    scale = int(scale)
    if scale not in (2, 4, 8):
        raise gr.Error("Scale must be 2, 4, or 8.")

    img = np.array(image.convert("RGB"))

    upsampler = _get_upsampler()
    upsampler.tile = int(tile_size)
    upsampler.tile_pad = int(tile_pad)

    # Real-ESRGAN x4plus always produces a 4x result; we resample afterwards
    # to hit the requested factor.
    if face_restore:
        enhancer = _get_face_enhancer(upsampler)
        _, _, output = enhancer.enhance(
            img,
            has_aligned=False,
            only_center_face=False,
            paste_back=True,
        )
    else:
        output, _ = upsampler.enhance(img, outscale=MODEL_SCALE)

    result = Image.fromarray(output)

    # `output` is 4x the input. Resample to the requested factor.
    target_w = image.width * scale
    target_h = image.height * scale
    if (result.width, result.height) != (target_w, target_h):
        result = result.resize((target_w, target_h), Image.LANCZOS)

    return result


# ---------------------------------------------------------------------------
# Gradio UI + API
# ---------------------------------------------------------------------------

with gr.Blocks(title="AI Image Upscaler (ZeroGPU)") as demo:
    gr.Markdown(
        "# 🖼️ AI Image Upscaler\n"
        "Real-ESRGAN x4plus super-resolution with optional GFPGAN face "
        "restoration, running on **ZeroGPU**. Exposes an `/upscale` API "
        "consumed by the web frontend."
    )
    with gr.Row():
        with gr.Column():
            inp = gr.Image(type="pil", label="Input image")
            scale_in = gr.Radio(
                choices=[2, 4, 8], value=4, label="Scale factor"
            )
            face_in = gr.Checkbox(value=False, label="Face restoration (GFPGAN)")
            tile_in = gr.Slider(
                0, 1024, value=512, step=64, label="Tile size (px, 0 = off)"
            )
            pad_in = gr.Slider(0, 64, value=16, step=2, label="Tile padding (px)")
            btn = gr.Button("Upscale", variant="primary")
        with gr.Column():
            out = gr.Image(type="pil", label="Upscaled result", format="png")

    btn.click(
        fn=upscale,
        inputs=[inp, scale_in, face_in, tile_in, pad_in],
        outputs=out,
        api_name="upscale",
    )


if __name__ == "__main__":
    demo.queue(max_size=20).launch()
