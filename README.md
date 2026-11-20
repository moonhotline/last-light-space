# LAST LIGHT / 余晖 — 回声协议

![Beneath the Rings — an unmarked astronaut overlooking an icy alien basin beneath a ringed gas giant](assets/readme/beneath-the-rings.png)

**A signal worth chasing. A world worth exploring.**

[开始远征](https://oodai.space) · [章节设计存档](docs/space-escape/echo-design.md) · [早期验证记录](docs/space-escape/echo-verification.md) · [v0.1.0 基线](https://github.com/moonhotline/last-light-space/releases/tag/v0.1.0)

一款低重力合作探索游戏。打开浏览器即可独自出发，或与朋友组队追踪星际信号。

**Beneath the Rings · 回声协议** 从横跨 3.58 km 的低重力盆地出发。你可以用钩索穿越峡谷、回收坠船材料、调查废弃实验室，再登船前往深空。单人使用同一套仿真规则，合作房间最多四人。

## 长期愿景与对标

**Last Light 要做一款打开浏览器就能出发、值得反复远征的太空探索游戏。** 我们希望玩家能独自追查异常，也能与朋友分别从轨道和地表调查，用各自看到的证据决定下一步。长期目标是超越四款对标作品在各自擅长的体验上建立的标准，并把自主发现、自由航行、角色选择和船员协作放进同一趟远征。

### 我们目前的基础

以 `main` 的 `6e3437c` 为基线，已具备「回声协议」探索章节、低重力地表行动、资源回收、两种可驾驶飞船、四座星门和天体接近、着陆、离舱及再起飞的仿真。联机房间最多四人，同船目前是驾驶员和乘客关系。下一层游戏深度来自跨天体调查、环境规则、能影响后续远征的选择，以及船员之间的实际分工。[卡普勒与飞船回归](tests/space-escape-ui/flight-kepler.spec.ts) · [着陆与再起飞回归](tests/space-escape/celestial-landing.test.ts) · [星门回归](tests/space-escape-ui/warp-flight.spec.ts) · [房间实现](frontend/space-escape/party/worker.ts)

### 四款游戏的公开事实与我们的差距

公开资料核对日期为 2026 年 11 月 20 日。下列数字分别描述循环长度、程序生成规模、商店所列的可探索范围和线上版本。

| 对标作品 | 已公开的游戏内容 | Last Light 的差距与长期做法 |
| --- | --- | --- |
| **《星际拓荒》** Outer Wilds | 手工制作的太阳系每 **22 分钟**循环一次。地貌会随时间改变，例如沙子淹没地底通道。玩家用信号镜、探测器和翻译工具收集线索，靠理解世界规律取得进展。[Mobius Digital 游戏介绍](https://www.mobiusdigitalgames.com/outer-wilds.html) · [制作人对 22 分钟循环的说明](https://blog.playstation.com/archive/2019/10/08/explore-a-solar-system-that-resets-every-22-minutes-in-the-outer-wilds-out-this-month) | 现有线索主要服务章节目标。让星体环境遵循可观察、可预测的规律，让多处独立证据支持同一判断。玩家看懂规律后，可以自己选出发窗口、找出捷径或回头验证旧发现。 |
| **《无人深空》** No Man’s Sky | Sony 在发售前披露的程序生成规模超过 **18 × 10¹⁸ 颗行星**。玩家可以从一颗行星表面无缝飞往另一颗，记录生物、采集并交易资源。2025 年 **Voyagers 6.0** 加入可自定义、船内可步行并能邀请好友登船的 Corvette。[Sony 规模说明](https://blog.playstation.com/2016/07/14/what-can-you-do-in-no-mans-sky/) · [Hello Games 游戏介绍](https://www.nomanssky.com/about/) · [Voyagers 更新](https://www.nomanssky.com/2025/08/voyagers-update/) | 已有资源回收、行星间飞行和星门跃迁，目的地之间的玩法差异和资源用途仍有限。让重力、地形和环境危险改变飞法与装备选择。把样本、航线和观测写进长期可查的档案，让今天的发现改变下次出发的准备。 |
| **《星空》** Starfield | Bethesda 的 Steam 商店页列出 **超过 1,000 颗可探索行星**。这是单人 RPG，包含角色背景与特质、阵营任务、同伴招募、船只改装和前哨生产。**2026 年 4 月 7 日**发布的 Free Lanes 免费更新支持在同一星系内用 Cruise Mode 往返行星。[Bethesda 的 Steam 商店页](https://store.steampowered.com/app/1716740/Starfield/) · [Free Lanes 发布说明](https://bethesda.net/en-US/news/starfield-free-lanes-terran-armada) | 当前以章节任务和固定交互为主。角色选择尚不会改变人物关系或后续任务。让玩家用调查、交涉或船载装备解决同一处困境，并让交出什么证据、信任谁、帮助哪一方，实质改变后续委托、补给和可通行的地点。 |
| **《星际公民》** Star Citizen | CIG 的持续宇宙在核对时的线上版本是 **Alpha 4.10.3**。官方指南列出 Stanton、Pyro、Nyx 三个可选起始星系，以及采矿、货运、医疗救援、残骸打捞等活动。货运需要装船和交付，打捞缺少舱容时可找运输玩家协作。[RSI 线上部署记录](https://status.robertsspaceindustries.com/issues/2026-11-12_live-deployment/index.html) · [起始星系指南](https://support.robertsspaceindustries.com/hc/en-us/articles/360008085873-Locations-in-Star-Citizen) · [玩法指南](https://support.robertsspaceindustries.com/hc/en-us/articles/16444523494423-Daily-Life-in-the-Verse) | 已有同船乘坐，仍缺能互相影响的岗位和可继续的远征进度。让驾驶、扫描、工程和离舱调查各自掌握独有的信息或操作权限，能在一次救援、运输或回收中共同改变方案，也能在掉线后重新归队。 |

### 我们追求的游戏性

- **发现带来行动自由。** 每条有价值的线索都能帮玩家解释异常、确定行动时机或找到另一条路径。熟悉的地点会随着玩家理解加深，出现新的走法。
- **操作与决策互相影响。** 惯性、重力、能见度、舱容和装备决定哪些方案可行。玩家可以用技术弥补资源不足，也可以提前准备来降低操作风险。出发、绕路、继续冒险和撤离都要有明确的得失。
- **合作来自彼此需要。** 单人能通过更换工具或多花时间完成一次调查。组队时，轨道上的人看到全局变化，地面的人看到局部证据。交换情报和共同判断会改变任务结果。
- **后果延续到下一趟远征。** 保存玩家发现的规律、改变的地点和承担的承诺。重访同一处遗迹时，既能运用已经学会的东西，也能应对上次行动留下的新局面。

例如，在未来的一次远征中，轨道上的队友发现峡谷里的信号只在遮挡解除时透出，地面队友从旧中继站认出另一条入口。两人可以等窗口直降，也可以从背风侧绕行，用更多时间换更安全的撤离条件。如果只能带走一件货物，选择带走记录器还是备用电源，会改变下次出发时能走的航线。

我们用实际游玩判断是否超越对标体验。玩家能独立解释自己为什么选这条路线，换一套装备或队友能找到不同解法，上一次决定能在重访时被感知，而且玩家愿意回来测试自己的新想法。

## Run locally

```sh
npm ci
npm run space:dev
# In a second terminal:
npm run space:server
```

Open http://127.0.0.1:5180. To serve a production build and rooms from one origin:

```sh
npm run space:build
npm run space:server
# http://127.0.0.1:2567
```

```sh
npm run space:test
npm run space:ui -- --trace off
# To test an existing built server:
SPACE_WEB_URL=http://127.0.0.1:2567 SPACE_ROOM_URL=ws://127.0.0.1:2567 npm run space:ui -- --trace off
```

Q toggles the grapple, C dashes, Space jumps/jets, left mouse or T fires the pulse tool, E reads/repairs/boards, Tab opens inventory and lore, G uses repair gel, V changes camera. Aboard: WASD thrust, Space ascent, X brake and descend, Shift boost, E board or disembark after landing. B recalls to the latest beacon with your inventory.

The landscape retains three optional upgrade beacons, Earthrise, a ringed giant, and Moonrise. New Blender source assets include an articulated suit, a twin-engine skiff, and a walkable abandoned laboratory. Generated GLBs, original music, attribution, and source asset scripts are included.

The current explorer uses the downloaded `explorer-v4.glb` with its skinned mesh, textures and animations. The source and rig adaptation credit are in [asset attribution](frontend/space-escape/public/assets/ATTRIBUTION.md).

The [production frontend](https://oodai.space) runs on Vercel. Its multiplayer endpoint is hosted at [party.oodai.space](https://party.oodai.space/_health) on Cloudflare Workers with one Durable Object per room. Expedition state currently lives in room memory. Saving expedition progress across sessions and reliably restoring an interrupted expedition are roadmap work.

The repository-root `vercel.json` builds and publishes `frontend/space-escape/dist`. Set `SPACE_ROOM_URL` to the hosted room endpoint in each deployed environment. The build validates the endpoint URL format and writes `connection.json`. Vercel serves it with caching disabled.

`docs/source-snapshot.json` describes the original v0.1.0 import; it is not a checksum manifest for later versions. Baseline verification and screenshots remain under `docs/space-escape/planet-*`; chapter evidence uses `echo-*`.

With the built room server running, `npm run space:record` records the complete chapter and exports an MP4 with FFmpeg. Set `SPACE_WEB_URL` if the built room server uses another origin.
