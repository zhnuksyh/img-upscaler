# 🖼️ AI Image Upscaler

A **free, $0/month, fully client-side** AI image upscaler. Real-ESRGAN
super-resolution (2× / 4× / 8×) with optional GFPGAN face restoration, running
on a **serverless cloud GPU** (Modal). The web app is a static site you host on
**GitHub Pages** — no server to run, no image storage, no bills.

- 🚀 **Cloud GPU for upscaling** — every AI inference pass runs remotely; your
  device only handles UI, encoding, and rendering. Works for photos,
  illustrations, anime, and art. (Shrinking needs no model, so it stays local —
  see below.)
- 🎛️ **High-quality output** — Real-ESRGAN x4plus with smart tiling + overlap
  padding to kill seams and avoid VRAM crashes.
- 👤 **Face restoration** — optional GFPGAN pass for crisp, natural portraits.
  (Leave it off for anime/cartoons — it's tuned for realistic human faces.)
- 📉 **Make smaller — instant, no GPU** — shrink to 25/50/75%, or to a file-size
  budget ("under 250 KB"). Runs entirely in your browser, so it needs no
  endpoint configured and costs nothing.
- 📦 **Batch mode** — drop many images, watch per-file progress, download each
  or grab everything as a `.zip`.
- 🔀 **Before/after slider** — drag to inspect original vs. upscaled detail,
  with before/after dimensions and file sizes.
- 🔒 **Deploy-your-own** — no shared backend; each user points the app at their
  own Modal endpoint, so nobody spends anyone else's credits.
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

### Staying at $0 — billing safety

The backend is designed to **fail closed** (stop) rather than ever bill you.
Three layers protect you:

1. **Keep no payment method on Modal.** With no card on file, Modal *cannot*
   charge you — it stops running apps when free credits/limit are reached. This
   is your hardest guarantee. Do **not** "add a payment method to raise the
   limit" unless you knowingly want paid usage.
2. **Workspace usage limit.** Modal's free Starter plan enforces a hard spend
   cap per billing cycle (e.g. $1). Running apps stop at the cap. Check it at
   <https://modal.com/settings/usage>.
3. **In-code guardrails** ([`modal_app/modal_app.py`](modal_app/modal_app.py)):
   `max_containers=1` (only one GPU can ever run at once, so usage can't spike),
   a per-request timeout, and input size/resolution caps that reject oversized
   images *before* the GPU boots.

**What "limit reached" looks like:** upscales fail with a clear message
("monthly usage limit was reached… you are not billed"), and resume next cycle.
The browser can't read your remaining credits — check the billing page above.

A rough guide: a warm 8× upscale costs well under a cent of GPU time; a few
hundred upscales/month fit inside the free credit. Cold starts (first request
after idle) cost a little more, so batching many images in one session is
cheaper than trickling one at a time.

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
the URL is stored only in your browser's `localStorage` and is remembered on
every future visit from that browser.

> **Paste the deployed endpoint, not the dashboard page.** A common mistake is
> copying `modal.com/apps/<user>/main/deployed/<app>` from the browser address
> bar; the endpoint you want is the `https://<user>--<app>-upscale.modal.run`
> URL that `modal deploy` prints. Settings flags that mistake as you type and
> offers the correct URL as a one-click fix. **Test connection** then runs a
> real 1×1 upscale against the endpoint and checks the JSON response contract,
> so a green result means the backend actually works — not just that something
> answered.

> **Keep your endpoint URL private.** The Modal endpoint has no password —
> anyone who has the URL can send requests and spend *your* free credits. Don't
> commit it, screenshot it, or bake it into a public build. Because it lives
> only in your own browser's `localStorage`, visitors to your hosted site see an
> unconfigured app and cannot use your backend. This is the intended
> **deploy-your-own** model: every user runs their own Modal backend (see
> [For other developers](#for-other-developers--deploy-your-own) below).

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

## Resize factors & tiling

| Factor        | Pipeline                                       | Runs on |
| ------------- | ---------------------------------------------- | ------- |
| 25 / 50 / 75% | Canvas resample in halving steps               | Browser |
| 2×            | Real-ESRGAN 4× → Lanczos downscale to 2×       | GPU     |
| 4×            | Real-ESRGAN x4plus (native)                    | GPU     |
| 8×            | Real-ESRGAN 4× → high-quality 2× resample      | GPU     |

Shrinking invents no new detail, so the sub-1× factors never touch the GPU —
they work with **no endpoint configured at all** and cost no credits. Face
restoration and tiling are hidden for those, since no model pass runs.

**Tiling** splits large images into overlapping tiles (default 512 px, 16 px
padding) so the GPU never runs out of memory and no seams appear at tile edges.
Tune both under **Advanced tiling** in the controls.

### Hitting a file-size budget

Instead of a percentage you can name a target size (e.g. `250 KB`, `2 MB`) and
the app compresses until the file fits. It works in both directions:

- **Below** the current size → dimensions are held and encoder quality is
  binary-searched down until the file fits the budget.
- **Above** it → quality is held high and *dimensions* are searched instead, so
  the extra bytes buy pixels rather than artifacts.

Either way the work happens in-browser on a result you already have; growing
past the source resolution costs a single GPU pass, not one per candidate size.

---

## For other developers — deploy your own

This app ships with **no default backend on purpose**. Each user runs their own
Modal backend so nobody spends anyone else's credits. If you've forked this or
landed on a hosted instance and want to use it, here's the whole flow:

1. **Get a free Modal account** at <https://modal.com> (GitHub sign-in works).
2. **Install & authenticate** (interactive, one time):
   ```bash
   pip install modal
   modal setup
   ```
3. **Deploy the backend** from a clone of this repo:
   ```bash
   git clone https://github.com/<owner>/<repo>.git
   cd <repo>
   modal deploy modal_app/modal_app.py
   ```
   Copy the printed `https://<your-workspace>--img-upscaler-upscale.modal.run`.
4. **Point the app at it:** open the app → **Settings** → Backend type **Modal**
   → paste your URL → Save. Your URL is stored only in your browser.

That's the entire cost model: your images run on *your* Modal free credits, and
[billing safety](#staying-at-0--billing-safety) keeps it at $0.

### Deploy troubleshooting

The Real-ESRGAN dependency stack is version-sensitive; the image in
[`modal_app/modal_app.py`](modal_app/modal_app.py) already handles the common
pitfalls, but for reference:

- `metadata-generation-failed` on `basicsr` → torch must be installed **before**
  `basicsr` (its `setup.py` imports torch). The image installs torch first, then
  `basicsr` with `--no-build-isolation`.
- `RuntimeError: Numpy is not available` → torch 2.1.2 needs **numpy 1.x**;
  transitive deps can pull numpy 2 back in. The image force-reinstalls
  `numpy==1.26.4` **last** and self-checks the import at build time.
- `FastAPI ... must be installed` → `fastapi[standard]` is included for the web
  endpoint decorator.

If your build still fails, the build log's last failing package is the clue —
adjust the pins in `modal_app.py`.

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
**Backend:** PyTorch · Real-ESRGAN · GFPGAN on **Modal** (T4, serverless,
scale-to-zero) or HF ZeroGPU. Modal endpoint returns base64 PNG + result
dimensions; the app maps usage-limit errors to a clear "not billed" message.

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages CI/CD
modal_app/modal_app.py         Modal serverless-GPU backend (recommended)
hf_space/                      HF Gradio Space backend (needs PRO)
src/
  components/                  UI (DropZone, BatchQueue, CompareSlider,
                               Controls, TargetSizeExport, HistoryGallery,
                               SettingsModal, Header)
  services/
    upscalerApi.ts             remote GPU calls + endpoint ping
    resizeService.ts           in-browser downscale / fit-to-target-size
    compressService.ts         quality binary search to a byte budget
    config.ts                  localStorage config + Modal URL validation
    zipService.ts              batch .zip export
  types/                       shared TypeScript interfaces
  App.tsx                      layout + batch state management
```

## License

MIT. Real-ESRGAN and GFPGAN carry their own upstream licenses.
