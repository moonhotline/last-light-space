# Architecture Map & Convergence Status

Baseline commit: `de4c0ab` (`origin/main`)
Branch: `refactor/arch-convergence`

## 1. System Topology & Enforced Layer Boundaries

Strict acyclic dependency direction (enforced by `npm run space:check` / `scripts/check-architecture.mjs`):

```text
  src/ (Browser Client, Three.js WebGL, Audio, DOM HUD)
    |
    v
  shared/ (Deterministic Simulation, Rapier Physics, Terrain, Celestial, Wire Contracts, RoomSession)
    ^
    |
  server/ (Colyseus Node Server)    party/ (PartyKit & Cloudflare PartyServer Workers)
```

### Enforced Architectural Rules (`scripts/check-architecture.mjs`)
1. **Zero Circular Dependencies**: Runtime and type-only import graph across `shared/`, `src/`, `server/`, and `party/` is a strict DAG (0 cycles).
2. **Layer Boundaries**:
   - `shared/` never imports `src/`, `server/`, or `party/`, and is strictly DOM-free (`window`, `document`, `localStorage`, `HTMLElement`, etc. forbidden).
   - `shared/types.ts` is the wire-contract leaf: never depends on `simulation.ts`, `physics.ts`, `adventure.ts`, or `fighter-recall.ts`.
   - `server/` and `party/` never import `src/`; `src/` never imports `server/` or `party/`.
3. **Lazy Physics Chunk Isolation**: `src/` never statically reaches `shared/physics.ts` (directly or transitively via `shared/simulation.ts` / `shared/room-session.ts`), preserving dynamic `import("../shared/physics")` code-splitting of the ~2.87 MB Rapier WASM chunk.
4. **Canonical Room Protocol**: `server/index.ts`, `party/index.ts`, and `party/worker.ts` all delegate to `RoomSession` (`shared/room-session.ts`) and never duplicate action cooldown or chat rules.
5. **Single Source of Truth**: Warp gate IDs (`WARP_GATE_IDS`) and yaw angles (`warpGateYaw`) live solely in `shared/celestial.ts`; `Vec3 = Vec` (`shared/map.ts`); `PLAYER_COLORS`, `MAX_PLAYERS`, `fuelCapacity` live in `shared/types.ts`; `resolvePilotFlightState` and `loadGltfWithRetry` live in `src/asset-loader.ts`.
6. **Zero Unsafe HTML Sinks**: Zero `.innerHTML`/`.outerHTML` assignments (including compound/bracket forms), `.insertAdjacentHTML(`, `.setHTMLUnsafe(`, `.createContextualFragment(`, or `document.write(` calls in `frontend/space-escape/src/`.
7. **Zero Emoji Policy**: Zero emoji code points across TS source, HTML, CSS, `README.md`, `AGENTS.md`, `MEMORY.md`, and `docs/architecture/*.md` (per `AGENTS.md`).

## 2. Converged Module Inventory (15,148 LOC across 48 TS files, 47 runtime/type modules + 1 `.d.ts`)

### `shared/` (23 files, 5,686 LOC)
| Module | LOC | Responsibility | Status |
| --- | ---: | --- | --- |
| `types.ts` | 253 | Wire/snapshot contracts, `MAX_PLAYERS`, `PLAYER_COLORS`, `fuelCapacity`, `FighterRecall`, `PhysicsQueries`, `SimulationHost`, `parseInput` | Leaf SSOT |
| `home-planet.ts` | 21 | Physical home globe constants (`HOME_PLANET_SPHERE`, `HOME_COLLAR_RADIUS`, `homeSphereHeight`) | Clean SSOT |
| `map.ts` | 457 | Authored Kepler basin + stitched polar shelf `terrainMesh()`, `Vec`, `groundAt`, beacons, crystals, rocks | Clean |
| `celestial.ts` | 492 | `SOLAR_SYSTEM` catalog, `WARP_GATE_IDS`, `warpGateYaw`, `celestialCapture`, `sphericalGravity`, `geodesicArcDistance` | Clean SSOT |
| `celestial-flight.ts` | 35 | Spherical flight reference frame & cockpit pose | Clean |
| `surface.ts` | 31 | Spherical player surface frame, `eyePosition`, `viewDirection` | Clean |
| `portals.ts` | 34 | Portal constants, color alternation, frame/rotation math | Clean |
| `adventure-data.ts` | 189 | Items, repair recipe, fleet specs, lore, resource sites, lab geometry | Clean |
| `colliders.ts` | 308 | Static & dynamic collider specs (consumes `WARP_GATE_IDS`, `warpGateYaw`, re-exports `HOME_PLANET_SPHERE`) | Clean |
| `physics.ts` | 976 | `MovementWorld` (Rapier world, unified `syncQueryPipeline` & `stepLocomotionState`, stitched home globe, portals, ship shape casts) | Deduplicated |
| `adventure.ts` | 795 | Tool/mining, ship boarding/flight, warp gates, drones (depends on `SimulationHost`) | Acyclic |
| `fighter-recall.ts` | 159 | Autonomous light-fighter recall state machine (depends on `SimulationHost`) | Acyclic |
| `simulation.ts` | 368 | Authoritative 30 Hz `Simulation` loop | Acyclic |
| `room-session.ts` | 211 | Canonical multiplayer `RoomSession`, `roomHealthPayload`, action & chat cooldowns, chat sanitization, snapshot stride | New SSOT |
| `objectives.ts` | 91 | Mission objective state derivation | Clean |
| `entity-system.ts` | 128 | ECS Lite framework | Unwired; tested & OKF-tracked (pending product decision) |
| `expedition.ts` | 118 | Multi-planetary companion expedition state | Unwired; tested (pending product decision) |
| `interplanetary-nav.ts` | 195 | Hohmann transfer & autopilot waypoints | Unwired; tested & OKF-tracked (pending product decision) |
| `lod-culling.ts` | 209 | Frustum culling & lazy asset scheduler | Unwired; tested & OKF-tracked (pending product decision) |
| `mineral-system.ts` | 101 | Geological mineral resonance scanner | Unwired; tested (pending product decision) |
| `npc-ai.ts` | 304 | Reynolds steering & tactical NPC agent | Unwired; tested & OKF-tracked (pending product decision) |
| `perf-benchmark.ts` | 95 | Microsecond latency benchmark harness | Unwired; tested & OKF-tracked (pending product decision) |
| `tick-engine.ts` | 116 | Hermite spline `SnapshotInterpolator` | Unwired; tested (pending product decision) |

### `server/` & `party/` (4 files, 323 LOC — down from 463 LOC)
| Module | LOC | Responsibility | Status |
| --- | ---: | --- | --- |
| `server/index.ts` | 87 | Thin Express + Colyseus WebSocket adapter over `RoomSession` | Converged (now supports chat) |
| `party/runtime.ts` | 52 | Shared Cloudflare workerd polyfills, Rapier WASM init, wire JSON encode/decode | New canonical helper |
| `party/index.ts` | 80 | Thin legacy PartyKit adapter over `RoomSession` + `party/runtime.ts` | Converged |
| `party/worker.ts` | 104 | Thin Cloudflare PartyServer Durable Object adapter over `RoomSession` + `party/runtime.ts` | Converged (15 Hz snapshot stride aligned) |

### `src/` (21 files, 9,139 LOC)
| Module | LOC | Responsibility | Status |
| --- | ---: | --- | --- |
| `main.ts` | 1,167 | Entry point, input loop, session lifecycle, photo capture, client prediction, `window.__lastLight` debug API (down from 1,779 LOC) | Decomposed |
| `hud-controller.ts` | 393 | `HudController`, `computeInteractionPrompt`, `formatClock`, safe DOM `renderResult` | Extracted from `main.ts` |
| `feedback-panel.ts` | 199 | Safe DOM feedback/echoes panel with strict `data:image/` validation | Extracted from `main.ts` |
| `chat-console.ts` | 171 | Safe DOM chat console (capped log) & solo slash commands | Extracted from `main.ts` |
| `stunt-tracker.ts` | 144 | Encapsulated hoverboard stunt & combo telemetry state machine | Extracted from `main.ts` |
| `party-room.ts` | 202 | Client WebSocket / Colyseus adapter (open-state send guard) + canonical `resolveRoomEndpoint` | Converged |
| `scene.ts` | 1,380 | `GameView` orchestrator, camera/tools, snapshot capture, particles, audio, post-processing (down from 2,550 LOC) | Decomposed |
| `world-environment.ts` | 595 | Stitched basin terrain (`polygonOffset`), instanced rocks, converged home globe, cosmic sky, thermal updrafts | Extracted from `scene.ts` |
| `avatar-system.ts` | 442 | `AvatarSystem`: Mixamo rigs, animations, hoverboard kickflip, nameplates, equipment visibility, despawn disposal | Extracted from `scene.ts` |
| `stardust-stream.ts` | 196 | `StardustParallaxStream` 3-layer high-speed flight parallax VFX | Extracted from `scene.ts` |
| `asset-loader.ts` | 83 | `loadGltfWithRetry`, `createRadialGlowTexture`, `resolvePilotFlightState`, GLB export & download helpers | Extracted from `scene.ts` / `adventure-view.ts` |
| `interplanetary.ts` | 1,008 | Solar system meshes, ship transforms, Blerk companion, progressive GLTF hydration | Uses canonical `geodesicArcDistance` & `warpGateYaw` |
| `thruster-fx.ts` | 825 | Volumetric ship propulsion & retro-brake VFX | Cohesive |
| `celestial-visuals.ts` | 683 | Procedural planet textures, landmarks, atmosphere shader, rings, warp gate mesh | Cohesive |
| `adventure-view.ts` | 600 | Ship, lab, lore, nodes, drones, weapon tracers | Uses `loadGltfWithRetry` & `resolvePilotFlightState` |
| `sound-engine.ts` | 529 | `CosmicAudioEngine` (ship 4-layer propulsion, warp resonance, generative chords, UI clicks) | Cohesive |
| `model-viewer.ts` | 224 | Standalone model inspection page | Standalone dev tool |
| `portal-view.ts` | 191 | Oblique-frustum portal RTT renderer | Cohesive |
| `party-types.d.ts` | 51 | Ambient module declarations (`partysocket` dead declaration removed) | Clean |
| `weathering.ts` | 38 | Material patina shader hook | Cohesive |
| `equipment-model.ts` | 18 | First-person equipment normalization | Cohesive |

## 3. Converged State Ownership Map

| State Domain | Authoritative Owner | Invariant |
| --- | --- | --- |
| World & Gameplay State (`Snapshot`) | `Simulation` (`shared/simulation.ts`) | Deterministic 30 Hz authoritative simulation; client prediction clones `Player` into `MovementWorld` |
| Room Protocol State (cooldowns, capacity, restart, chat, snapshot stride) | `RoomSession` (`shared/room-session.ts`) | Single implementation shared by Colyseus, PartyKit, and Cloudflare PartyServer |
| Client Session & Input Loop | `src/main.ts` | Delegates HUD, chat, feedback, stunts, and endpoint resolution to cohesive modules |
| Stunt Scoring Telemetry | `StuntTracker` (`src/stunt-tracker.ts`) | Explicit `reset()` clears all session state cleanly on reconnect/leave |
| Feedback / Echoes Storage | `setupFeedbackPanel` (`src/feedback-panel.ts`) | Safe DOM construction + strict `SAFE_DATA_IMAGE_RE` validation |
| Hosted Endpoint Config | `resolveRoomEndpoint` (`src/party-room.ts`) | Node-safe pure resolver used by `src/main.ts` and verified in unit tests |
| Ship Visual / Audio Flight State | `resolvePilotFlightState` (`src/asset-loader.ts`) | Shared across `scene.ts` and `adventure-view.ts` |
| Player Avatars & Nameplates | `AvatarSystem` (`src/avatar-system.ts`) | Disposes canvas textures & materials on rename/despawn; headless-safe `document` guard |
