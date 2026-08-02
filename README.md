# Open Spatial Lab

Open Spatial Lab is a local Web of Worlds and spatial-computing demo. From the player lobby and launcher, an avatar can move among three authored Three.js destinations—Location A, Location B, and Denver Skyport—while preserving supported identity, equipment, pose, and portal state.

## What you get

- A launcher and player lobby
- Three authored destinations: Location A, Location B, and Denver Skyport
- Local world servers plus a simple one-command startup flow
- Avatar and equipment selection
- Browser-based verification and release checks

## Requirements

The tested setup is macOS 13+ and Ubuntu/WSL with:

- Git 2.33+
- Node.js 22.x and npm 10.x
- Bash, `curl`, and `lsof`
- A current Chrome, Chromium, Brave, or Edge browser

Before cloning, confirm:

```bash
git --version
node --version
npm --version
command -v curl
command -v lsof
```

## Repository layout

- `src/` — frontend server and topology orchestration
- `runtime/` — world-server and scene runtime
- `web/` — browser app, authored worlds, and runtime assets
- `tools/` — launcher helpers and verification scripts
- `wow-spec/` — WoW schema and validation code

## Quick start

There is no build step or separate preflight step.

### macOS / Linux

```bash
git clone https://github.com/grigb/open-spatial-lab.git
cd open-spatial-lab
npm ci
npm start
```

Then open http://127.0.0.1:8143/ in a supported browser.

### Ubuntu / WSL

```bash
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y bash curl lsof psmisc sed chromium-browser
npm ci
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
npm run start:ubuntu
```

`npm run start:ubuntu` is the Ubuntu/WSL entrypoint for this repo. It resolves the repository from its own location, clears stale listeners on the Ubuntu-side ports, and relaunches the app from the repository root.

If you want the browser checks too, run:

```bash
npm run demo-check
npm run render-adapter-check
```

### Common environment variables

- `PUPPETEER_EXECUTABLE_PATH` — browser path for the browser-based checks
- `OSL_FRONTEND_PORT` — frontend port (default `8143`)
- `OSL_BACKEND_A_PORT` / `B_PORT` / `LOBBY_PORT` / `AIRPORT_PORT` — backend ports

Startup completes with a receipt similar to:

```text
Open Spatial Lab is ready.
Launcher:            http://127.0.0.1:8143/
Lobby player:        http://127.0.0.1:8143/index.html?role=player&intro=bypass
Location A observer: http://127.0.0.1:8143/index.html?role=source&intro=bypass
Location B observer: http://127.0.0.1:8143/index.html?role=target&intro=bypass
```

## Five-minute demo

1. On the launcher, choose **Enter as Player** to enter the lobby. Select **Start exploring** if the orientation card appears.
2. Move with `W`, `A`, `S`, and `D`. Hold `Shift` to run, press `Space` to jump, drag to look around, scroll to zoom, and press `C` to switch camera view.
3. Choose **Switch avatar**, select an included avatar, one worn item, and one held item, then choose **Apply**. Continue moving to see the selection remain with the player.
4. Walk through a lit portal; crossing is automatic. Visit Location A and Location B and compare their scenes and local models.
5. Return to the lobby and walk through Portal C to enter Denver Skyport. Use its return portal to continue the journey.
6. Open **Views** to return to the launcher. Open the Location A and Location B observer views to show the two local world servers.

## Controls

- Walk: `W`, `A`, `S`, `D`
- Run: hold `Shift` while moving
- Jump: `Space`
- Look/orbit: drag the primary mouse button or use a one-finger drag
- Zoom: mouse wheel or trackpad scroll
- Camera: `C` or the camera button
- Portal: walk through a lit portal; no extra command is needed
- Launcher: arrow keys to move, `Home`/`End` for first/last, `Enter` or `Space` to open, and mouse selection
- Avatar selector: **Switch avatar**, choose an avatar plus one worn and one held item, then **Apply**; `Escape` or **Cancel** discards pending changes

## Verification

Useful commands from the repo root:

| Command | Purpose |
| --- | --- |
| `npm run verify` | Full release and demo verification |
| `npm run demo-check` | Browser-driven demo smoke test |
| `npm run render-adapter-check` | X3DOM/render-adapter regression suite |
| `npm run wowapi-smoke-check` | WoWAPI HTTP conformance smoke test |

### Notes

- `npm run verify` runs the release check and the demo check back to back.
- `npm run render-adapter-check` is the place to try the experimental X3DOM preview path.
- `npm run wowapi-smoke-check` is a fast, no-browser API smoke test.

If `RELEASE-MANIFEST.json` drifts out of sync with the file tree, regenerate it with:

```bash
npm run generate-release-manifest
```

## Stop and clean up

```bash
npm stop
```

The command stops the frontend and every local world server, removes runtime PID files, and releases ports `8143` and `18151`–`18154`.

For a clean restart, including after a partial startup, run:

```bash
npm stop
npm start
```

## Troubleshooting

- **Unsupported Node or npm:** confirm `node --version` is 22.x and `npm --version` is 10.x.
- **Install fails:** confirm network access, remove `node_modules`, and run `npm ci` again.
- **A port is occupied:** run `npm stop`. If the message identifies an unrelated process, stop that application or choose another machine.
- **A page looks stale:** perform a hard refresh in the browser.
- **A service is not ready:** run `npm stop`, then `npm start` and use the newly printed URLs. The supported topology has exactly five listeners: frontend `8143` and world servers `18151`–`18154`.
- **Browser verification cannot find Chrome:** set `PUPPETEER_EXECUTABLE_PATH` to a compatible browser executable and rerun `npm run verify`.
- **`npm run release-check` reports a file-count or hash mismatch:** `RELEASE-MANIFEST.json` is out of sync with the actual file tree — run `npm run generate-release-manifest`, review the added/changed/removed list it prints, then rerun `npm run release-check`.

## Render-engine adapter (three.js + X3DOM, in progress)

The shipped demo still uses the default three.js path. The repo also includes an experimental X3DOM preview that can be selected with `?renderer=x3dom`.

What is working in that preview:

- The page boots a separate X3DOM entrypoint via `web/x3dom-live-mode.mjs`
- The environment renders through `X3DOMRenderAdapter`
- A real backend-connected avatar and orbit camera are active

What is intentionally not included yet:

- Equipment and full avatar-feature parity
- Portal traversal and first-person movement
- The richer portal-preview and HUD behaviors from the default three.js app

For the current status, run `npm run render-adapter-check` and try the preview at `http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass`.

## Planned improvements

These are future enhancements, not additional setup steps for the current demo, and no delivery dates are promised.

- Smoother continuous portal transitions and automatic two-way return paths
- Deeper Denver Skyport continuity and multi-world presence
- Clearer navigation, a more focused home launcher, and a spatial avatar carousel
- User, avatar, and storefront identity profiles with previews and proximity exchange
- Richer airport experiences, including interactive storefronts, a Gate A12 journey, and moving travelers
- Airport localization, spatial-content discovery, and augmented-reality overlays
- Broader multi-machine, real-device, unhappy-path, and sample-world coverage
- Completing the X3DOM render-engine option and wiring it into the live app with a user-facing renderer selector (see [Render-engine adapter](#render-engine-adapter-three-js--x3dom-in-progress))

## License and security

Source code is licensed under Apache-2.0. Bundled media has its own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `LICENSE`. See [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.
