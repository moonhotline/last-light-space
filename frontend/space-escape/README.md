# LAST LIGHT / 余晖 · 星球远征

A 1.6 km browser planet built around low-gravity movement, shared discoveries, and three ancient beacons. TypeScript, Three.js, Rapier, and Colyseus. The game remains separate from the Tokener dashboard.

## Play

- `npm run space:dev` — frontend at http://127.0.0.1:5180
- `npm run space:server` — authoritative room service at http://127.0.0.1:2567
- `npm run space:build` — typed production build; the room server also serves it.
- Solo simulation runs in the browser; cooperative rooms support up to four explorers.

WASD moves; Shift runs; tap Space to jump and hold it to fly. Q dashes, E resonates with a nearby beacon, V switches cameras, R places a shared route marker, B recalls to a checkpoint, H hides the HUD, Escape opens the menu. Arrow keys or J/L turn; I/K look up/down. Touch controls provide movement, jetpack, dash, interaction, marking, and camera switching.

## Expedition

Crystals refill 34 fuel and extend a seven-second collection combo. Each crystal returns after 32 seconds. The jetpack uses 20 fuel/second and refills while grounded. A dash costs 16 fuel with a 1.5-second cooldown.

The first beacon increases fuel capacity from 100 to 150 and increases jet thrust. The second opens two rising thermals. The third completes the shared star map and starts moonrise. Continue exploring from the completion screen; the menu's expedition record can restart the room. Holding E charges a beacon for three seconds; teammates contribute simultaneously. One explorer can finish all objectives. Recall is available without a penalty.

Earthrise starts when any explorer exits the first canyon. All clients use the authoritative world clock for the same celestial phase. The ringed planet uses an art-directed Saturn-like appearance; this is a fictional sky, not a physical Solar System simulation.

## Structure

- `shared/map.ts`: authored paths, 256 × 256 terrain cells, landmarks, crystals and rocks. Physics and rendering share the exact terrain vertices and triangle interpolation.
- `shared/physics.ts`: capsule movement, momentum, low gravity, fuel, dash, thermals, collision and camera obstruction queries.
- `shared/simulation.ts`: server-owned pickups, beacon progress, upgrades, checkpoints, markers and shared time.
- `src/scene.ts`: a separate depth range for the astronomical sky, terrain, GLB assets, interpolated avatars, bloom, particles, cameras and layered audio.
- `src/main.ts`: desktop/touch controls, solo/cooperative sessions, prediction/replay, HUD and menus. `window.__lastLight` exposes read-only diagnostics for real-input QA.

## Original assets

`/Applications/Blender.app/Contents/MacOS/Blender -b --python frontend/space-escape/scripts/generate_planet_assets.py` rebuilds the astronaut with animated limb pivots, beacon, ruined observatory, and lander as GLB. `node frontend/space-escape/scripts/generate-planet-audio.mjs` creates three original 48-second music layers. Runtime synthesizers supply movement and interaction sounds.

Earth and Moon texture sources are listed in `public/assets/ATTRIBUTION.md`. The rest of the landscape, rings, gas-giant bands, particles and sky are procedural.

## Checks and video

- `npm run space:test` — deterministic authoritative gameplay tests.
- `npm run space:ui -- --trace off` — real keyboard/touch and two-browser expedition, plus four-player room capacity.
- `npm run space:record` — records actual keyboard traversal and exports `docs/space-escape/planet-expedition.mp4` with FFmpeg. No teleporting or simulation injection.

## Free demo deployment

The existing Vercel project `last-light-space` serves static files. The Colyseus process runs locally behind a free Cloudflare Quick Tunnel. This avoids a purchased server, but multiplayer requires this computer, room process and tunnel to stay running. A restarted Quick Tunnel changes its public hostname, requiring frontend connection configuration to be redeployed. This setup provides no guarantee of availability across mainland China networks.

`npm run space:prepare-vercel -- wss://ACTUAL-TUNNEL-HOST` verifies the public room health endpoint and prepares Vercel Build Output. Deploy with `npx vercel deploy --prebuilt --prod --yes --scope moonhotline-9118s-projects --cwd frontend/space-escape` after legitimate CLI login. The preparer copies only the built game, never private runtime files.

Rooms are ephemeral; reconnect/resume, persistent inventory, accounts, planetary streaming, and spaceflight are outside this prototype.
