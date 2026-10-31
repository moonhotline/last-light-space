---
type: concept
title: "NPC 伴随自主转向与战术决策树"
description: "基于 Reynolds Steering 算法的仿生转向体系与分层战术状态机。"
resource: "frontend/space-escape/shared/npc-ai.ts"
tags:
  - ai
  - steering-behaviors
  - decision-tree
  - npc
timestamp: 2026-10-31T17:35:00Z
sources:
  - "frontend/space-escape/shared/npc-ai.ts"
---

# NPC 伴随自主转向与战术决策树

本系统支持地面巡逻机器人、随行科考伙伴以及外星敌对生物的智能自主行进与战术对抗。

## 雷诺转向行为集合 (`SteeringSystem`)

- **Seek & Arrive**：向目标点全速逼近，并在进入减速缓冲半径（`slowingRadius`）内产生线性平滑衰减。
- **Obstacle Avoidance**：向前投射前瞻探测线，根据法线动态施加侧向规避加速度。
- **Leader Follow**：保持固定护卫队形并根据领队航向动态维持队列间距。

## 战术状态机 (`NPCTacticalState`)

```
         ┌────────────┐
         │    idle    │
         └─────┬──────┘
               ▼
         ┌────────────┐     Enemy Sighted      ┌────────────┐
         │   patrol   │───────────────────────►│   combat   │
         └─────┬──────┘                        └─────┬──────┘
               │ Follow Leader                       │ Low HP
               ▼                                     ▼
         ┌────────────┐                        ┌────────────┐
         │   follow   │                        │  retreat   │
         └────────────┘                        └────────────┘
```
