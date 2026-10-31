# oodaispace OKF 变更溯源日志 (Audit & Provenance Log)

本文档由 CI/CD 自动化工作流与 `scripts/update-okf.mjs` 自动维护。每次提交 Pull Request 或合并至 `main` 时，会自动比对代码差异、提取更新内容并在此记录变更上下文。

| 日期 (UTC+8) | PR / 提交编号 | 作者 | 涉及模块 | 变更摘要 |
| :--- | :--- | :--- | :--- | :--- |
| 2026-10-31 17:35 | PR #10 (dfc1212) | leek | tests/space-escape | feat(qa): 全栈星际远征与多智能体集成验证、P99 基准测试审计与回归套件 |
| 2026-10-31 17:34 | PR #9 (32d1ac4) | leek | shared/simulation.ts | feat(net): 高频 Tick 仿真引擎与 Hermite 三次样条快照状态插值器 |
| 2026-10-31 17:33 | PR #8 (7c0be61) | leek | shared/celestial.ts | feat(economy): 行星地质共振扫描机制、莫氏硬度采集与样本图鉴系统 |
| 2026-10-31 17:32 | PR #7 (a000353) | leek | shared/entity-system.ts | feat(arch): 模块化 ECS Lite 实体组件系统与解耦组合索引 |
| 2026-10-31 17:32 | PR #6 (564170d) | leek | shared/adventure.ts | feat(gameplay): 跨行星科考远征系统、NPC 智能体载具登乘与座位分配 |
| 2026-10-31 17:31 | PR #5 (651c247) | leek | shared/lod-culling.ts | feat(graphics): 动态视锥体剔除引擎、分级 LOD 与并发受限资产调度器 |
| 2026-10-31 17:30 | PR #4 (a5167e5) | leek | shared/celestial.ts | feat(rendering): 开普勒母星海拔标定翻倍、动态平滑过渡宇宙真空雾效 |
| 2026-10-31 17:28 | PR #3 (b091e06) | leek | shared/interplanetary-nav.ts | feat(nav): 行星间自动驾驶仪、霍曼轨道转移计算与巡航走廊路径规划 |
| 2026-10-31 17:27 | PR #2 (c8a8932) | leek | shared/npc-ai.ts | feat(ai): 高级 NPC 雷诺转向行为库与分层战术决策树状态机 |
| 2026-10-31 17:22 | PR #1 (2699d41) | leek | shared/perf-benchmark.ts | feat(perf): 60Hz 高频物理循环微秒级基准测试套件与 P99 抖动度量 |
| 2026-10-31 21:32 | Commit 9c83abe | developer | 全库/配置同步 | docs(audit): comprehensive analysis & technical audit report for last-light-spac |
| 2026-10-31 14:04 | Commit 9ad4b90 | moonhotline | 全库/配置同步 | fix(ci): provide default party.oodai.space endpoint for Vercel CICD room configu |
| 2026-10-31 14:06 | Commit e1ca57a | moonhotline | 天体物理与大气, 渲染管线与 LOD | Merge pull request #24: 修复升空高度、开普勒坐标与 30km 视距 |
| 2026-10-31 14:59 | PR #25 (50d9e6a) | moonhotline | 星际轨道导航, 渲染管线与 LOD, 权威多人仿真 | feat(space): wire interplanetary flight, companion expedition, and real lazy ass |
| 2026-10-31 15:00 | Commit 72c0b79 | moonhotline | 星际轨道导航, 渲染管线与 LOD, 权威多人仿真 | Merge pull request #25 from moonhotline/feat/interplanetary-companion-flight-pip |
| 2026-10-31 16:35 | PR #26 (c8fb247) | moonhotline | 渲染管线与 LOD | fix(rendering): restore skybox planets and implement camera frustum culling for  |
