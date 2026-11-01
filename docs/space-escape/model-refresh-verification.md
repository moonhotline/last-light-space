# Model refresh — 2026-09-19

Implemented in `/Users/alexander/develop/github/tokener/frontend/space-escape`.

- Visible Blender 5.2 session driven through the installed Blender MCP add-on at localhost:9876.
- Editable scene: `frontend/space-escape/space-escape-assets.blend`; reproducible builder: `scripts/generate_combat_assets.py` within the game.
- GLBs: explorer, kinetic rifle, Echo grapple launcher, separate hook and cartridge. Smooth UV-sphere surfaces, beveled armor/hardware, UV-mapped material grain and independently articulated joints.
- Exported explorer clips: Idle, Run, Jetpack. Rifle clip: Reload. Runtime poses blend joints from actual velocity, grounded/jet state, aim pitch and reload phase.
- Equipment: 24-round magazine, rate-limited projectile fire, 1.8-second reload, recoil/bolt/magazine motion, grapple terrain hit, travel and release. Shared fixed-step state supports solo and client prediction.
- Controls: WASD / Shift movement, Space jetpack, V camera, left mouse fire, 1 rifle, 2 grapple, R reload, T route marker. Hold left mouse to reel with grapple; release to detach. Touch equipment controls are included.

Validation:

- `npm run space:build` passed (existing bundle-size warning remains).
- `npm run space:test`: 17 passed.
- `npm run space:ui -- --trace off equipment.spec.ts`: passed, including real mouse fire, quick-tap reload, running joint movement, jetpack altitude, first-person equipment and grapple release.
- `npm run space:ui -- --trace off game.spec.ts mission.spec.ts capacity.spec.ts`: 6 passed, including two-player full expedition and four-player room limit.
- Screenshots: `astronaut-running.png`, `astronaut-jetpack.png`, `kinetic-first-person.png`, `kinetic-reload.png`, `echo-grapple.png`, `blender-workshop.png`.

Deployment boundary:

The production Vercel alias `last-light-space.vercel.app` is currently the newer Echo Protocol version. Its source is `/Users/alexander/develop/github/last-light-space`, with inventory, drones, skiff flight and a larger map. The specified Tokener directory is an older expedition. Production was not overwritten; choosing which source to update was presented to the user. The newer repository remains untouched.

The Tokener checkout has no `.git` directory, so these local changes have not been committed.
