---
type: concept
title: "权威多人仿真与快照插值引擎"
description: "服务端 60Hz 权威 Tick 同步、输入环形队列重放与 Hermite 样条平滑插值器。"
resource: "frontend/space-escape/shared/simulation.ts"
tags:
  - multiplayer
  - authoritative-server
  - snapshot-interpolation
  - hermite-spline
timestamp: 2026-10-31T14:59:07.389Z
sources:
  - "frontend/space-escape/shared/simulation.ts"
---

# 权威多人仿真与快照插值引擎

解决弱网、高抖动环境下多探索员协同探索时的位置同步与任务状态一致性。

## 核心实现机制

1. **权威状态机 (SimulationState)**：
   - 所有全局拾取水晶、地质矿物、信标能量级别、倒计时均由服务端管理。
   - 客户端只能发送移动控制意图（`forward`, `side`, `yaw`, `pitch`, `jump`, `dash`），杜绝坐标瞬移外挂。

2. **Hermite 三次样条快照插值 (`SnapshotInterpolator`)**：
   - 远端玩家状态不再采用生硬的线性插值（LERP），而是基于前后两个时间片的位置 $P_0, P_1$ 与瞬时速度 $V_0, V_1$ 计算 Hermite 样条曲线：
     $$P(t) = (2t^3 - 3t^2 + 1)P_0 + (t^3 - 2t^2 + t)V_0 + (-2t^3 + 3t^2)P_1 + (t^3 - t^2)V_1$$
   - 当遇到丢包或网络突发时，自动启用外推预测，并在新数据到达时平滑吸附。
