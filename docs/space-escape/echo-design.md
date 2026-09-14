# 回声协议 / Echo Protocol — v0.2.0

This chapter expands LAST LIGHT into a cooperative shipwreck expedition. Existing beacon exploration remains an optional upgrade route.

## Playable loop

Read the inscription north of the crash → recover titanium and wreckage → grapple toward the abandoned Dawn laboratory → recover navigation records and batteries → clear three sentinel drones → extract the reactor core → deliver materials and repair Peregrine → board together → fly and land in Echo Grove.

The world remains a 1.6 km local terrain, with a new walkable laboratory and a small grove destination in the western crater. It is not a multi-planet survival world. Returning to the latest beacon with B preserves your recovered items and avoids repeating the entire outbound route.

## Controls

| Input | On foot | Aboard |
|---|---|---|
| WASD | Move | Forward/reverse and lateral thrust (pilot) |
| Mouse / arrows, I K | Look / aim | Look; pilot heading follows yaw |
| Space | Jump; hold to jet | Ascend |
| Q | Grapple; tap again to release | — |
| C | Dash | — |
| Left mouse / T | Pulse tool: cut resources within 11 m; shoot drones within 65 m | — |
| E | Read; hold near ship to contribute and repair; tap to board | Disembark when landed and stopped |
| Shift | Sprint | Brake |
| X | — | Descend |
| G | Use repair gel | Use repair gel |
| Tab | Inventory, repair requirements, recovered lore | Same |
| V | First/third person | Cockpit/chase camera |
| R / B / H | Shared marker / recall / hide HUD | Recall exits your seat |

Touch controls include movement, looking, grapple, tool, interaction, ascent, and ship descent/braking. Inventory and camera controls are in the top bar.

## Rules and multiplayer

- Colyseus owns inventories, resource availability, damage, lore rewards, recipe contributions, seat ownership, vehicle movement, and completion.
- All new gameplay input is boolean; no client-provided inventory, target coordinates, hit outcomes, or vehicle positions are accepted.
- Q raycasts against shared Rapier world geometry; one attachment, no rope-segment simulation. Air acceleration and drag preserve momentum after release.
- The pulse tool has a cooldown, range checks, a forgiving aiming cone, and terrain/architecture line-of-sight checks.
- Each sentinel visibly locks one position for 1.15 seconds before firing. Moving out of the marked point avoids damage; valid hits stagger the sentinel. Four hits destroy it.
- Six item types stack to 99. The inventory exposes 12 slots; this chapter uses at most six typed stacks. There is no drag-and-drop, trading, or equipment grid yet.
- Repair requires 4 titanium, 4 scrap, 2 batteries, 1 navigation circuit, and 1 reactor core, followed by four seconds of repair work. Crew members can contribute independently.
- One pilot and three passengers. Only the pilot applies thrust. Departure requires a safe landed exit. A disconnected pilot's occupied seat passes to a remaining passenger; uncrewed ships brake and descend.
- On departure, a player's materials are recovered into ship cargo so unique mission components cannot be lost. Navigation lore awards its circuit once per expedition.
- Shield failure rescues the player to their checkpoint without losing inventory. Repair gel restores 55 shield.
- The chapter completes after a repaired, piloted ship has flown and landed within the grove destination. Walking there does not complete the chapter.

## Art implementation

Original Blender sources generate a new articulated suit, a detailed twin-engine utility skiff, and the abandoned laboratory. The runtime drives limb pivots, knees, elbows, head, body lean, ship banking, landing gear, engine light, particles, and audio. It uses Three.js real-time shading and existing atmospheric celestial rendering, not Cycles path tracing.

## Explicit boundaries

This is a stylized browser game chapter. Film-render visual quality and a 15–20 minute first-play duration are design aspirations, not verified claims. This version does not implement farming, house building, logging, persistent worlds, reconnect, or travel to a second planet. Those belong to the later roadmap, after durable world identity and storage are introduced.

Vercel serves static files. Multiplayer still uses a local Node service through a temporary Cloudflare tunnel; it requires those processes to remain online. No paid services are introduced.
