import { atGround, type Vec } from "./map";
export const ITEMS = {
  ore: {
    name: "钛矿",
    label: "Ti",
    color: "#a8e3e8",
    description: "切割蓝色矿脉。用于重建推进器外壳。",
  },
  scrap: {
    name: "合金废料",
    label: "Fe",
    color: "#c6b5a0",
    description: "从坠船残骸拆解。用于修补船体。",
  },
  cell: {
    name: "电池",
    label: "E",
    color: "#93eed1",
    description: "旧实验室的备用电源。",
  },
  circuit: {
    name: "导航电路",
    label: "N",
    color: "#d2c0ff",
    description: "实验室航行档案附带的校准模组。",
  },
  core: {
    name: "动力核心",
    label: "Ω",
    color: "#ffd08a",
    description: "被守卫无人机封锁的生态反应堆。",
  },
  medgel: {
    name: "修复凝胶",
    label: "+",
    color: "#bce9bd",
    description: "按 G 使用，恢复 55 点护盾。",
  },
} as const;
export type ItemId = keyof typeof ITEMS;
export type Inventory = Record<ItemId, number>;
export const emptyInventory = (): Inventory => ({
  ore: 0,
  scrap: 0,
  cell: 0,
  circuit: 0,
  core: 0,
  medgel: 0,
});
export const REPAIR: Partial<Inventory> = {
  ore: 4,
  scrap: 4,
  cell: 2,
  circuit: 1,
  core: 1,
};
export const SHIP_HOME = atGround(-11, 347);
export const LAB = atGround(12, 192);
export const OUTPOST = atGround(176, -68);
export const DESTINATION = atGround(-310, -210);
export const LORE = [
  {
    ...atGround(-5, 310),
    id: 0,
    title: "01 / 致后来者",
    site: "坠船旁的刻石",
    text: "“如果你能读到这段话，请别再向天空求救。我们点亮的三座塔，从来不是为了让谁找到这里。”\n石缝中嵌着一枚研究所徽章。背面标记：曙光实验室，沿峡谷向北。",
    short: "沿峡谷向北 · 进入曙光实验室",
  },
  {
    ...atGround(12, 189, 0.2),
    id: 1,
    title: "02 / 春天的代价",
    site: "曙光实验室 · 航行档案",
    text: "第 2087 日。树开始在真空里呼吸。我们成功了。\n第 2091 日。根系正在模仿船员的脉搏。我们没有成功。\n——主任将导航模组留在终端。动力核心被转移到北方环形遗址，由守卫机封锁。",
    short: "导航模组已取出 · 前往北方守卫据点",
  },
  {
    ...atGround(174, -77),
    id: 2,
    title: "03 / 不是灯塔",
    site: "封锁据点 · 最后一条命令",
    text: "“不要关闭信标。那不是求救的灯，是锁。”\n最后的指令被反复刻在门上，直到金属磨穿。封锁背后，一片仍然绿色的森林出现在观测记录里。坐标：西侧回声陨石坑。",
    short: "修复飞船 · 飞向西侧回声林地",
  },
] as const;
export const RESOURCE_SITES: (Vec & {
  item: ItemId;
  amount: number;
  hp: number;
  name: string;
})[] = [
  {
    ...atGround(-6, 334, 0.8),
    item: "scrap",
    amount: 4,
    hp: 3,
    name: "坠船碎片",
  },
  { ...atGround(6, 278, 1), item: "ore", amount: 2, hp: 3, name: "钛矿脉" },
  { ...atGround(-24, 223, 1), item: "ore", amount: 2, hp: 3, name: "钛矿脉" },
  {
    ...atGround(16, 197, 0.8),
    item: "cell",
    amount: 2,
    hp: 2,
    name: "备用电源",
  },
  {
    ...atGround(8, 197, 0.8),
    item: "medgel",
    amount: 2,
    hp: 1,
    name: "急救箱",
  },
  { ...atGround(126, -10, 1), item: "ore", amount: 2, hp: 3, name: "钛矿脉" },
  {
    ...atGround(172, -68, 1.2),
    item: "core",
    amount: 1,
    hp: 2,
    name: "封锁反应堆",
  },
  {
    ...atGround(-318, -199, 1),
    item: "medgel",
    amount: 3,
    hp: 1,
    name: "远征补给",
  },
];
// Shared dimensions for architecture, movement collisions and grapple raycasts.
export const LAB_BOXES = [
  { x: 0, y: 0.15, z: 0, sx: 20, sy: 0.3, sz: 26 },
  { x: -10, y: 3.6, z: 0, sx: 0.5, sy: 7.2, sz: 26 },
  { x: 10, y: 3.6, z: 0, sx: 0.5, sy: 7.2, sz: 26 },
  { x: 0, y: 3.6, z: -13, sx: 20, sy: 7.2, sz: 0.5 },
  { x: -6.8, y: 3.6, z: 13, sx: 6.4, sy: 7.2, sz: 0.5 },
  { x: 6.8, y: 3.6, z: 13, sx: 6.4, sy: 7.2, sz: 0.5 },
  { x: 0, y: 6.4, z: 13, sx: 7.2, sy: 1.6, sz: 0.5 },
  { x: -5, y: 7.3, z: 0, sx: 10, sy: 0.3, sz: 26 },
  { x: 7, y: 7.3, z: -5, sx: 6, sy: 0.3, sz: 16 },
];
