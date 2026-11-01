---
type: concept
title: "双视锥深度渲染与按需 LOD 管线"
description: "天文星空与地表双视锥深度隔离，分级动态 LOD 视锥裁剪与并发受限异步调度。"
resource: "frontend/space-escape/src/scene.ts"
tags:
  - rendering
  - threejs
  - dual-frustum
  - lod-culling
timestamp: 2026-11-01T13:36:21.564Z
sources:
  - "frontend/space-escape/src/scene.ts"
  - "frontend/space-escape/shared/lod-culling.ts"
---

# 双视锥深度渲染与按需 LOD 管线

## 双视锥架构 (Dual-Camera Frustum)

由于外太空恒星天体与玩家脚下地表的尺度跨越 $10^7$ 个数量级，单一深度缓冲区必然导致 Z-fighting（深度冲突）。
系统采用双渲染通道设计：
1. **天空摄像机 (`skyCamera`)**：近平面 `100m`，远平面 `22,000m`，专门渲染恒星、星云、行星带与大气外壳。
2. **场景摄像机 (`camera`)**：近平面 `0.1m`，远平面 `16,000m`，专门渲染地表网格、岩体、玩家模型与微粒。

## 动态视锥体剔除与 LOD 调度 (`FrustumCullingEngine`)

- **四级距离梯度**：`HIGH (<80m)`、`MEDIUM (<250m)`、`LOW (<800m)` 与 `CULLED (>800m 或视野外)`。
- **并发受限加载 (`LazyAssetScheduler`)**：限制同时进行的 GLB/纹理并发解析数不超过 3 个，避免高帧率渲染时发生主线程卡顿（Jank）。
