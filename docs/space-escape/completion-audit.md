# 原型交付核对

最终范围：桌面浏览器运行的 2–4 人空间站合作撤离原型；免费 Vercel 前端，
本机 Colyseus 后端经 Cloudflare Tunnel 联机，Blender 资产、空间音效、实机宣传短片。

| 要求 | 当前证据 |
| --- | --- |
| TypeScript、Vite、Three.js、Rapier、Colyseus | package.json、客户端、共享物理与服务器实现，TypeScript / Vite 生产构建通过 |
| 第一人称探索、碰撞和三种工具 | 桌面 UI 实际移动、装备操作，物理碰撞及工具冷却测试通过 |
| 一张空间站、一个威胁、十分钟限制 | map.ts、updateDrone、服务器模拟；路径可达、伤害与十分钟失败测试通过 |
| 进入、探索、核心回收、撤离、结算、重开 | 本地及正式 Vercel 站点的双浏览器完整任务通过；失败重开单独通过 |
| 两个浏览器验证移动、拾取、伤害和任务同步 | mission.spec.ts 的正式站点运行通过，包含客户端可见位置与服务器位置核对 |
| 支持 2–4 人 | 双浏览器实机任务 + 四个独立 SDK 客户端房间容量与移交测试 |
| 服务端决定关键状态、预测、插值和纠正 | simulation.ts 的输入校验/拾取/伤害/胜负逻辑，main.ts 的输入重放，scene.ts 的远端插值；半秒网络突发回归通过 |
| Blender GLB 资产 | 五个 GLB 均声明 Blender I/O v5.2.40，场景加载五个资产并实际渲染；生成脚本与素材许可随项目保存 |
| 环境音乐与空间音效 | 自制 WAV、Three.js Audio / PositionalAudio 实现；正式站点确认音频上下文 running、32 秒音乐和 2 秒空间环境声启动循环；实际录屏配原创音轨 |
| Vercel 网页与 Cloudflare 后端连通 | 正式部署 READY、公开 HTML 200 且与构建一致、连接配置指向隧道、正式双人任务通过 |
| 免费且没有购买云服务器 | Vercel 团队套餐经 API 确认为 Hobby，后端监听本机 2567，使用免费 Quick Tunnel |
| 实机录屏、FFmpeg 剪辑字幕混音转码 | last-light-gameplay.mp4、last-light-trailer.mp4、last-light-trailer.srt 与重录/加字幕脚本；视频画面已检查 |
| 交付可重复运行 | README.md 提供本机启动、隧道、前端准备、部署、测试、录制步骤 |

边界：这是一张地图的原型，游戏性的最终判断仍需要真人试玩；未声称生产级在线可靠性、
真实手机兼容性或全大陆网络可达。Quick Tunnel 会随重启换域名，本机停止后多人服务停止。
