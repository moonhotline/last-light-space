# Repository Memory

This file records durable project conventions and decisions. Keep it concise, factual, and update it when a user decision changes.

## Product and visual direction

- Project: LAST LIGHT / 余晖, a cooperative low-gravity planetary exploration game.
- The "Beneath the Rings" promotional hero should be a genuine, high-quality generated raster illustration featuring an astronaut under a ringed planet, without national borders, flags, or national insignia. Verify the image asset and provenance before placing it in README.
- Do not substitute SVG drawings, screenshots, or unrelated visual references for a specifically requested generated image.
- No emoji in product UI, visual assets, code comments intended as UI copy, or repository documentation.
- Do not hand-build fake 3D models from polygon primitives. Use approved authored assets and production-quality modeling workflows instead.
- Avoid text-heavy layouts, card piles, and low-quality SVG art. Minimal, modern icons are permitted.
- Prefer concise, high-signal presentation.

## Testing and delivery

- Do not introduce unit tests as the requested acceptance strategy. Favor regression, integration, and end-to-end tests; retain existing tests unless a separately approved cleanup calls for changes.
- Before requesting a PR, require a review by an agent with independent repository context, provided the agent has the actual diff, original requirements, and test results.
- Do not merge without review and required checks. Fix P0 and P1 risks, review again, and validate behavior against a before/after baseline when feasible.
- Never claim an independent-agent review, generated image, passing test, or merged PR unless that evidence exists.

## RSI self-improvement loop

Understand intent -> assign repository responsibilities -> set measurable goals -> implement in parallel when safe -> red-team / blue-team review using actual diff, requirements, and test evidence -> layered verification (lint, integration, headless E2E, regression, CI/CD) -> fix P0/P1 -> re-review -> acceptance using before/after execution and A/B comparison when applicable.

Continuously progress the active /goal when an authorized persistent goal runner exists; otherwise record next steps explicitly and do not imply background execution.
