# Architecture Convergence Progress Ledger

## Before vs. After Convergence Metrics

| Metric | Baseline (`de4c0ab`) | Converged (`refactor/arch-convergence`) | Delta |
| --- | ---: | ---: | --- |
| Circular dependencies (`shared/`, `src/`, `server/`, `party/`) | 3 | 0 | -100% |
| Duplicated room server protocols | 3 (`server/index`, `party/index`, `party/worker`) | 1 (`shared/room-session.ts`) | Unified |
| Server / worker adapter LOC (excluding shared core) | 463 LOC | 271 LOC | -41.5% |
| Runtime `innerHTML` assignments in `src/` | 4 (2 XSS vectors) | 0 | -100% |
| `src/scene.ts` size | 2,550 LOC | 1,380 LOC | -45.9% |
| `src/main.ts` size | 1,779 LOC | 1,167 LOC | -34.4% |
| Warp gate ID / yaw definitions | 3 files | 1 (`shared/celestial.ts`) | SSOT |
| Automated architecture guardrails | 0 | 7 rules (`npm run space:check` + test + CI) | Enforced |
| Automated Node test suite (`npm run space:test`) | 174 passing | 181 passing | +7 regression tests |

## Governance Task Pool & Batch Log

| Batch | Scope | Status | Commit | Verification | Independent Review |
| --- | --- | --- | --- | --- | --- |
| 1 | Baseline architecture map, ADRs, progress ledger | Done | `5a2d9e6` | Docs created | N/A (baseline docs) |
| 2 | Break `shared/` cycles (`PhysicsQueries`, `SimulationHost`); unify `Vec3`, `WARP_GATE_IDS`/`warpGateYaw`, `geodesicArcDistance`, `fuelCapacity`, `MovementWorld` kinematics | Done | `52e7d35` | `space:build` PASS; `space:test` 174/174 PASS; 0 cycles | APPROVE (2 P2s resolved) |
| 3 | Canonical `RoomSession` + `party/runtime.ts`; unify `server/index.ts`, `party/index.ts`, `party/worker.ts`; centralize `resolveRoomEndpoint`; fix chat XSS | Done | `e34cf0f` | `space:build` PASS; `space:test` 176/176 PASS | APPROVE after fixing P0 chat XSS + 3 P2s |
| 4 | Eliminate remaining `innerHTML` XSS; decompose `src/main.ts` (`stunt-tracker`, `feedback-panel`, `chat-console`, `hud-controller`); unify `PLAYER_COLORS` | Done | `1bf6c5c` | `space:build` PASS; `space:test` 176/176 PASS | APPROVE after fixing P1 `StuntTracker.reset()` + 3 P2s |
| 5 | Decompose `src/scene.ts` (`asset-loader`, `stardust-stream`, `world-environment`, `avatar-system`); unify `resolvePilotFlightState` & `loadGltfWithRetry`; remove dead code | Done | `a57bb1e` | `space:build` PASS; `space:test` 176/176 PASS | APPROVE (4 P2s resolved) |
| 6 | Automated `scripts/check-architecture.mjs`, `npm run space:check`, `tests/space-escape/architecture.test.ts`, CI workflow integration, post-`main` merge (`PR #46`/`#47`) & PR `#48` | Done | `f7fce4d`, `f4239c5`, `13eda88` (PR `#48` -> `4c0b120`) | `space:check` PASS (47 TS modules, 0 violations); `space:build` PASS; `space:test` 181/181 PASS; CI green on `main` (`4c0b120`) | APPROVE (post-merge verified) |
| 7 | Adversarial Red/Blue hardening: transitive `lazy-physics-chunk` check, lexer regex/division context hardening, expanded HTML sink & emoji coverage, `RoomSession` chat throttling + client `#chatMessages` cap, runtime edge-case cleanups (`totalTricks`, avatar despawn disposal, `PartySocket` send guard, photo reset), doc metric sync | Done | Batch 7 follow-up PR | `space:check` PASS (47 TS modules, 0 violations); `space:build` + hosted-room PASS; `space:test` 181/181 PASS; Playwright E2E 16/16 runnable specs PASS + 13/13 post-edit regression PASS (incl. 2-client `connection` & `mission`; 3 pre-existing baseline/Vite-8 drifts documented) | APPROVE (0 P0 / 0 P1; 2 minor P2 lexer/static-analysis notes) |
