---
type: concept
title: "ECS Lite 解耦组件实体系统"
description: "纯函数化组合架构，将游戏对象解耦为独立的组件与无状态系统。"
resource: "frontend/space-escape/shared/entity-system.ts"
tags:
  - architecture
  - ecs
  - entity-component-system
timestamp: 2026-10-31T17:35:00Z
sources:
  - "frontend/space-escape/shared/entity-system.ts"
---

# ECS Lite 解耦组件实体系统

为了避免传统单体对象继承导致的紧耦合，游戏底层采用紧凑的高效 ECS Lite 模式管理万物。

## 实体与组件模型

- **Entity**: 纯数字 ID，本身不包含任何逻辑或内存状态。
- **Components**:
  - `TransformComponent`: 空间三维坐标、四元数姿态与缩放。
  - `MotionComponent`: 线性速度、角速度与外力合力。
  - `VehicleSeatComponent`: 飞船座位分配、主驾/副驾角色标识。
  - `InventoryComponent`: 背包矿物标本与能源晶体存量。

## 缓存查询优化

`EntityWorld` 内置基于位掩码（Bitmask）的多组件复合查询索引（`query(Transform, Motion)`），在 60Hz 的系统循环中以 $O(1)$ 复杂度直接读取连续内存块。
