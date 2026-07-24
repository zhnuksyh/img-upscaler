# 🖼️ AI Image Upscaler

A **free, $0/month, fully client-side** AI image upscaler. Real-ESRGAN
super-resolution (2× / 4× / 8×) with optional GFPGAN face restoration, running
on a **Hugging Face ZeroGPU** Space. The web app is a static site you can host
on **GitHub Pages** — no backend server, no image storage, no bills.

- 🚀 **100% cloud GPU** — all inference runs remotely on ZeroGPU; your device
  only handles UI, encoding, and rendering.
- 🎛️ **iLoveIMG-level quality** — Real-ESRGAN x4plus with smart tiling + overlap
  padding to kill seams and avoid VRAM crashes.
- 👤 **Face restoration** — optional GFPGAN pass for crisp, natural portraits.
- 📦 **Batch mode** — drop many images, watch per-file progress, download each
  or grab everything as a `.zip`.
- 🔀 **Before/after slider** — drag to inspect original vs. upscaled detail.
- 🔑 **Bring your own token** — visitors can plug in their free Hugging Face
  token to spend their **own** ZeroGPU quota (~5 min GPU/day ≈ 40–70 upscales).
- 🌑 **Sleek dark UI** — built with Vite + React + TypeScript + Tailwind.

---

## Architecture

```
Browser (GitHub Pages, static)          Hugging Face Space (ZeroGPU)
┌─────────────────────────────┐          ┌──────────────────────────────┐
│ React UI                    │          │ Gradio app.py                │
│  • DropZone / BatchQueue    │  image   │  • Real-ESRGAN x4plus         │
│  • CompareSlider            │ ───────▶ │  • GFPGAN face restore        │
│  • @gradio/client           │ ◀─────── │  • @spaces.GPU inference      │
│  • JSZip export             │  result  │  • tiling + overlap padding   │
└─────────────────────────────┘          └──────────────────────────────┘
```

Nothing is stored centrally. The browser talks straight to the Space and holds
results in memory for the session only.

---

## Part 1 — Deploy the Hugging Face Space (the GPU backend)

1. Go to <https://huggingface.co/new-space>.
2. **Space name**: e.g. `img-upscaler-zerogpu`.
3. **SDK**: **Gradio**. **Hardware**: **ZeroGPU** (free).
4. In the new Space, upload the two files from [`hf_space/`](hf_space/):
   - [`hf_space/app.py`](hf_space/app.py)
   - [`hf_space/requirements.txt`](hf_space/requirements.txt)
5. The Space builds automatically. Model weights download on the first request
   (give the first upscale ~30–60s of cold start).

> **`basicsr` / torchvision compatibility.** Newer `torchvision` removed
> `functional_tensor`, which older `basicsr` imports. `app.py` already ships a
> shim at the top of the file that re-exposes it, so the Space builds cleanly on
> current runtimes — no manual patch needed.

Your public Space id will be `your-username/img-upscaler-zerogpu`.

---

## Part 2 — Configure & run the web app locally

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
npm install
npm run dev
```

Open the printed localhost URL. In the app's **Settings**, either:

- keep the **community endpoint** (shared quota, good for a quick test), or
- enter **your** Space id (`your-username/img-upscaler-zerogpu`) and, optionally,
  a Hugging Face token to use your personal quota.

Point the default at your own Space by editing `DEFAULT_ENDPOINT` in
[`src/types/index.ts`](src/types/index.ts).

### Getting a free Hugging Face token

1. Sign in at <https://huggingface.co>.
2. Go to **Settings → Access Tokens** (<https://huggingface.co/settings/tokens>).
3. **Create new token** → type **Read** → copy the `hf_...` value.
4. Paste it into the app's **Settings** modal. It's stored only in your
   browser's `localStorage` and sent directly to Hugging Face.

---

## Part 3 — Deploy the web app to GitHub Pages

1. Push this repo to GitHub (branch `main`).
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and
   choose **GitHub Actions**.
3. The included workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
   builds on every push to `main` and publishes to Pages. It auto-derives the
   correct base path from your repo name.

Your site: `https://<you>.github.io/<repo>/`.

> Building manually? Set the base path yourself:
> `VITE_BASE="/<repo>/" npm run build`.

---

## Scale factors & tiling

| Scale | Pipeline                                    |
| ----- | ------------------------------------------- |
| 2×    | Real-ESRGAN 4× → Lanczos downscale to 2×    |
| 4×    | Real-ESRGAN x4plus (native)                 |
| 8×    | Real-ESRGAN 4× → high-quality 2× resample   |

**Tiling** splits large images into overlapping tiles (default 512 px, 16 px
padding) so the GPU never runs out of memory and no seams appear at tile edges.
Tune both under **Advanced tiling** in the controls.

---

## Tech stack

**Frontend:** Vite · React · TypeScript · Tailwind CSS · lucide-react ·
`@gradio/client` · JSZip · file-saver
**Backend:** Gradio · PyTorch · Real-ESRGAN · GFPGAN on Hugging Face ZeroGPU

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages CI/CD
hf_space/                      HF ZeroGPU Space (app.py + requirements.txt)
src/
  components/                  UI (DropZone, BatchQueue, CompareSlider, …)
  services/                    upscalerApi, zipService, config
  types/                       shared TypeScript interfaces
  App.tsx                      layout + batch state management
```

## License

MIT. Real-ESRGAN and GFPGAN carry their own upstream licenses.
