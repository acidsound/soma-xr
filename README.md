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

## GitHub Pages deployment

Live site: https://acidsound.github.io/soma-xr/

Pushes to `main` run `.github/workflows/pages.yml` (`npm ci` → `npm run lint` → `GITHUB_PAGES=1 npm run build` → deploy). The Pages site is configured with `build_type: workflow`, so only that workflow publishes it.

`GITHUB_PAGES=1` sets Vite's `base` to `/soma-xr/`. All in-app asset URLs use `import.meta.env.BASE_URL`, so the VRM, runtime JSON and worker resolve under the project path.

GitHub Pages has no Node server, so the published build is fully client-side: chat replies come from the built-in local responder, voice uses the browser's `speechSynthesis`, and microphone input uses browser speech recognition where available. Direct browser calls to OpenAI-compatible APIs are blocked by CORS, so external LLM integration is removed until a backend proxy exists; no API key is stored or sent anywhere.

## Quest 3에서 WebXR 열기

WebXR은 **secure context**에서만 동작합니다. `http://100.90.152.114:3000`처럼 LAN IP를
평문 HTTP로 열면 Quest Browser가 `navigator.xr` 자체를 제공하지 않아 권한과 무관하게
XR 세션을 요청할 수 없습니다. 앱은 이 경우 영구적인 `Enter XR` 버튼에
"WebXR 사용 불가"와 HTTPS 안내를 표시합니다.

Tailscale CLI가 없어도 되는 방법 순서:

1. **Cloudflare Quick Tunnel** (계정/CLI 설치 불필요, 이 머신에 `cloudflared`가 이미 있음):
   ```bash
   npm run dev                                  # 터미널 1
   cloudflared tunnel --url http://localhost:3000 # 터미널 2
   ```
   출력되는 `https://<random>.trycloudflare.com` 주소를 Quest Browser에서 엽니다.
2. **GitHub Pages**: `https://acidsound.github.io/soma-xr/` 도 HTTPS입니다. 변경사항을
   `main`에 푸시하면 같은 주소에서 새 빌드를 사용할 수 있습니다.
3. **USB + adb** (`adb`가 설치돼 있을 때): `adb reverse tcp:3000 tcp:3000` 후
   Quest Browser에서 `http://localhost:3000` 접속 (localhost는 secure context)
4. **로컬 서버를 직접 TLS로 실행**:
   `TLS_KEY_PATH=/path/key.pem TLS_CERT_PATH=/path/cert.pem npm run dev`

Vite 8은 기본적으로 tunnel 호스트를 차단하므로 `vite.config.ts`에
`server.allowedHosts: true`를 설정해 두었습니다.

기본 세션 모드는 `immersive-vr`이며, AR 패스스루가 필요하면 URL에 `?xrmode=ar`을 붙입니다.

## XR 조작 (VRChat 스타일)

`src/xr/XrStickLocomotion.ts`가 매 프레임 컨트롤러 게임패드(xr-standard, 축 2/3)를 읽어
이동을 처리합니다. 모든 이동은 카메라가 아니라 플레이어 리그(`XrPlayerRig`)에 적용되므로
룸스케일 위치가 그대로 유지됩니다.

| 입력 | 동작 |
| --- | --- |
| 왼손 스틱 | 헤드셋이 보는 방향 기준 부드러운 이동 (전후/좌우, 최대 2.2 m/s) |
| 오른손 스틱 좌/우 | 스냅턴 30° (한 번 기울일 때 1회, 중립으로 돌아와야 재장전) |
| 오른손 스틱 아래로 | 바닥에 텔레포트 지점 표시 → 놓으면 그 자리로 이동 |
| 오른손 그립 / 주먹 제스처 | 손목 방사형 메뉴 (기존 동작) |
| 트리거 | 놀이터 기구/바닥 선택 (텔레포트 조준 중에는 무시) |

- 스냅턴은 리그를 회전시킨 뒤 머리 위치가 그대로 남도록 리그를 다시 평행이동합니다
  (`XrLocomotion.snapTurn`). 리그 원점이 아니라 헤드셋을 축으로 돌기 때문에 룸스케일에서
  사용자가 옆으로 밀리지 않습니다.
- 텔레포트 조준 중에는 부드러운 이동이 잠기고, 조준 레이가 바닥에 닿지 않으면 마커가 사라집니다.
  손 트래킹처럼 컨트롤러 레이가 없으면 시선 레이로 대체합니다.
- 데스크톱에서 `Enter XR`을 누르면 헤드셋이 없을 때 시뮬레이터로 실행됩니다. 시뮬레이터에서는
  `window.__playground.setSticks({x,y}, {x,y})`로 스틱 입력을 주입해 이동/스냅턴/텔레포트를
  그대로 확인할 수 있습니다 (`y: -1`이 앞, 오른쪽 스틱 `y: 1`이 텔레포트).

