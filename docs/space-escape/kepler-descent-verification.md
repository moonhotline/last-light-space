# 开普勒模型与 X 键降落验证

验证日期：2026-11-08。

## 修改结果

- 移除 `scene.ts` 中 `this.giant` 的手写球体、云带和环。
- 开普勒采用 `/assets/models/stylized_planet/scene.gltf`，保留 `Planet`、`Clouds` 原始材质，关闭远距离地面雾对模型的影响。加载完成后立即挂载，保底球体持续挂载在地貌内部，外层大气保持轻薄。
- 地表天空坐标为 `(160, 26500, -2600)`，云层包络直径约 6000 m，地貌视直径约 9.8°。离开盆地地表后平滑恢复轨道坐标和物理尺寸。
- X 键下降推力为地表 85、深空 170，垂直阻尼为 1.5；保留水平制动和地面托底。

## 验证

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/space-escape/*.test.ts` | 132/132 通过 |
| `node --import tsx --test tests/space-escape/game-critic.test.ts` | 3/3 通过；总分及四项分数均为 100/100 |
| `npm run space:build` | TypeScript 与 Vite 构建通过；存在大体积 chunk 提示 |
| `git diff --check` | 通过 |

新增回归用例读取工程内真实 GLTF 几何，验证即时挂载、原始材质透明度、双层保底，以及在正常触控抬头上限 1.3 rad 下，地表高度 0/24/50/300 m 的全部模型顶点均落在主相机与天空相机的 30000 m 裁剪面内。Node 测试替代了纹理解码，不构成浏览器画面验收。

两种现有飞船均验证了 X 的地表下降、水平制动优先级与安全落地；另有深空下降和松开 X 的减速检查。从静止按住 X 三秒的实测下降速度为地表约 59.5 m/s、深空约 116.9 m/s；修改前均约 8.3 m/s。

## 未完成的环境验证

- 本地开发服务启动失败：`listen EPERM: operation not permitted 127.0.0.1:5180`。
- agent-browser 会话启动失败：会话目录不可写。未完成浏览器画面实测。
- Vercel 项目查询失败：`fetch failed`。构建产物已生成至 `frontend/space-escape/dist`，尚未部署线上。
