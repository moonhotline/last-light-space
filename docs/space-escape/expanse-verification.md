# Beneath the Rings v0.3.0 verification — 2026-09-18

## Result

The planetary scene and explorer model were rebuilt around the supplied visual direction. The walkable square is 3.58 km across, approximately 12.82 km² and five times the v0.2 map area. The original mission route remains compact while the surrounding snowfield, red-rock rift, ice plateau, mountain chains, towers, spires and arch provide new flight and free-roam space.

The PEREGRINE-07 astronaut is an original Blender Armature asset with 16 semantic bones and rigid armor attached to articulated joints. It includes idle, low-gravity walk and jetpack actions. The game continues to drive body, head, shoulder, elbow, hip and knee motion from authoritative player state.

## Evidence

- `explorer-v3-cycles.png`: 1024×1024 Cycles look-development render.
- `explorer-v3-motion.json`: Blender inventory, hierarchy, orientation, model bounds, animation ranges and sampled foot contact. Resting sole compression is 1.27 cm, within the 2 cm review threshold.
- `expanded-scene.png`: built-game desktop capture with the new astronaut and terrain.
- `expanded-scene-verification.json`: 3.58 km world and all 16 runtime bones detected, no browser errors, nonblank canvas. The development-machine sample reported 60 FPS, 384 draw calls and approximately 1.22 million triangles; it is not a device-wide performance guarantee.

## Checks

- `npm run space:test`: 26 passed, including the exact five-times-area check and all existing adventure, combat, grapple, flight and collision rules.
- `npm run space:build`: TypeScript and Vite production build passed. The existing large Three.js/Rapier chunk warning remains.
- Built desktop/mobile gameplay: 3 passed; one explicit-URL-inapplicable shared-origin test skipped. Third-person avatar, both camera modes, jetpack, movement feedback, camera collision, touch controls and inventory were exercised.
- Blender 5.2.1 loaded the editable source and confirmed 58 mesh objects, 16 bones, three animation actions, +Z up and the expected glTF forward conversion.

## Scope

This update expands scene composition and traversal space; it does not add a second mission chain to every new biome. Multiplayer still depends on a temporary room service. Persistent worlds, building, farming and a second planet remain future work.
