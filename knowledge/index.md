---
title: "oodaispace (Last Light · 回声协议) Knowledge Bundle"
version: "0.3.2"
description: "面向 AI Agent 与工程团队的 Open Knowledge Format (OKF) 规范知识包。记录低重力行星探索、轨道导航、自主 AI、多人仿真与渲染架构。"
lastUpdated: 2026-11-01T14:49:30.123Z
entries:
  - concepts/architecture-overview.md
  - concepts/movement-physics.md
  - concepts/celestial-system.md
  - concepts/interplanetary-nav.md
  - concepts/multiplayer-simulation.md
  - concepts/npc-tactical-ai.md
  - concepts/ecs-entity-system.md
  - concepts/rendering-pipeline.md
  - concepts/performance-telemetry.md
  - log.md
---

# oodaispace (Last Light · 余晖) Knowledge Bundle

本目录遵循 **Open Knowledge Format (OKF v0.2)** 规范，作为项目的动态知识包与 LLM-Wiki 上下文中心。

## 核心架构视图

```
                          ┌────────────────────────┐
                          │   Authoritative Server │
                          │ (Colyseus / PartyKit)  │
                          └───────────┬────────────┘
                                      │ Snapshot (60Hz)
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
┌─────────────────────────────┐               ┌─────────────────────────────┐
│    Client 1 (Web / PWA)     │               │    Client 2 (Web / PWA)     │
│  Three.js / Dual-Frustum    │◄── Hermite ──►│  Three.js / Dual-Frustum    │
│  Rapier3D Physics Predict   │  Interpolate  │  Rapier3D Physics Predict   │
└─────────────────────────────┘               └─────────────────────────────┘
```

## 知识包概念索引 (Concepts)

1. [架构全局总览](concepts/architecture-overview.md) - 系统模块分层、客户端与服务端职责、共享逻辑边界。
2. [低重力与运动物理](concepts/movement-physics.md) - Rapier3D 胶囊体运动、喷气背包动力学、滑行推进与抓钩瞄准。
3. [天体物理与坐标系统](concepts/celestial-system.md) - 太阳系天体清单、球形重力向量场、动态大气与真空雾效插值。
4. [星际航行与轨道导航](concepts/interplanetary-nav.md) - 霍曼转移轨道近似计算、三次样条巡航走廊、六阶段自动驾驶仪。
5. [权威多人状态仿真](concepts/multiplayer-simulation.md) - 服务端权威 Tick 机制、客户端预测与回放纠错、Hermite 样条快照插值。
6. [NPC 协同与战术决策 AI](concepts/npc-tactical-ai.md) - Reynolds 运动转向行为（寻找、避障、伴随）、分层战术决策树。
7. [ECS Lite 组件实体系统](concepts/ecs-entity-system.md) - 轻量解耦的实体-组件-系统架构、组合式多组件索引。
8. [双视锥渲染与资产调度](concepts/rendering-pipeline.md) - 天文星空与地表双视锥深度隔离、LOD 视锥剔除、按需并发加载。
9. [高频性能与延迟监控](concepts/performance-telemetry.md) - 60Hz 循环预算、P99 纳秒级高精度统计与网络抖动约束。

## 变更与审计记录

所有概念通过 CI 自动化在每次 PR 提交或合并时动态更新，详见 [变更日志 (log.md)](log.md)。
