# Echo Protocol v0.2.0 verification — 2026-09-14

## Result

The complete cooperative chapter passed using real keyboard/UI input in two Chromium contexts. The journey recovered all three archives, mined repair materials, used the grapple, defeated three drones, recovered the core, repaired the skiff, boarded a pilot and a passenger, flew to the grove, landed, disembarked, and restarted the room. Diagnostics were read-only; no browser-side teleport, inventory injection, or mission-state mutation was used.

## Checks

- `npm run space:test`: 25 passed, covering existing movement/beacons and new grapple, line of sight, harvesting, locked core, combat/dodging, healing, repair contributions, seats, pilot authority, swept flight collision, unique-item recovery, and chapter completion.
- `npm run space:build`: TypeScript and production build passed. Vite still warns about large Three.js/Rapier chunks; this is a load-size limitation, not a failed build.
- Local room capacity/commands: 2 passed (four-player capacity, fifth-player rejection, host replacement, and record-close followed immediately by recall).
- Local full two-browser mission: passed in about 2.5 minutes on an automated experienced route. This does not establish a 15–20 minute first-play duration.
- Final local desktop/mobile UI checks: 3 passed (movement, jetpack, both cameras, camera collision, feedback controls, touch controls, non-overlapping action buttons, firing and inventory). The legacy fixed-port shared-origin test was skipped when testing an explicitly supplied URL.
- Production at https://last-light-space.vercel.app: 3 desktop/mobile UI tests passed; a separate two-browser connection test passed, verifying shared movement, buffered E interaction, synchronized lore, 12 inventory slots, and first-person self-hiding.
- Production HTML SHA256 matched the local build. `connection.json` points to the verified v0.2.0 room service.
- Asset generation and recording scripts passed Python/Node syntax checks. Browser logs and public HTTP checks recorded zero errors/failures in the successful smoke run.

## Evidence

- `echo-mission-verification.json`: completed mission state, actual-input declaration, and rendering counters. The final local 1280×800 sample reported 60 FPS, 130 draw calls, approximately 462k triangles, and running audio. This is a sample on the development machine, not a performance guarantee.
- `echo-production-smoke.json`: final public client checks and errors.
- `echo-*.png`: inventory, grapple, laboratory, outpost, repaired ship, flight, grove arrival, desktop and mobile views.
- GitHub release attachment `echo-expedition.mp4`: 148.16 seconds, 1280×800 H.264 video with original soundtrack. The full-input recording preceded the final mobile button separation and compact flight HUD polish; those final UI changes were checked separately on the production build.

## Deployment

- Vercel project: `last-light-space`.
- Production deployment: `dpl_9NsSVTnWq3vEfp114XnfBj1JA8Xt`.
- Game: https://last-light-space.vercel.app
- Current room service and alternate same-origin game: https://consensus-platforms-expenditures-boys.trycloudflare.com
- The room process uses local port 2569. The temporary tunnel and room process must stay running; restarting the tunnel requires updating the frontend connection configuration. Existing custom-domain aliases were left to the project's Vercel configuration.

## Scope and limitations

This release is the first shipwreck adventure chapter. Building, farming, logging, persistent worlds, reconnect, and interplanetary travel are not implemented. Six typed inventory stacks occupy a 12-slot interface; there is no drag-and-drop/trading system. Art is an original stylized real-time browser scene, not a film-render-quality claim. The scene uses artistic celestial scale.
