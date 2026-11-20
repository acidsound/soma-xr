<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9ef033a3-717d-4f78-9694-4129553d379f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## OpenAI-compatible API (browser-local)

Open the **API 설정** button in the HUD to set an OpenAI-compatible Endpoint, Model and API Key.
These values are saved only in this browser's `localStorage` (`soma-xr:openai-compatible-api`)
and are sent directly from the browser to the configured endpoint. They are never sent to this
app's server or committed to the repository. Without saved settings, replies use the built-in
local responder.

## GitHub Pages deployment

Live site: https://acidsound.github.io/soma-xr/

Pushes to `main` run `.github/workflows/pages.yml` (`npm ci` → `npm run lint` → `GITHUB_PAGES=1 npm run build` → deploy). The Pages site is configured with `build_type: workflow`, so only that workflow publishes it.

`GITHUB_PAGES=1` sets Vite's `base` to `/soma-xr/`. All in-app asset URLs use `import.meta.env.BASE_URL`, so the VRM, runtime JSON and worker resolve under the project path.

GitHub Pages has no Node server, so the published build uses the same browser-local flow: chat replies come from the built-in local responder unless OpenAI-compatible settings are saved in the browser, voice uses the browser's `speechSynthesis`, and microphone input uses browser speech recognition where available. No API key is ever sent to a SOMA XR server.
