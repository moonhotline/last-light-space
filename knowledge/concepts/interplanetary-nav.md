---
type: concept
title: "星际航行与轨道导航算法"
description: "霍曼转移轨道近似计算、三次样条航线走廊与自动驾驶状态机。"
resource: "frontend/space-escape/shared/interplanetary-nav.ts"
tags:
  - navigation
  - hohmann-transfer
  - autopilot
  - trajectory
timestamp: 2026-10-31T17:35:00Z
sources:
  - "frontend/space-escape/shared/interplanetary-nav.ts"
---

# 星际航行与轨道导航算法

`InterplanetaryNavigator` 负责在行星间航行时生成无碰撞、燃料最优的飞行航线，并在飞船进入目标星系时交由着陆控制器平稳接管。

## 霍曼转移轨道计算 (`computeHohmannTransfer`)

基于天体引力常数 $\mu$ 与双行星轨道半径计算理论加速脉冲：

1. **出发脉冲 ($\Delta v_1$)**: 离开初始行星环绕轨道的切向推力。
2. **入轨脉冲 ($\Delta v_2$)**: 减速切入目标行星重力捕获圈。
3. **飞行周期估算 ($t$)**: 确定星际过境所需的仿真秒数。

## 六阶段自动驾驶状态机 (`AutopilotStage`)

```
[docked] ──► [takeoff] ──► [cruise] ──► [warp] ──► [injection] ──► [landing]
```

- **ascent / cruise**: 垂直爬升穿透大气层并进入转移轨道起点。
- **warp (曲率航行)**: 视界空间压缩特效，高帧率加速掠过虚空。
- **injection / descent**: 切入行星重力势阱，动态修正对地姿态并开启反冲减速喷气。
