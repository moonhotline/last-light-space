# Architecture Map & Entropy Inventory

Baseline commit: `de4c0ab` (`origin/main`)
Branch: `refactor/arch-convergence`
Isolated worktree: `/Users/alexander/develop/github/worktrees/last-light-space/arch-convergence`

## 1. System Topology & Layer Boundaries

Target strict DAG dependency direction:

```text
  src/ (Browser Client, Three.js WebGL, Audio, DOM HUD)
    |
    v
  shared/ (Deterministic Simulation, Rapier Physics, Terrain, Celestial, Wire Contracts)
    ^
    |
  server/ (Colyseus Node Server)    party/ (PartyKit & Cloudflare PartyServer Workers)
```

### Target Rules
- `shared/` must be framework- and DOM-free (no `window`, `document`, `localStorage`, `src/`, `server/`, or `party/` imports).
- `shared/types.ts` is the wire-contract leaf: no runtime imports from `simulation.ts`, `physics.ts`, or `adventure.ts`.
- `server/` and `party/` are thin transport adapters over a single canonical `shared/room-session.ts`.
- `src/` owns rendering, Web Audio, input capture, client prediction orchestration, and DOM projection.

## 2. Baseline Module Inventory (14,379 LOC across 37 TS files)

### `shared/` (21 files, 5,115 LOC)
| Module | LOC | Responsibility | Status / Notes |
| --- | ---: | --- | --- |
| `types.ts` | 211 | Snapshot, Player, Input, Adventure wire types + `parseInput` | Cycle with `fighter-recall.ts` (`FighterRecall`) |
| `map.ts` | 324 | Procedural 3.58 km terrain mesh, `groundAt`, beacons, crystals, rocks | Defines `Vec` (duplicated as `Vec3` in `celestial.ts`) |
| `celestial.ts` | 469 | `SOLAR_SYSTEM` catalog, `celestialCapture`, `sphericalGravity`, `geodesicArcDistance` | Duplicates `Vec3`; missing canonical `WARP_GATE_IDS` / `warpGateYaw` |
| `celestial-flight.ts` | 35 | Spherical flight reference frame & cockpit pose | Clean |
| `surface.ts` | 31 | Spherical player surface frame, `eyePosition`, `viewDirection` | Clean |
| `portals.ts` | 34 | Portal constants, color alternation, frame/rotation math | Clean |
| `adventure-data.ts` | 189 | Items, repair recipe, fleet specs, lore, resource sites, lab geometry | Clean |
| `colliders.ts` | 321 | Static & dynamic collider specs | Duplicates warp gate ID list & yaw table |
| `physics.ts` | 947 | `MovementWorld` (Rapier world, player movement, portals, ship shape casts) | Duplicated kinematics (`move` vs `moveOnSphere`), duplicated query sync |
| `adventure.ts` | 775 | Tool/mining, ship boarding/flight, warp gates, drones | Cyclic dependency with `simulation.ts`; duplicates `WARP_ROUTE`, `fuelCapacity` |
| `fighter-recall.ts` | 166 | Autonomous light-fighter recall state machine | Cyclic dependencies with `types.ts` and `simulation.ts` |
| `simulation.ts` | 366 | Authoritative 30 Hz `Simulation` loop | Cyclic dependency with `adventure.ts` & `fighter-recall.ts` |
| `objectives.ts` | 91 | Mission objective state derivation | Clean |
| `entity-system.ts` | 128 | ECS Lite framework | Unwired in runtime; covered by tests & OKF (pending product decision) |
| `expedition.ts` | 118 | Multi-planetary companion expedition state | Unwired in runtime; covered by tests (pending product decision) |
| `interplanetary-nav.ts` | 195 | Hohmann transfer & autopilot waypoints | Unwired in runtime; covered by tests & OKF (pending product decision) |
| `lod-culling.ts` | 209 | Frustum culling & lazy asset scheduler | Unwired in runtime; covered by tests & OKF (pending product decision) |
| `mineral-system.ts` | 101 | Geological mineral resonance scanner | Unwired in runtime; covered by tests (pending product decision) |
| `npc-ai.ts` | 304 | Reynolds steering & tactical NPC agent | Unwired in runtime; covered by tests & OKF (pending product decision) |
| `perf-benchmark.ts` | 95 | Microsecond latency benchmark harness | Unwired in runtime; covered by tests & OKF (pending product decision) |
| `tick-engine.ts` | 116 | Hermite spline `SnapshotInterpolator` | Unwired in runtime; covered by tests (pending product decision) |

### `server/` & `party/` (3 files, 463 LOC)
| Module | LOC | Responsibility | Status / Notes |
| --- | ---: | --- | --- |
| `server/index.ts` | 108 | Local Express + Colyseus WebSocket server | Duplicates room protocol; missing `chat` handler |
| `party/index.ts` | 165 | Legacy PartyKit room worker | Duplicates room protocol, workerd polyfill, WASM loader |
| `party/worker.ts` | 190 | Production Cloudflare PartyServer Durable Object | Duplicates room protocol, workerd polyfill, WASM loader; drifted snapshot cadence (every tick vs stride 2) |

### `src/` (13 files, 8,801 LOC)
| Module | LOC | Responsibility | Status / Notes |
| --- | ---: | --- | --- |
| `main.ts` | 1,779 | Entry point, input, session, prediction, HUD, stunts, chat, feedback, debug API | God file; 45+ module globals; remote/stored XSS via `innerHTML`; inline endpoint resolution |
| `scene.ts` | 2,550 | `GameView`, `StardustParallaxStream`, sky, terrain, home globe, audio, avatars, particles, composer | God file; dead methods (`atmosphere`, `loadTexture`); dead fields (`hum`, `sounds`); duplicated retry loader & flight flags |
| `interplanetary.ts` | 1,021 | Solar system meshes, ship transforms, Blerk companion, progressive GLTF hydration | Duplicates `mercuryGeodesicDistance` and warp gate yaw table |
| `thruster-fx.ts` | 825 | Volumetric ship propulsion & retro-brake VFX | Cohesive |
| `celestial-visuals.ts` | 683 | Procedural planet textures, landmarks, atmosphere shader, rings, warp gate mesh | Cohesive |
| `adventure-view.ts` | 616 | Ship, lab, lore, nodes, drones, weapon tracers | Duplicates GLTF retry loader & pilot flight boosting/braking derivation |
| `sound-engine.ts` | 529 | `CosmicAudioEngine` (ship 4-layer propulsion, warp resonance, generative chords, UI clicks) | Split audio ownership with `scene.ts` |
| `model-viewer.ts` | 224 | Standalone model inspection page | Standalone dev tool |
| `portal-view.ts` | 191 | Oblique-frustum portal RTT renderer | Cohesive |
| `party-room.ts` | 156 | Client WebSocket / Colyseus adapter | Missing `resolveRoomEndpoint` ownership |
| `party-types.d.ts` | 61 | Ambient module declarations | Contains stale `partysocket` declaration |
| `weathering.ts` | 38 | Material patina shader hook | Cohesive |
| `equipment-model.ts` | 18 | First-person equipment normalization | Cohesive |

## 3. Baseline State Ownership Map

| State Domain | Authoritative Owner | Current Leaks / Drift |
| --- | --- | --- |
| World & Gameplay State (`Snapshot`) | `Simulation` (`shared/simulation.ts`) | Clean in solo/server; client prediction clones `Player` into `MovementWorld` |
| Room Protocol State (cooldowns, capacity, restart, chat) | None (triplicated) | Triplicated across `server/index.ts`, `party/index.ts`, `party/worker.ts` |
| Client Session & Input Loop | `src/main.ts` | Intertwined with stunt scoring, chat console, feedback storage, and DOM projection |
| Stunt Scoring Telemetry | `src/main.ts` globals | 15 loose module-level `let` variables |
| Feedback / Echoes Storage | `localStorage["kepler_echoes"]` | Rendered with raw `innerHTML` in `src/main.ts` |
| Hosted Endpoint Config | `connection.json` + `VITE_ROOM_URL` | Parsed inline in `src/main.ts` instead of `src/party-room.ts` |
| Ship Visual / Audio Flight State | `Snapshot.adventure.ship` + local pilot keys | Boosting/braking derivation duplicated in `main.ts`, `scene.ts`, `adventure-view.ts` |

## 4. Baseline Cycles & Norm Deviations

### Detected Circular Dependencies
1. `shared/adventure.ts` <-> `shared/simulation.ts`
2. `shared/fighter-recall.ts` <-> `shared/simulation.ts`
3. `shared/fighter-recall.ts` <-> `shared/types.ts`

### Security & Quality Deviations
1. **Remote XSS** in `src/main.ts:1514` (`addChatMessage` uses `item.innerHTML` with untrusted player `name` and `text`).
2. **Stored XSS** in `src/main.ts:1456` (`renderEchoes` uses `container.innerHTML` with `localStorage` author/text/img).
3. **Unused npm dependencies** in `package.json`: `colyseus.js`, `partysocket`, `gsap`, `tone`, `@tonejs/midi`, `pathfinding`, `@types/pathfinding`.
4. **No automated architecture enforcement** in `package.json` or `.github/workflows/ci.yml`.
