# LAST LIGHT / 远空探索与系统升级需求看板 (Issues Backlog)

## 概述
针对太空探索项目（`last-light-space` / `oodaispace`）的大规模升级，本看板确立了 10 个核心 Issue，覆盖高频 P99 性能测试、高级 NPC 行为与编队算法、跨星球航线与自动驾驶算法、模型懒加载与按需渲染、星球与气雾高度校准、带着 NPC 跨星球探险玩法及模块化架构重构。

---

### Issue #001: [Perf] 高频并发场景下仿真与物理循环 P99 延迟基准压测套件
- **背景**：在复杂太空与多 NPC 碰撞场景下，物理和状态机高频 tick（60Hz/120Hz）可能出现抖动，需建立精确的 P50 / P90 / P95 / P99 及最大帧耗时量化评估体系。
- **目标**：实现 `shared/perf-benchmark.ts` 及自动化测试 `tests/space-escape/benchmark.test.ts`，支持 10,000+ 次高频迭代压测并输出统计指标，确保 P99 保持在微秒级（< 2ms）。
- **关键指标**：P99 < 2ms, Jitter < 0.5ms, 吞吐率 > 50,000 updates/s。

### Issue #002: [AI] 高级 NPC 自主转向力系统与战术决策树算法 (Advanced Steering & Tactical AI)
- **背景**：原有 NPC（Blerk 与异星生物）仅具有简单的直线靠近逻辑，缺乏避障、减速逼近（Arrive）、群聚（Flocking）与巡逻漫游等高级智能表现。
- **目标**：实现 `shared/npc-ai.ts`，基于 Reynolds 经典转向力（Seek, Flee, Arrive, Wander, Obstacle Avoidance, Leader Follow），构建战术决策有限状态机（Patrol -> Follow -> Alert -> Combat -> Retreat）。
- **关键指标**：支持多目标平滑转向、避免几何穿插、跟随队长保持恒定安全半径。

### Issue #003: [Nav] 跨星系飞船自动巡航与霍曼转移轨道算法 (Interplanetary Flight & Orbital Autopilot)
- **背景**：原有母星与各行星（水星、地球、绿意新星）间缺少航线指引与轨道转移算法，导致飞船无法自动跟踪目标星球并在太空中规划最短/节能路径。
- **目标**：实现 `shared/interplanetary-nav.ts`，集成天体开普勒轨道计算、霍曼转移轨道切向加速计算、Catmull-Rom 三维样条曲线巡航路径生成，以及行星引力井捕获降落阶段计算。
- **关键指标**：实现母星至各行星自动化航线解算与姿态插值。

### Issue #004: [Rendering] 行星高度倍增校准与宇宙背景深空雾度模型 (Celestial Elevation & Cosmic Haze Fog)
- **背景**：在盆地扩充至 3.58km 后，原天空球与星球的 Y 轴高度（650m）与地势起伏比偏低，导致星球贴地感严重，且原蓝色高密度雾度（`0x667f91, 0.00052`）遮挡了远景行星。
- **目标**：将各行星母星系统的高度坐标按比例向上移动一倍（Kepler 抬升至 1300m，对应大气层半径调整至 1300m，登月点/着陆点自适应映射），并基于物理散射优化动态宇宙尘埃雾度模型。
- **关键指标**：远景星球视觉仰角更雄伟，宇宙空灵感显著提升，远景几何体不被裁切。

### Issue #005: [Graphics] 3D 资产懒加载、视锥剔除与按需分级加载引擎 (Lazy Loading & On-Demand LOD Culling)
- **背景**：原有 14 组高精模型一次性启动或仅依靠简单的 Promise.all 加载，纹理体积高达数十兆，网络延迟高，占用大量显存。
- **目标**：实现基于观察者距离与视锥体相交检测的 `LODCullingSystem`（视距分级与按需隐藏/动态装载），支持模型资源离散分批加载，未进入视锥/未达距离阈值时不占用显卡 draw call。
- **关键指标**：首屏初始 Draw Call 降低 60%，显存带宽压力大幅减小。

### Issue #006: [Gameplay] 跨星球探险与 NPC 伙伴同乘机制 (Multi-Planetary NPC Expedition)
- **背景**：核心目标是带着 NPC 离开母星开普勒盆地，搭乘飞船跨越星系登陆其他行星（水星、地球、绿意新星）展开联合考察。
- **目标**：实现 `shared/expedition.ts`，支持 NPC（如 Blerk 或探险队伙伴）响应玩家召集、登机入座（Seat 锁定）、星际曲率跳跃期间同步状态，并在目标行星地表着陆展开联合作业。
- **关键指标**：完整的“招募跟随 -> 飞船入座 -> 空间跃迁 -> 目标行星着陆 -> 协同考察”闭环。

### Issue #007: [Architecture] 模块化组件式实体系统架构 (Lightweight ECS Entity System)
- **背景**：原有飞船、NPC、矿物逻辑耦合在 `interplanetary.ts` 巨型类中，不利于团队协作、单元测试和多 Agent 并行扩展。
- **目标**：构建解耦轻量 ECS 架构 `shared/entity-system.ts`，将 Transform、PhysicsBody、NavigationPath、AIController、Equipment 等拆分为独立可组合组件与 System。
- **关键指标**：支持动态组合与单测解耦，模块间无全局隐式依赖。

### Issue #008: [Economy] 地质矿物标本共振扫描与星际考察日志系统 (Planetary Minerals Resonance & Log)
- **背景**：斯洛文尼亚国家自然历史博物馆地质矿物标本系统需要更深度的地质属性探测算法与跨星球矿床收集机制。
- **目标**：实现 `shared/mineral-system.ts`，提供莫氏硬度、离子共振探测波算法、全系矿物样本提取校验与星系勘探成就计算。
- **关键指标**：支持雷达探测距离渐变衰减共振波计算，准确校验母星及其他星球独有矿物。

### Issue #009: [Net] 高频 Tick 预测与状态快照插值缓冲器 (High-Rate Snapshot Interpolator)
- **背景**：高频多人与 NPC 协同移动时，网络抖动会导致远端实体瞬移或抽搐。
- **目标**：实现 `shared/tick-engine.ts`，基于环形缓冲区（Ring Buffer）实现 Hermite 三次样条插值与航位推算（Dead Reckoning）。
- **关键指标**：在 150ms 模拟网络延迟下，插值误差小于 0.05 米，实现丝滑移动。

### Issue #010: [QA] 全链路自动化测试与 P99 性能持续交付验收套件
- **背景**：确保上述所有算法与新模块在各类极端边界条件下稳定运行，形成完整的回归测试与验收报告。
- **目标**：编写 `tests/space-escape/integration-audit.test.ts`，整合 NPC 转向、星际航行、实体系统、矿物共振与 P99 压测，一键全绿验收。
- **关键指标**：100% 单元与集成测试通过率，无内存泄漏与死循环。
