# Architecture Decision Records (ADRs) & Pending Decisions

## ADR-001: Break Shared Module Cycles via Narrow Structural Host Interfaces
- **Context**: `shared/adventure.ts` and `shared/fighter-recall.ts` imported `Simulation` from `shared/simulation.ts`, while `shared/simulation.ts` imported both modules, creating bidirectional cycles. Additionally, `shared/types.ts` imported `FighterRecall` from `shared/fighter-recall.ts`, which imported `DT` and `Player` from `shared/types.ts`.
- **Decision**:
  1. Keep all wire/snapshot data interfaces (including `FighterRecall`) in `shared/types.ts`.
  2. Define narrow structural interfaces (`PhysicsQueries` and `SimulationHost`) in `shared/types.ts` so domain modules (`adventure.ts`, `fighter-recall.ts`) depend downward on `types.ts` instead of upward on `simulation.ts` or `physics.ts`.
- **Consequences**: Zero runtime or type circular dependencies across the entire codebase; `shared/types.ts` remains a clean leaf module.

## ADR-002: Single Canonical Multiplayer Room Protocol (`shared/room-session.ts`)
- **Context**: `server/index.ts` (Colyseus), `party/index.ts` (PartyKit), and `party/worker.ts` (Cloudflare PartyServer) duplicated player capacity checks, 100 ms action cooldowns (exempting `close-lore`), host-only restart logic, chat validation, snapshot broadcast loops, and health payloads—leading to protocol drift (`server/index.ts` lacked `chat`; `party/worker.ts` broadcast snapshots at 30 Hz instead of 15 Hz).
- **Decision**:
  1. Introduce `RoomSession` in `frontend/space-escape/shared/room-session.ts` as the single authoritative implementation of multiplayer room lifecycle and message routing.
  2. Introduce `frontend/space-escape/party/runtime.ts` for Cloudflare workerd polyfills and Rapier WASM bootstrap shared by `party/index.ts` and `party/worker.ts`.
  3. Reduce all three server entry points to thin transport adapters.
- **Consequences**: Identical multiplayer behavior across local Colyseus, PartyKit, and Cloudflare PartyServer; fixes missing chat on local server and aligns snapshot broadcast stride.

## ADR-003: Single Source of Truth for Celestial Warp Gates, Vectors, and Geodesic Math
- **Context**: Warp gate IDs and yaw angles were hardcoded in 3 files (`adventure.ts`, `colliders.ts`, `interplanetary.ts`); `Vec` and `Vec3` were defined independently; `mercuryGeodesicDistance` re-implemented `geodesicArcDistance`; `fuelCapacity` was re-implemented inline in `main.ts` and `adventure.ts`.
- **Decision**:
  1. Export `WARP_GATE_IDS` and `warpGateYaw(id)` from `shared/celestial.ts`.
  2. Alias `Vec3` to `Vec` from `shared/map.ts`.
  3. Delegate `mercuryGeodesicDistance` directly to `geodesicArcDistance`.
  4. Import `fuelCapacity` everywhere fuel capacity is computed.

## ADR-004: Safe DOM Construction Only (Zero `innerHTML` in Client Runtime)
- **Context**: `addChatMessage` and `renderEchoes` interpolated untrusted strings into `innerHTML`, introducing remote multiplayer XSS and stored XSS vectors.
- **Decision**: Replace all runtime `innerHTML` assignments in `frontend/space-escape/src/` with DOM node construction (`createElement`, `textContent`) and strict `data:image/` validation for feedback preview images. Enforce via automated architecture check.

## ADR-005: Cohesive Decomposition of `src/main.ts` and `src/scene.ts`
- **Context**: `src/main.ts` (1,779 LOC) and `src/scene.ts` (2,550 LOC) combined unrelated subsystems and module-level mutable state.
- **Decision**: Extract only high-cohesion, deep modules that pass Ousterhout's Deletion Test (each hides real internal complexity behind a narrow interface):
  - From `main.ts`: `stunt-tracker.ts`, `feedback-panel.ts`, `chat-console.ts`, `hud-controller.ts`, plus `resolveRoomEndpoint` into `party-room.ts`.
  - From `scene.ts`: `asset-loader.ts`, `stardust-stream.ts`, `world-environment.ts`, `avatar-system.ts`.
  - Keep `window.__lastLight` contract and `GameView` public fields intact for all Playwright E2E tests.

## ADR-006: Machine-Enforced Architecture Guardrails (`scripts/check-architecture.mjs`)
- **Context**: Without automated enforcement, cycles, layer leaks, duplicate protocols, unsafe `innerHTML`, and emoji regressions creep back in.
- **Decision**: Add `scripts/check-architecture.mjs`, expose `npm run space:check`, add a regression test `tests/space-escape/architecture.test.ts`, and run it in `.github/workflows/ci.yml`.

---

## Pending Product / Architecture Decisions (Requires Owner Confirmation)

1. **Unwired Shared Subsystems (8 modules in `frontend/space-escape/shared/`)**:
   - `entity-system.ts`, `expedition.ts`, `interplanetary-nav.ts`, `lod-culling.ts`, `mineral-system.ts`, `npc-ai.ts`, `perf-benchmark.ts`, `tick-engine.ts`.
   - **Observation**: All 8 modules have passing tests (`tests/space-escape/*.test.ts`) and OKF knowledge references (`scripts/update-okf.mjs`, `knowledge/concepts/*.md`), but zero runtime imports in `src/`, `server/`, or `party/`.
   - **Options**: (A) Wire selected subsystems (e.g., `SnapshotInterpolator` for remote multiplayer smoothing, `MineralSystem` for geological scanning) into the live runtime; or (B) Archive/delete unused prototypes once product roadmap confirms they are not planned.
   - **Action taken**: Preserved untouched (respecting existing test coverage and avoiding unapproved breaking deletion).

2. **Unused npm Dependencies in `package.json`**:
   - Zero-reference runtime/dev dependencies: `colyseus.js`, `partysocket`, `gsap`, `tone`, `@tonejs/midi`, `pathfinding`, `@types/pathfinding`.
   - **Note**: Removing these requires regenerating `package-lock.json` via `npm install` (which needs registry access or lockfile pruning) and confirming no external dev/audio generation script relies on them. Recorded here for clean lockfile pruning once confirmed.

3. **Legacy PartyKit Worker (`party/index.ts` & `partykit.json`) vs. Cloudflare PartyServer (`party/worker.ts` & `wrangler.jsonc`)**:
   - Production deploys use Cloudflare PartyServer (`party.oodai.space`), while `party/index.ts` is retained for `npm run space:party` and `tests/space-escape/partykit-room.test.ts`. Both now delegate to `RoomSession` so maintenance cost is minimal; confirm if legacy `partykit` CLI support can eventually be retired.

4. **Dual Client Audio Engines (`src/sound-engine.ts` vs. `GameView.audio/sound` in `src/scene.ts`)**:
   - Ship propulsion + generative cosmic chords live in `CosmicAudioEngine` (`src/sound-engine.ts`), while on-foot EVA jetpack, 3-layer planet WAV loops, and 18 procedural SFX live in `GameView` (`src/scene.ts`). Both share `GameView.listener.context` and master volume. Consolidating procedural SFX into `src/sound-engine.ts` is straightforward once `view.sound` / `view.listener` test expectations (e.g. `tests/space-escape-ui/manual-portals.spec.ts` monkey-patching `view.sound`) are verified.
