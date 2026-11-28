# Architecture Convergence Progress Ledger

## Baseline Metrics (`de4c0ab`)
- `npm run space:build`: PASS (3.41s, `tsc` + `vite build`)
- `npm run space:test`: PASS (174/174 tests, 19.9s)
- Circular dependencies in `frontend/space-escape/`: 3 cycles (`adventure <-> simulation`, `fighter-recall <-> simulation`, `fighter-recall <-> types`)
- Room server implementations duplicating protocol logic: 3 (`server/index.ts`, `party/index.ts`, `party/worker.ts`)
- Runtime `innerHTML` assignments in `src/`: 4 (2 high-severity XSS vectors: multiplayer chat & feedback echoes)
- Largest files: `src/scene.ts` (2,550 LOC), `src/main.ts` (1,779 LOC), `src/interplanetary.ts` (1,021 LOC), `shared/physics.ts` (947 LOC)
- Automated architecture checks: None

## Governance Task Pool & Batch Log

| Batch | Scope | Status | Commit | Verification | Independent Review |
| --- | --- | --- | --- | --- | --- |
| 1 | Architecture map, ADRs, progress ledger | Done | Pending | Docs created | N/A (baseline docs) |
| 2 | Break `shared/` cycles; unify `Vec3`, warp gates, geodesic math, `fuelCapacity`, `MovementWorld` kinematics | Pending | - | - | - |
| 3 | Canonical `RoomSession` + `party/runtime.ts`; unify `server/index.ts`, `party/index.ts`, `party/worker.ts`; centralize `resolveRoomEndpoint` | Pending | - | - | - |
| 4 | Fix chat & feedback XSS; decompose `src/main.ts` (`stunt-tracker`, `feedback-panel`, `chat-console`, `hud-controller`); unify player color palette | Pending | - | - | - |
| 5 | Decompose `src/scene.ts` (`asset-loader`, `stardust-stream`, `world-environment`, `avatar-system`); unify `resolvePilotFlightState`; remove dead code | Pending | - | - | - |
| 6 | Automated `scripts/check-architecture.mjs`, `tests/space-escape/architecture.test.ts`, CI workflow integration, full E2E & final red/blue audit | Pending | - | - | - |
