---
type: concept
title: "天体物理与动态大气渲染系统"
description: "太阳系各大行星轨道参数、万有引力向量计算及宇宙真空与大气雾度渐变算法。"
resource: "frontend/space-escape/shared/celestial.ts"
tags:
  - celestial
  - gravity
  - atmospheric-fog
  - coordinates
timestamp: 2026-10-31T17:35:00Z
sources:
  - "frontend/space-escape/shared/celestial.ts"
---

# 天体物理与动态大气渲染系统

系统对太阳系与开普勒-07 外星系进行艺术化参数建模，统一处理行星表面漫游与行星际脱离场景。

## 核心参数表 (SOLAR_SYSTEM)

| 天体 ID | 名称 | 半径 (m) | 引力常数 | 大气厚度 | 着陆点坐标 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `kepler` | 开普勒-07 (母星) | 420 | 7.5 | 850m | `(0, 1721, 340)` |
| `mercury`| 水星 | 240 | 3.7 | 0 (真空格局) | 极地陨坑 |
| `earth`  | 地球 | 640 | 9.8 | 1200m | 蓝色近地轨道 |
| `moon`   | 月球 | 170 | 1.62| 0 | 环形山基地 |

## 动态大气雾度渐变 (`computeAtmosphericFog`)

为了在脱离行星进入深空时平滑过渡，算法根据飞船/玩家距离地心的垂直海拔分段插值雾效参数：

```typescript
export function computeAtmosphericFog(altitude: number): { color: number; density: number } {
  const clampedAlt = Math.max(0, altitude);
  if (clampedAlt < 200) {
    // 地表密集大气散射
    return { color: 0x0c141d, density: 0.000045 };
  } else if (clampedAlt < 850) {
    // 渐变过渡至外逸层
    const t = (clampedAlt - 200) / 650;
    return { color: 0x070c14, density: 0.000045 * (1 - t * 0.8) };
  } else {
    // 宇宙深空微弱星尘雾度，保证远处星体锐利
    return { color: 0x020408, density: 0.000008 };
  }
}
```
