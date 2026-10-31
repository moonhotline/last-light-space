---
type: concept
title: "低重力运动物理与角色控制器"
description: "基于 Rapier3D 的胶囊体运动学、喷气背包推进、滑行加速与动态抓钩机制。"
resource: "frontend/space-escape/shared/physics.ts"
tags:
  - physics
  - rapier3d
  - movement
  - character-controller
timestamp: 2026-10-31T17:35:00Z
sources:
  - "frontend/space-escape/shared/physics.ts"
---

# 低重力运动物理与角色控制器

游戏运行于微重力/低重力天体表面（默认母星重力标定为标准重力的 0.76 倍），要求移动机制兼具惯性飘逸感与精确操控度。

## 关键力学机制

1. **角色胶囊体与坡度攀爬**：
   - 胶囊体尺寸：半径 `0.48m`，半高 `0.32m`。
   - 最大爬坡角度设为 `52.2°`，滑坡角度限制在 `61.2°`。
   - `enableSnapToGround(0.35)` 防止低重力下走下坡路时发生不自然的漂浮断层。

2. **多模式推进管线**：
   - **喷气推进 (Jetpack)**：消耗推进剂（20 燃料/秒），提供垂直升力与空中向量调节；着陆后以 24 单位/秒速率自充。
   - **矢量冲刺 (Dash)**：瞬时爆发推进，消耗 16 燃料，拥有 1.5 秒硬性冷却。
   - **滑行模式 (Skate Gliding)**：大幅降低地面切向阻尼，将跑步速度由 23m/s 提升至 32m/s，借由地势坡度实现飞跃。
   - **动态抓钩 (Grapple)**：由服务端权威射线检测命中锚点后施加向心拉力，速度上限限制在 48m/s。
