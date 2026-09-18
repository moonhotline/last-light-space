# LAST LIGHT / 余晖 — 回声协议

A cooperative browser expedition built with TypeScript, Three.js, Rapier, Colyseus and Blender.

**v0.3.0 · Beneath the Rings**: the Echo Protocol expedition now unfolds across a 3.58 km authored basin, five times the prior explorable area. Polar snowfields, red-rock rifts, ice plateaus, distant towers and the ringed giant frame the original cooperative chapter. The PEREGRINE-07 explorer is rebuilt as a 16-bone Blender Armature with articulated runtime motion and three authored animation clips. Up to four players, one pilot and three passengers. Solo uses the same game rules locally.

[Play](https://last-light-space.vercel.app) · [Chapter rules and controls](docs/space-escape/echo-design.md) · [Verification](docs/space-escape/echo-verification.md) · [v0.1.0 baseline](https://github.com/moonhotline/last-light-space/releases/tag/v0.1.0)

```sh
npm ci
npm run space:dev
# In a second terminal:
npm run space:server
```

Open http://127.0.0.1:5180. To serve a production build and rooms from one origin:

```sh
npm run space:build
npm run space:server
# http://127.0.0.1:2567
```

```sh
npm run space:test
npm run space:ui -- --trace off
# To test an existing built server:
SPACE_WEB_URL=http://127.0.0.1:2567 SPACE_ROOM_URL=ws://127.0.0.1:2567 npm run space:ui -- --trace off
```

Q toggles the grapple, C dashes, Space jumps/jets, left mouse or T fires the pulse tool, E reads/repairs/boards, Tab opens inventory and lore, G uses repair gel, V changes camera. Aboard: WASD thrust, Space ascent, X descent, Shift brake, E safe disembarkation. B recalls to the latest beacon with your inventory.

The landscape retains three optional upgrade beacons, Earthrise, a ringed giant, and Moonrise. New Blender source assets include an articulated suit, a twin-engine skiff, and a walkable abandoned laboratory. Generated GLBs, original music, attribution, and source asset scripts are included.

The playable terrain is now 3.58 km across (about 12.82 km², five times the prior area). Regenerate the current astronaut GLB, editable Blender source and Cycles portrait with `blender --background --python frontend/space-escape/scripts/generate_explorer_v3.py`; inspect its hierarchy, bounds and sampled actions with `inspect_explorer_v3.py`.

The live frontend uses Vercel; multiplayer still depends on a local Node room server and a temporary Cloudflare tunnel. It is not a permanently hosted multiplayer service. Expeditions are not saved across sessions. Building, farming, persistent worlds, reconnect, and a second planet remain future work.

Vercel Git deployments use the repository-root `vercel.json` to build the game and publish only `frontend/space-escape/dist`. Set `SPACE_ROOM_URL` in each deployed Vercel environment to the public `wss://` endpoint; the build writes `connection.json` without caching. After restarting the temporary tunnel, update that variable and redeploy. Missing or invalid room configuration fails the build instead of publishing an unusable multiplayer endpoint.

`docs/source-snapshot.json` describes the original v0.1.0 import; it is not a checksum manifest for later versions. Baseline verification and screenshots remain under `docs/space-escape/planet-*`; chapter evidence uses `echo-*`.

With the built room server running, `npm run space:record` records the complete chapter and exports an MP4 with FFmpeg. Set `SPACE_WEB_URL` if the built room server uses another origin.
