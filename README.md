# LAST LIGHT / 余晖

A small cooperative planetary exploration game built with TypeScript, Three.js, Rapier, Colyseus and Blender.

This repository preserves the playable planetary expedition before the next gameplay expansion. Version **v0.1.0** includes a 1.6 km landscape, low-gravity movement, a jetpack, first/third-person cameras, three shared beacons, crystal fuel pickups, upgrades, Earthrise, a ringed planet, and Moonrise.

## Run

```sh
npm ci
npm run space:dev
# In a second terminal:
npm run space:server
```

Open http://127.0.0.1:5180. Solo runs in the browser; cooperative play requires the room server. The game directory retains its original path so scripts and tests stay reproducible.

```sh
npm run space:test
npm run space:build
npm run space:ui -- --trace off
```

[Game documentation](frontend/space-escape/README.md) · [Verification](docs/space-escape/planet-verification.md) · [Live demo](https://last-light-space.vercel.app)

The live demo uses Vercel for static files and a temporary Cloudflare tunnel for a local room server. It is not a permanently hosted multiplayer service.

Generated Blender models, source asset scripts, music and attribution files are included. The release contains a gameplay video. Credentials, generated builds, dependencies, and local runtime files are excluded.
