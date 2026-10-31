# Issue #8：升空与视距最小修复

原始补丁基线：main，`3d78c1580dca8d401d793e52827b980a97bd19e4`。
合并适配基线：`0d221a874eb8a78388a838389b8be7f2c33ea399`，保留主分支新增的大气半径 850 米、雾计算、导航、远征、LOD、NPC 与实体系统。
需求：[Issue #8](https://github.com/moonhotline/last-light-space/issues/8)。
[Issue #6 的拆分说明](https://github.com/moonhotline/last-light-space/issues/6#issuecomment-6541686317)不代表专项功能已完成；本补丁不能关闭 #8。

## 改动与兼容性

- `shared/celestial.ts`：开普勒中心 `(0,1300,340)` → `(0,1800,340)`；世界坐标落点同步从 y=1721 → 2221，保持半径 420 + 1 米。球体、占位/高精度模型和大气层共用行星组的中心，不单独修改渲染偏移；其他天体的坐标与半径不变。
- 实际地形网格最高点约 524.21 米，大气层最低点为 1800−850=950 米，垂直间隔约 425.79 米。测试遍历实际网格验证间隔。盆地高度场及其 Rapier 碰撞体保持原位；抬升装饰球体不应带动盆地和出生点。
- `shared/adventure.ts`：只移除 y=650 上限，使用 `Math.max(proposed.y, floor)`。九点地形底面、船体扫掠、速度限制、驾驶员权限、地面判定与乘员同步继续使用原实现。不增加新的有限高度上限。
- `src/interplanetary.ts`：盆地采用相对地形高度，避免抬高球心后地面玩家被误判为巡航；带 `planet` 标记的球面玩家仍采用对应天体的径向高度。既有 350/300 米巡航显示阈值保留，返回地面不再依赖世界坐标 y<300。
- `src/scene.ts`：主相机 far=30000，保留 near=0.1，保护第一人称手臂/装备。启用 Three.js 对数深度缓冲，同时给所有自定义三维 ShaderMaterial 补充 common 与对数深度 shader chunks，确保粒子、热流、光柱及大气与普通材质采用同一深度编码。屏幕空间后处理不参与场景深度测试，保持原实现。
- 天体位于主场景；天空独立相机、天空背景尺寸、世界雾、光源阴影相机与后处理参数保持现有配置。扩大主视锥解除远处天体的距离剔除，不保证所有方向都无遮挡，也不消除既有雾衰减。对数深度可能影响 GPU 的早期深度测试性能，尚未测量实际设备帧率。

## 回归与验证结果

已通过：

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --import tsx --test tests/space-escape/*.test.ts
npm run space:build
git diff --cached --check
```

- 合并主分支后的 55 项单元/集成测试全部通过（包含新增的 5 项回归测试）。
- 新增：650、1800、7000 米附近升降；驾驶员/乘员坐标和速度同步；九点地形底面、落地竖直速度归零和横向边界；行星/大气共同中心；落点与球面一致；地面与球面高度判定。
- 原有船体撞墙、角色地形碰撞、球面整圈步行与底面引力测试继续通过。
- TypeScript 检查与 Vite 生产构建通过；构建仍提示已有大体积 bundle。
- 本环境的 tsx CLI 因 Unix IPC 权限报错，故用等价的 `node --import tsx --test` 执行测试。

新增浏览器测试 `tests/space-escape-ui/deep-space.spec.ts`：直接构造实际 GameView，检查主相机 near/far、所有行星中心进入面向它们的视锥、自定义着色器编译，以及 0.5 米和 9000 米处粒子相对普通材质的前后遮挡。

该测试已能被 Playwright 发现，但尚未执行测试体：本环境缺少 Chromium，自动下载返回无效 ZIP，启动阶段报 executable missing。不能据此宣称已验证实际蓝雾消失、着色器 GPU 编译或无深度伪影。

有可用 Chromium 的开发环境可运行：

```sh
npx playwright install chromium
# 终端一
npm run space:dev
# 终端二：此测试需要 Vite 源码服务，而非生产静态站点
SPACE_WEB_URL=http://127.0.0.1:5180 npx playwright test \
  --config playwright.space.config.ts tests/space-escape-ui/deep-space.spec.ts
```

还应人工检查第一/第三人称装备、地表仰望四颗行星、热流和光柱与地形遮挡，以及目标设备帧率。

## 功能边界

本次解决：母星与大气脱离地表、旧飞船高度天花板、主相机距离剔除，以及这些改动直接引发的坐标/高度判定和深度编码兼容问题。

仍需独立实现：

- 飞船盆地横向空气墙解除及离开高度场后的地面/碰撞策略。当前 `groundAt` 对范围外查询会钳制到网格边缘，因此不能只删 x/z 边界。
- 权威 Ascent → Cruise → Warp → Reentry 状态机、600 米大气层语义、天体锁定/HUD、跃迁充能与目标外层空间到达。
- 行星重力井（距离 <1200 米）、再入减速/震动、飞船球面碰撞与姿态、着陆/下船以及 NPC 的球面引力切换。已有角色球面数学和步行测试通过，并不等于飞船已能球面着陆。
- 深空数值稳定性和远距离多人同步的长期验证。

## 应用补丁

在上述基线或可兼容的仓库根目录执行：

```sh
git apply --check /path/to/issue-8-ascent-view.patch
git apply /path/to/issue-8-ascent-view.patch
node --import tsx --test tests/space-escape/*.test.ts
npm run space:build
```

补丁使用相对于仓库根目录的路径，包含实现、回归测试和本文；仅部分实现 Issue #8，不应自动关闭该 Issue。
