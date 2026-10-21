# Turbo Trails

**Little cars. Big adventures.** A complete, kid-friendly 3D browser racer built with Three.js, HTML, CSS and JavaScript. All scenery, vehicles, particles, and sound effects are generated locally; fonts and Three.js are bundled with the app. No account, backend, advertising, API key, or external graphics CDN is required.

## Run locally

Use **Node.js 22.12+ or 24 LTS** and npm.

```sh
npm ci
npm run dev
```

Open the address printed by Vite in your browser. To play on a phone on the same Wi-Fi network, open the computer’s LAN address on port 5173; your firewall must allow it. Use a modern WebGL-capable browser. A local HTTP server is required; opening `index.html` as a `file://` URL will not load the JavaScript modules.

## One-file browser edition

`npm run build:single` creates **`dist/Turbo-Trails.html`**. This edition embeds all JavaScript, styles, fonts, and the icon in one file. Download or copy that file and open it directly in a modern WebGL-capable browser. It needs no extraction, installation, server, or network connection. The authored source `index.html` still uses the development server described above.

A ready-built copy is also included as **`Turbo-Trails.html`** in the repository root. On GitHub, open that file and choose **Download raw file**, then open the downloaded file in your desktop browser. After changing the game, rebuild the single-file edition and copy `dist/Turbo-Trails.html` over the root copy before publishing an update. GitHub Pages automatically builds a fresh copy during deployment.

```sh
npm test          # Driving, braking, frame-rate stability, and lap/checkpoint tests
npm run build    # Deployable static site in dist/
npm run preview  # Serve the production build locally
```

In a restricted cloud workspace, use `npm ci --cache /tmp/turbo-npm-cache` if the default npm cache is not writable.

## Play

- **Race day:** race three friendly AI drivers for three laps. Finish first to earn a trophy.
- **Free drive:** explore the island with no timer, competition, or lap requirements.
- **Time trial:** complete one lap to set a personal best. Pass all three yellow checkpoint flags in order before crossing the checkered line.

| Keyboard | Action |
| --- | --- |
| W / Up arrow | Accelerate |
| S / Down arrow | Brake, then reverse |
| A / Left arrow | Steer left |
| D / Right arrow | Steer right |
| Space | Handbrake |
| P / Escape | Pause / resume |

On phones and tablets, hold the large on-screen arrows. Multiple fingers can steer and accelerate together. Portrait and landscape both work; landscape gives you a wider view of the road. The pause menu includes **Back on track**, **Restart**, and **Back to the clubhouse**. A desktop recovery button is also available beneath the HUD.

Choose one of five car colors in the garage. Settings control audio and graphics quality. Automatic quality uses a lighter rendering preset on touch devices or low-core machines and drops quality after sustained slow rendering. Headlights and brake lights glow, wheels turn and spin, collisions gently slow the car, and handbraking or leaving the asphalt produces dust. A rolling chase camera follows the car with a short collision shake. Backgrounding or leaving the browser window pauses the game and clears all held inputs.

Sound begins after a button press to respect browser autoplay rules. Personal bests, trophies, car color, mute, and graphics preferences are saved in browser local storage when available. Private browsing/storage restrictions do not prevent playing.

## Browser tests

The Playwright checks use a real Chromium WebGL renderer. Install its browser once:

```sh
npx playwright install chromium
npm run test:browser
```

For an existing system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. Headless software rendering is slower than a real GPU; the test configuration reduces render resolution while keeping the layout dimensions unchanged. Native Safari, iOS, Android, and device performance should be checked on real devices before a public release.

## Publish on GitHub Pages

1. Commit and push this project to your GitHub repository’s `main` branch.
2. In the repository, open **Settings → Pages → Build and deployment** and choose **GitHub Actions**.
3. The included `.github/workflows/pages.yml` installs the locked dependencies, runs the unit tests, builds the game, and deploys `dist/`. Run the **Deploy to GitHub Pages** workflow manually if you enabled Pages after the first push.
4. Open the Pages address reported by the completed deployment.

Vite’s relative `base: './'` makes the game work at a repository subpath such as `/racing-game/`. You can also upload the contents of `dist/` to any static HTTPS host. The authored source uses separate files for maintainability; the self-contained deployment directory requires no npm installation for visitors.

## Source map

| File | Responsibility |
| --- | --- |
| `index.html`, `style.css` | Responsive menu, garage, settings, accessible dialogs, HUD, touch controls |
| `game.js` | Input, game state, AI, collisions, race lifecycle, camera, minimap, confetti, saved preferences |
| `world.js` | Procedural island, road, bridge, tunnel, buildings, trees, cars, lighting, batched scenery |
| `physics.js` | Frame-based vehicle integration and ordered checkpoint/lap validation |
| `audio.js` | Gesture-activated Web Audio engine and synthesized effects |
| `tests/` | Physics and browser integration tests |

The read-only `window.turboTrails.snapshot()` reports current game state for diagnostics and browser tests. It cannot change race state or car position.
