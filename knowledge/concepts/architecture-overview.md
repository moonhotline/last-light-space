---
type: concept
title: "oodaispace 系统全局架构设计"
description: "阐述客户端、服务端、权威物理与双网络层（Colyseus + PartyKit）的解耦协同架构。"
resource: "README.md"
tags:
  - architecture
  - network
  - fullstack
timestamp: 2026-10-31T17:35:00Z
sources:
  - "README.md"
  - "frontend/space-escape/server/index.ts"
  - "frontend/space-escape/shared/simulation.ts"
---

# oodaispace 系统全局架构设计

oodaispace (Last Light / 余晖 · 回声协议) 是一个基于 Web 标准与轻量微服务构建的 2–4 人低重力外星探索与星际协同沙盒游戏。

## 模块分层与职责隔离

```
frontend/space-escape/
├── shared/            # 核心业务逻辑（双端完全同构复用）
│   ├── physics.ts     # Rapier3D 物理抽象、碰撞体积与运动学
│   ├── simulation.ts  # 权威状态更新、快照生成与插值
│   ├── celestial.ts   # 太阳系轨道与球形重力向量场
│   ├── interplanetary-nav.ts # 轨道动力学与自动驾驶
│   ├── npc-ai.ts      # 自主转向与战术行为树
│   └── entity-system.ts # ECS Lite 解耦组合系统
├── server/            # 本地权威 Colyseus 房间进程 (端口 2567)
├── party/             # 边缘云原生 PartyKit / Cloudflare Worker 多人服
└── src/               # 客户端展现层
    ├── scene.ts       # Three.js 双视锥渲染管线
    ├── main.ts        # 用户输入采样与 HUD 交互
    └── adventure-view.ts # 地质样本、载具动画与资产挂载
```

## 网络同步范式

1. **服务端权威 (Server Authoritative)**：
   - 拾取物状态、信标充能进度、资源挖掘冷却与飞船起落全部由服务端判定并派发 Tick 快照。
2. **客户端零延迟预测 (Client-Side Prediction)**：
   - 本地输入立即推动物理引擎步进，服务器确认包到达后进行重放补偿。
3. **Hermite 样条插值 (Hermite Spline Interpolator)**：
   - 远端玩家坐标通过二阶连续导数平滑插值，彻底消除高延迟下的位置撕裂与抖动。
