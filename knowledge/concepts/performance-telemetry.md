---
type: concept
title: "60Hz 循环基准测试与 P99 抖动度量"
description: "纳秒级微秒分辨率的物理更新与网络调度基准测试套件，把控帧预算与性能瓶颈。"
resource: "frontend/space-escape/shared/perf-benchmark.ts"
tags:
  - performance
  - telemetry
  - benchmark
  - p99
timestamp: 2026-10-31T17:35:00Z
sources:
  - "frontend/space-escape/shared/perf-benchmark.ts"
---

# 60Hz 循环基准测试与 P99 抖动度量

## 性能指标体系

为了在移动端与主流桌面浏览器中恒定保持 60FPS，单个物理与模拟 Tick 的总时间预算上限为 **16.67ms**（单步核心计算必须在 2.5ms 内完成）。

## 度量维度 (`LatencyReport`)

- **P50 / P95 / P99 / P99.9 延迟**：测量 10,000 次密集仿真循环中的各分位数微秒表现。
- **Jitter (网络/计算抖动)**：定义为单步耗时与平均方差的最大偏离度。
- **Ops / Second (吞吐量)**：每秒可执行的碰撞求解步数。

## CI 自动化看护

在自动化集成测试中运行 `integration-audit.test.ts`，一旦 P99 延迟超过报警阈值或内存泄漏，即刻在 PR 检查中阻断合并。
