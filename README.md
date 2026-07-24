# 🖼️ AI Image Upscaler

A **free, $0/month, fully client-side** AI image upscaler. Real-ESRGAN
super-resolution (2× / 4× / 8×) with optional GFPGAN face restoration, running
on a **serverless cloud GPU** (Modal). The web app is a static site you host on
**GitHub Pages** — no server to run, no image storage, no bills.

- 🚀 **100% cloud GPU** — all inference runs remotely; your device only handles
  UI, encoding, and rendering. Works for photos, illustrations, anime, and art.
- 🎛️ **High-quality output** — Real-ESRGAN x4plus with smart tiling + overlap
  padding to kill seams and avoid VRAM crashes.
- 👤 **Face restoration** — optional GFPGAN pass for crisp, natural portraits.
  (Leave it off for anime/cartoons — it's tuned for realistic human faces.)
- 📦 **Batch mode** — drop many images, watch per-file progress, download each
  or grab everything as a `.zip`.
- 🔀 **Before/after slider** — drag to inspect original vs. upscaled detail,
  with before/after dimensions and file sizes.
- 🌑 **Sleek dark UI** — built with Vite + React + TypeScript + Tailwind.

---

## Why Modal (and not a Hugging Face Space)?

Hugging Face **now requires a PRO plan** to create Gradio/Docker Spaces (only
Static Spaces stay free). And a browser **can't call a third-party public Space
directly** — the Gradio web client sends credentialed requests that get blocked
by CORS.

**Modal** solves both: it has a **free monthly GPU-compute allowance (no
subscription, no card required to start)**, and because *you* own the web
endpoint, *you* set the CORS headers — so the GitHub Pages frontend can call it
with a plain `fetch`. A container cold-starts a GPU, upscales one image, and
scales back to zero; you're only billed per-second while it runs, which is
pennies — thousands of upscales fit comfortably in the free allowance.

> The Hugging Face Gradio backend is still included in [`hf_space/`](hf_space/)
> as an alternative if you have HF PRO. See "Alternative backend" below.

## Architecture

```
Browser (GitHub Pages, static)            Modal (serverless GPU)
┌─────────────────────────────┐            ┌──────────────────────────────┐
│ React UI                    │  base64    │ modal_app.py                 │
│  • DropZone / BatchQueue    │   JSON     │  • Real-ESRGAN x4plus         │
│  • CompareSlider            │ ─────────▶ │  • GFPGAN face restore        │
│  • plain fetch (CORS-clean) │ ◀───────── │  • T4 GPU, scale-to-zero      │
│  • JSZip export             │  base64    │  • tiling + overlap padding   │
└─────────────────────────────┘            └──────────────────────────────┘
```

Nothing is stored centrally. The browser talks straight to your endpoint and
holds results in memory for the session only.

---

## Part 1 — Deploy the Modal GPU backend

You need a free Modal account. **These steps are interactive and must be run by
you** in a terminal (the auth step opens a browser):

```bash
# 1. Install the Modal CLI
pip install modal

# 2. Authenticate (opens a browser to link your account — one time)
modal setup

# 3. Deploy the backend from this repo
modal deploy modal_app/modal_app.py
```

`modal deploy` prints a public URL ending in `.modal.run`, e.g.:

```
https://<your-workspace>--img-upscaler-upscale.modal.run
```

Copy that URL — you'll paste it into the app's **Settings** (Backend type =
**Modal**). The **first** upscale after idle is slow (~20–60s) while the
container boots and downloads model weights; after that it's a few seconds each,
and weights are cached on a Modal Volume across cold starts.

---

## Part 2 — Configure & run the web app locally

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
npm install
npm run dev
```

Open the printed localhost URL, click **Settings**, choose Backend type
**Modal**, and paste your `.modal.run` endpoint URL from Part 1. That's it —
the URL is stored only in your browser's `localStorage`.

To bake your endpoint in as the shipped default (so every visitor uses it
without configuring), set `spaceId` in `DEFAULT_ENDPOINT` in
[`src/types/index.ts`](src/types/index.ts) to your Modal URL.

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

## Alternative backend — Hugging Face Space (needs PRO)

If you have Hugging Face **PRO**, you can host the Gradio backend in
[`hf_space/`](hf_space/) instead of Modal:

1. Create a **Gradio** Space with **ZeroGPU** hardware.
2. Upload [`hf_space/app.py`](hf_space/app.py) and
   [`hf_space/requirements.txt`](hf_space/requirements.txt) to its root.
3. In the app's **Settings**, set Backend type **HF Space** and enter your Space
   id (`your-username/your-space`). Add a Hugging Face token for private quota.

The **Public HF** backend type (calling *someone else's* public Space) is
included but usually fails in the browser due to CORS — prefer Modal.

## Tech stack

**Frontend:** Vite · React · TypeScript · Tailwind CSS · lucide-react ·
`@gradio/client` (HF backends) · plain `fetch` (Modal) · JSZip · file-saver
**Backend:** PyTorch · Real-ESRGAN · GFPGAN on **Modal** (T4) or HF ZeroGPU

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages CI/CD
modal_app/modal_app.py         Modal serverless-GPU backend (recommended)
hf_space/                      HF Gradio Space backend (needs PRO)
src/
  components/                  UI (DropZone, BatchQueue, CompareSlider, …)
  services/                    upscalerApi, zipService, config
  types/                       shared TypeScript interfaces
  App.tsx                      layout + batch state management
```

## License

MIT. Real-ESRGAN and GFPGAN carry their own upstream licenses.
