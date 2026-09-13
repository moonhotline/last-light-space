# Planet expedition verification — 2026-09-13

## Delivered behavior

- A freely navigable 1.6 km basin with a canyon, crater, ruined observatory, and elevated summit.
- One Rapier character controller with first/third-person cameras, terrain/monument obstruction, low gravity, momentum, dash, finite jet fuel, ground recharge and crystal refills.
- Three shared beacons: stronger jetpack, two rising thermals, then a completed constellation and moonrise. Exploration continues after completion; the host can reopen the expedition record and restart.
- Server-owned crystal timers, combo state, beacon charging, upgrades, markers and celestial time. Four-player lobby limits, host succession, input queue limits, client prediction/replay and remote interpolation remain intact.
- Earth and Moon textures; art-directed gas giant and rings; shared astronomical sky rendered separately to avoid depth artifacts at astronomical distances. Original Blender explorer, beacon, observatory and lander. Layered original music, jet sound, footsteps, pickups, impacts, trails, and adjustable camera feedback.

## Validation

- `npm run space:test`: **14 passed**. Finite fuel, jump/landing, dash cooldown, crystal timers, input validation/flood limits, beacon prerequisites, cooperative charge, upgrades, completion/free roaming, thermals, camera ray obstruction, markers and recall.
- `npm run space:build`: passed. Rapier's WASM bundle still produces a large-chunk warning; physics is dynamically loaded when an expedition starts.
- `npm run space:ui -- --trace off`: **6 passed**. Real desktop and touch inputs, both cameras, self-avatar hiding, reduced feedback, menu pause/leave, four-player capacity/host transfer, and a full two-browser expedition with restart.
- Public Vercel URL: **3 passed** for four-player room capacity, mobile movement/jetpack/camera, and full two-browser mission over the public Cloudflare WSS endpoint, including shared upgrades, Earthrise, Moonrise, marking and restart.
- Public test command: `SPACE_WEB_URL=https://last-light-space.vercel.app SPACE_ROOM_URL=wss://export-league-being-acer.trycloudflare.com SPACE_BROWSER_PROXY=http://127.0.0.1:7890 npm run space:ui -- --trace off -g 'complete planetary|mobile layout|four players'`.
- The final cosmetic revision improves distant mountain silhouettes and the visible illuminated side of Earth; its complete real-input recording and final production smoke check supplement the public mission checks.

The tests and recording only read `window.__lastLight`; they do not teleport, inject pickups, advance world time, or edit authoritative state. A camera obstruction test turns the actual view upward until terrain shortens the camera segment. The mission pilot steers while airborne and waits to land before resonance.

## Evidence

- `planet-landing.png`: actual landing screen.
- `planet-mobile-landing.png`, `planet-mobile-game.png`: mobile viewport checks.
- `planet-beacon-earth.png`, `planet-observatory.png`, `planet-summit.png`: snapshots during the two-player mission.
- `planet-expedition.mp4`: actual solo keyboard traversal, edited to approximately 1.61× speed, with the original music layer mixed in by FFmpeg.
- `planet-panorama.png`, `planet-moonrise.png`: summit views from the final recording.
- `planet-recording.json`: authoritative beacon activation times and recording method.

## Deployment and limits

Production URL: https://last-light-space.vercel.app

Public room service / alternative same-origin webpage: https://export-league-being-acer.trycloudflare.com

Static files are on the existing free Vercel project. Colyseus and the free Cloudflare Quick Tunnel run on this computer. Multiplayer therefore depends on the computer and both processes staying online; restarting the tunnel changes its hostname. Solo remains available from Vercel when the room service is offline. Rooms are temporary and do not resume after disconnect.

Vercel's direct connection timed out from this machine; the user's existing proxy at 127.0.0.1:7890 succeeded. Cloudflare health succeeded directly. These checks do not establish availability on every mainland China network.

Local recorded rendering reached approximately 60 FPS at 1280 × 720 on this machine; this is not a claim for all devices. Browser tests and video capture should run sequentially: simultaneous GPU-intensive recording and multiple browser renderers can substantially slow shader compilation.

The scene uses cinematic composition and stylized real-time materials. It is a browser prototype, not an offline path-traced film render or a full production open-world game. Full-planet gravity, terrain streaming, spaceflight, accounts, persistent progression, reconnect, and a permanently hosted room server are outside this version.

## Final published revision

- Deployment: `dpl_GGWjjUrLfSXy5yn8cc8F8odtiWq8`, production Ready.
- Version URL: https://last-light-space-3p3u823tt-moonhotline-9118s-projects.vercel.app
- Production HTML matched the local build byte-for-byte. SHA-256: `e91a29c1c645de871d846f2b72235eadf3ac23ed489f9788e08d9c973d17ebdd`.
- Final production smoke: actual movement and first-person switch passed; **zero page/console errors, zero HTTP failures**, audio context running. Detailed evidence: `planet-production-smoke.json`.
- Final real-input video: **61.97 seconds**, 1280 × 720, approximately 14.35 MB. Final recording reported 60 FPS and no runtime errors; public smoke reported 52 FPS at 1440 × 900.
- Recorded beacon activations: 12.37 s, 32.97 s, 57.67 s of game time. These are a scripted experienced route, not a claim about first-time player completion speed.
