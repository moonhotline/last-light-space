# AGENTS.md

## Mission and scope

Deliver changes that serve the user's product intent with minimal complexity. Distinguish the game runtime, multiplayer server, assets, and project documentation. Assign each change to the owning repository and module; do not broaden scope without justification.

Read [MEMORY.md](MEMORY.md) before planning or changing visual assets, tests, or PR workflow.

## Non-negotiable quality rules

- No emoji.
- No handcrafted polygon-primitives pretending to be high-quality 3D models.
- No excessive copy, decorative card-stack UI, or low-quality SVG illustrations. Simple modern icons are acceptable.
- For a requested AI-generated hero image, provide a real raster image asset and verify its existence; never substitute an SVG or an unrelated reference.
- For the Beneath the Rings hero: astronaut, cinematic space exploration, ringed planet, no country-specific flags or national insignia.
- Favor regression and end-to-end testing over introducing unit tests. Use integration checks where appropriate. Do not delete existing coverage merely to enforce this preference.

## Required delivery sequence

1. Understand the intent, requirements, limitations, and affected repositories. Define clear owner and responsibility boundaries.
2. Turn the request into an explicit goal with verifiable acceptance criteria; use the authorized /goal runner if available.
3. Make scoped, parallelizable changes on isolated branches/worktrees when safe.
4. Run lint, integration checks, headless E2E, regression scenarios, and CI/CD as relevant. Record actual commands and outcomes.
5. Have an independent-context review agent assess the real diff against the requirements and test evidence, including adversarial red/blue review. A self-review is not a substitute.
6. Fix P0/P1 findings, rerun affected tests, then obtain re-review.
7. Compare before/after behavior with executable verification; run A/B evaluation when meaningful.
8. Only after independent review and required checks pass, open a PR, then merge through the repository's approved workflow.
9. If independent review, image generation, external environment, or tests are unavailable, stop at the appropriate gate and report the blocker. Never invent an approval, test, or artifact.

## Definition of done

User-facing acceptance criteria met; assets verifiably available; no broken references; no unresolved P0/P1; recorded independent review and test results; PR and merge completed only after the gates above.
