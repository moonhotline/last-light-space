import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.resolve("docs/space-escape/ingame-shots");
const ARTIFACT_DIR = "/Users/alexander/.gemini/antigravity/brain/013ef81d-829f-4fd7-8a71-eafb47b02bc2";

fs.mkdirSync(DOCS_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto("http://127.0.0.1:5184/");
await page.waitForFunction(() => {
  const btn = document.querySelector("#launch");
  return btn && !btn.disabled;
}, { timeout: 30000 });
await page.click("#launch");
await page.waitForTimeout(3000);

const shots = [
  {
    id: "01_blerk_npc",
    name: "01 / 友方外星向导 Blerk (在出生点前方与宇航员对话互动)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const me = ll.player();
      // Position player right near Blerk at (8, 22.8, 335)
      me.x = 8;
      me.y = 23;
      me.z = 338;
      me.yaw = Math.PI; // Face towards z=335
      me.pitch = 0;
      // Camera view
      view.camera.position.set(8, 24, 342);
      view.camera.lookAt(8, 23.5, 335);
    }
  },
  {
    id: "02_tactical_rifle_fp",
    name: "02 / 第一人称 HMG-379 重型电磁突击机枪持枪视角",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.thirdPerson = false;
      view.setWeapon("rifle");
      const me = ll.player();
      me.seat = -1;
      view.toolModel.visible = true;
      if (view.fpRifle) view.fpRifle.visible = true;
    }
  },
  {
    id: "03_tactical_rifle_tp",
    name: "03 / 第三人称宇航员持握 HMG-379 战术射击瞄准姿态",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.thirdPerson = true;
      view.setWeapon("rifle");
      const me = ll.player();
      me.x = 0; me.y = 10; me.z = 355;
      me.yaw = 0.5;
      view.camera.position.set(1.8, 10.8, 357.5);
      view.camera.lookAt(0, 10.2, 355);
    }
  },
  {
    id: "04_alien1_beast",
    name: "04 / 敌对生物 Another Alien 敏捷突进异兽 (在异星山谷地表潜伏)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const me = ll.player();
      me.x = 165; me.y = 82; me.z = -80;
      me.yaw = Math.PI;
      view.camera.position.set(165, 83.5, -78);
      view.camera.lookAt(165, 82.5, -85);
    }
  },
  {
    id: "05_alien2_reptillian",
    name: "05 / 敌对生物 Reptillian Alien 重装蜥蜴异兽 (在异星矿脉附近驻守)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const me = ll.player();
      me.x = -170; me.y = 78; me.z = -143;
      me.yaw = Math.PI;
      view.camera.position.set(-170, 79.5, -141);
      view.camera.lookAt(-170, 78.5, -150);
    }
  },
  {
    id: "06_mineral_specimens",
    name: "06 / 斯洛文尼亚自然博物馆真实地质矿石标本与水晶簇系统",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const me = ll.player();
      me.x = -30; me.y = 22; me.z = 118;
      me.yaw = Math.PI;
      view.camera.position.set(-30, 23.2, 120.5);
      view.camera.lookAt(-30, 21.8, 115);
    }
  },
  {
    id: "07_spaceship_corridor",
    name: "07 / 飞船内部战术走廊 (按 F 键进入舰载漫步、全景舷窗与 LED 导引舱道)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.interplanetary.toggleCorridor(true);
      view.thirdPerson = false;
      view.camera.position.set(0, 1.8, 12);
      view.camera.lookAt(0, 1.8, -10);
    }
  },
  {
    id: "08_light_fighter_flight",
    name: "08 / 高机动穿梭战机 Light Fighter (巡航模式太空飞行)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.interplanetary.inCorridor = false;
      view.interplanetary.corridorGroup.visible = false;
      view.interplanetary.flightMode = "cruise";
      view.interplanetary.switchShip("light_fighter");
      const ship = view.interplanetary.shipMeshes.get("light_fighter");
      if (ship) {
        ship.visible = true;
        view.camera.position.set(ship.position.x + 10, ship.position.y + 6, ship.position.z + 18);
        view.camera.lookAt(ship.position);
      }
    }
  },
  {
    id: "09_intergalactic_mothership",
    name: "09 / 跃迁旗舰 Intergalactic Spaceship 重型母舰 (按 U 键切换旗舰巡航)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.interplanetary.inCorridor = false;
      view.interplanetary.corridorGroup.visible = false;
      view.interplanetary.flightMode = "cruise";
      view.interplanetary.switchShip("cruiser");
      const ship = view.interplanetary.shipMeshes.get("cruiser");
      if (ship) {
        ship.visible = true;
        view.camera.position.set(ship.position.x + 22, ship.position.y + 12, ship.position.z + 32);
        view.camera.lookAt(ship.position);
      }
    }
  },
  {
    id: "10_solar_system_orbits",
    name: "10 / 太阳系星际航线与公转轨道系统 (Simple Solar System 航线网络)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.interplanetary.flightMode = "cruise";
      const ss = view.interplanetary.downloadedAssets.get("solar_system");
      if (ss) {
        ss.visible = true;
        view.camera.position.set(0, 450, 650);
        view.camera.lookAt(0, 100, 0);
      }
    }
  },
  {
    id: "11_earth_highres",
    name: "11 / 高精 PBR 真实母星地球 (大气层蓝晕与大陆洋流着陆透视)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.interplanetary.flightMode = "cruise";
      const p = view.interplanetary.planets.get("earth");
      if (p) {
        if (p.highDetail) p.highDetail.visible = true;
        p.surfaceMesh.visible = false;
        view.camera.position.set(p.group.position.x + 120, p.group.position.y + 40, p.group.position.z + 140);
        view.camera.lookAt(p.group.position);
      }
    }
  },
  {
    id: "12_mercury_planet",
    name: "12 / 替换月球天体 Mercury Planet 水星陨石坑球体 (环球引力与陨坑近景)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.interplanetary.flightMode = "cruise";
      const p = view.interplanetary.planets.get("mercury");
      if (p) {
        if (p.highDetail) p.highDetail.visible = true;
        p.surfaceMesh.visible = false;
        view.camera.position.set(p.group.position.x + 60, p.group.position.y + 20, p.group.position.z + 70);
        view.camera.lookAt(p.group.position);
      }
    }
  },
  {
    id: "13_stylized_planet",
    name: "13 / Stylized Planet 生机新星 (生机绿意独立生态星球)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.interplanetary.flightMode = "cruise";
      const p = view.interplanetary.planets.get("stylized");
      if (p) {
        if (p.highDetail) p.highDetail.visible = true;
        p.surfaceMesh.visible = false;
        view.camera.position.set(p.group.position.x + 55, p.group.position.y + 20, p.group.position.z + 65);
        view.camera.lookAt(p.group.position);
      }
    }
  },
  {
    id: "14_cave_and_sky",
    name: "14 / 异星洞窟 Cave on Alien Planet & 极光天气球 Fantasy Sky (动态全景沉浸环境)",
    setup: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const cave = view.interplanetary.downloadedAssets.get("cave");
      const sky = view.interplanetary.downloadedAssets.get("sky");
      if (cave) {
        cave.visible = true;
        cave.position.set(0, 30, 200);
      }
      if (sky) {
        sky.visible = true;
        sky.position.set(0, 30, 200);
      }
      view.camera.position.set(0, 30, 220);
      view.camera.lookAt(0, 30, 200);
    }
  }
];

const results = [];

for (let i = 0; i < shots.length; i++) {
  const s = shots[i];
  console.log(`[${i + 1}/${shots.length}] Setting up in-game shot: ${s.name}...`);
  await page.evaluate(s.setup);
  await page.waitForTimeout(600);

  const docPath = path.join(DOCS_DIR, `${s.id}.png`);
  const artPath = path.join(ARTIFACT_DIR, `${s.id}.png`);

  await page.screenshot({ path: docPath });
  fs.copyFileSync(docPath, artPath);
  console.log(`  -> Saved: ${docPath}`);
  results.push({ id: s.id, name: s.name, file: `${s.id}.png` });
}

fs.writeFileSync(
  path.join(DOCS_DIR, "manifest.json"),
  JSON.stringify(results, null, 2),
);

console.log("\nAll in-game screenshots captured successfully!");
await browser.close();
process.exit(0);
