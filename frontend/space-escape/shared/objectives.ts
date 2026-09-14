import type { Player, Snapshot } from "./types";
import {
  LORE,
  OUTPOST,
  DESTINATION,
  REPAIR,
  ITEMS,
  type ItemId,
} from "./adventure-data";
import { distance } from "./map";
export function missionObjective(s: Snapshot, p: Player) {
  const a = s.adventure,
    ship = a.ship;
  const result = (
    p: { x: number; y: number; z: number },
    n: number,
    title: string,
    detail: string,
  ) => ({ p, index: `0${n} / 07`, title, detail });
  if (ship.arrived)
    return result(
      DESTINATION,
      7,
      "回声仍在生长",
      "抵达新区域 · 自由探索、寻找剩余铭文与信标",
    );
  if (ship.repaired)
    return result(
      p.seat >= 0 ? DESTINATION : ship,
      7,
      p.seat >= 0 ? "飞向回声林地" : "游隼号已就绪",
      p.seat >= 0
        ? "西侧陨石坑 · X 下降，Shift 刹停后着陆"
        : "靠近飞船按 E 登船 · 空格起飞",
    );
  if (!a.lore.includes(0))
    return result(
      LORE[0],
      1,
      "留给后来者的刻石",
      "靠近刻石按 E 阅读 · 调查坠船以北",
    );
  const count = (k: ItemId) =>
    ship.cargo[k] + s.players.reduce((n, v) => n + v.inventory[k], 0);
  for (const k of ["scrap", "ore"] as ItemId[])
    if (count(k) < REPAIR[k]!) {
      const node = a.nodes
        .filter((n) => n.item === k && n.readyAt <= s.time)
        .sort((x, y) => distance(p, x) - distance(p, y))[0];
      if (node)
        return result(
          node,
          2,
          `回收${ITEMS[k].name} ${count(k)}/${REPAIR[k]}`,
          "瞄准资源，长按鼠标左键 / T 切割 · 有效距离 11 m",
        );
    }
  if (!a.lore.includes(1))
    return result(
      LORE[1],
      3,
      "进入曙光实验室",
      "沿光点向北 · 从南侧敞开的门进入，E 读取航行档案",
    );
  if (count("cell") < 2) {
    const n = a.nodes.find((n) => n.item === "cell")!;
    return result(n, 3, "回收实验室电源", "切割绿色电池箱 · 导航电路已取得");
  }
  if (a.drones.some((d) => d.hp > 0))
    return result(
      OUTPOST,
      4,
      "解除反应堆封锁",
      `守卫 ${a.drones.filter((d) => d.hp > 0).length}/3 · 瞄准并发射脉冲，红色锁定时移动闪避`,
    );
  if (count("core") < 1)
    return result(
      a.nodes.find((n) => n.item === "core")!,
      5,
      "取出动力核心",
      "守卫已清除 · 靠近并切割反应堆",
    );
  if (!a.lore.includes(2))
    return result(LORE[2], 5, "最后一条命令", "调查反应堆北侧刻石 · E 阅读");
  return result(
    ship,
    6,
    "让游隼重新飞翔",
    "返回坠船 · 长按 E 提交材料并修复，队友可以共同完成",
  );
}
