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

await page.goto("http://127.0.0.1:5180/");
await page.waitForFunction(() => {
  const btn = document.querySelector("#launch");
  return btn && !btn.disabled;
}, { timeout: 30000 });
await page.click("#launch");
await page.waitForTimeout(3500);

const shots = [
  {
    id: "01_blerk_guide",
    title: "01 / 友方外星向导 Blerk The Alien",
    desc: "在异星基地地表与宇航员并肩站立，背负科技背包与外星装备",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.cameraOverride = null;
      if (!view.thirdPerson) view.toggleCamera();
      const sim = ll.sim();
      const p = sim.s.players.find(x => x.id === "local");
      p.x = 10; p.y = 10.35; p.z = 333; p.yaw = -0.5; p.pitch = 0; p.vx = 0; p.vy = 0; p.vz = 0;
      sim.physics.reset(p.id, p);
      const blerk = view.interplanetary.downloadedAssets.get("blerk");
      if (blerk) {
        blerk.position.set(8, 10.33, 335);
        blerk.rotation.y = -0.8;
      }
    }
  },
  {
    id: "02_hmg379_fp",
    title: "02 / HMG-379 重型电磁突击机枪 (第一人称战术持握)",
    desc: "高精金属导轨、光学瞄准镜与能量导管第一人称实机持枪视界",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.cameraOverride = null;
      if (view.thirdPerson) view.toggleCamera();
      view.setWeapon("rifle");
      view.toolModel.visible = true;
      if (view.fpRifle) view.fpRifle.visible = true;
    }
  },
  {
    id: "03_hmg379_tp",
    title: "03 / HMG-379 重型电磁突击机枪 (第三人称实机瞄准姿态)",
    desc: "宇航员双手战术抵肩持枪，重型机枪在阳光与星光照耀下的真实金属反射",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      if (!view.thirdPerson) view.toggleCamera();
      view.setWeapon("rifle");
      const sim = ll.sim();
      const p = sim.s.players.find(x => x.id === "local");
      p.x = 0; p.y = 10.35; p.z = 345; p.yaw = 0; p.pitch = 0;
      sim.physics.reset(p.id, p);
      const pos = view.camera.position.clone().set(-0.8, 10.5, 343.4);
      const target = view.camera.position.clone().set(-0.35, 10.3, 345);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "04_alien1_stalker",
    title: "04 / 敌对生物 Another Alien 敏捷突进异兽",
    desc: "潜伏在异星基地的敏捷突进异兽，张开双翼呈狩猎攻击姿态",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const a1 = view.interplanetary.downloadedAssets.get("alien1");
      if (a1) {
        a1.position.set(-3, 10.2, 336);
        a1.rotation.y = 0.3;
        a1.visible = true;
      }
      const pos = view.camera.position.clone().set(-3, 11.2, 340);
      const target = view.camera.position.clone().set(-3, 10.5, 336);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "05_alien2_reptillian",
    title: "05 / 敌对生物 Reptillian Alien 重装蜥蜴异兽",
    desc: "21万三角面高精重装外星守卫，驻守在异星地表防御圈",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const a2 = view.interplanetary.downloadedAssets.get("alien2");
      if (a2) {
        a2.position.set(3, 11.4, 336);
        a2.rotation.y = -0.6;
        a2.visible = true;
      }
      const pos = view.camera.position.clone().set(0.5, 11.8, 340);
      const target = view.camera.position.clone().set(3, 11.4, 336);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "06_mineral_specimens",
    title: "06 / 自然博物馆地质矿石标本群落 Mineral Samples",
    desc: "斯洛文尼亚自然博物馆高精矿石标本群落，真实地质纹理结晶簇",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const min = view.interplanetary.downloadedAssets.get("minerals");
      if (min) {
        min.position.set(4, 10.0, 332);
        min.visible = true;
      }
      const pos = view.camera.position.clone().set(4, 10.8, 335.5);
      const target = view.camera.position.clone().set(4, 10.2, 332);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "07_spaceship_corridor",
    title: "07 / 飞船内部战术走廊 Spaceship Corridor",
    desc: "按 F 键切入飞船内部漫步，全景抗辐射观景舷窗与发光能量舱道",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      view.cameraOverride = null;
      const c = view.interplanetary.downloadedAssets.get("corridor");
      if (c) {
        c.position.set(0, 11, 335);
        c.scale.set(0.3, 0.3, 0.3);
        c.visible = true;
        view.scene.add(c);
      }
      const pos = view.camera.position.clone().set(2, 11.5, 335);
      const target = view.camera.position.clone().set(-10, 11.5, 335);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "08_light_fighter_flight",
    title: "08 / 高机动穿梭战机 Light Fighter Spaceship",
    desc: "星际战机巡航于异星峡谷天际，流线型机翼与离子主推力引擎",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const c = view.interplanetary.downloadedAssets.get("corridor");
      if (c) c.visible = false;
      view.interplanetary.flightMode = "cruise";
      view.interplanetary.activeShip = "light_fighter";
      const ship = view.interplanetary.shipMeshes.get("light_fighter");
      if (ship) {
        ship.position.set(0, 14, 325);
        ship.rotation.set(0.1, Math.PI * 0.95, -0.1);
        ship.visible = true;
        view.scene.add(ship);
      }
      view.setShipState = () => {};
      view.interplanetary.setShipState = () => {};
      view.interplanetary.step = () => { if (ship) ship.visible = true; };
      const pos = view.camera.position.clone().set(0, 16.5, 338);
      const target = view.camera.position.clone().set(0, 14, 325);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "09_intergalactic_ship",
    title: "09 / 跃迁旗舰 Intergalactic Spaceship 重型母舰",
    desc: "跃迁级重型星际探索母舰，厚重装甲模块与多重星舰推进喷口",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const f = view.interplanetary.shipMeshes.get("light_fighter");
      if (f) f.visible = false;
      view.interplanetary.flightMode = "cruise";
      view.interplanetary.activeShip = "cruiser";
      const ship = view.interplanetary.shipMeshes.get("cruiser");
      if (ship) {
        ship.position.set(0, 16, 315);
        ship.rotation.set(0.12, Math.PI * 0.15, 0);
        ship.visible = true;
        view.scene.add(ship);
      }
      view.setShipState = () => {};
      view.interplanetary.setShipState = () => {};
      view.interplanetary.step = () => { if (ship) ship.visible = true; };
      const pos = view.camera.position.clone().set(6, 20, 345);
      const target = view.camera.position.clone().set(0, 16, 315);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "10_solar_system_orbits",
    title: "10 / 太阳系星际航线网络 Simple Solar System",
    desc: "太阳系八大行星运转轨道系统，日心发光烈焰与多层公转环线",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const c = view.interplanetary.shipMeshes.get("cruiser");
      if (c) c.visible = false;
      const ss = view.interplanetary.downloadedAssets.get("solar_system");
      if (ss) {
        ss.position.set(0, 16, 310);
        ss.rotation.set(0.3, 0.8, -0.4);
        ss.scale.set(1.4, 1.4, 1.4);
        ss.visible = true;
        view.scene.add(ss);
      }
      view.interplanetary.step = () => { if (ss) ss.visible = true; };
      const pos = view.camera.position.clone().set(0, 22, 338);
      const target = view.camera.position.clone().set(0, 16, 310);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "11_earth_highres",
    title: "11 / 高精 PBR 真实母星地球 Earth",
    desc: "替换原简易母星，真实大洋反光、大气蓝晕透镜与云层立体投影",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const ss = view.interplanetary.downloadedAssets.get("solar_system");
      if (ss) ss.visible = false;
      if (view.interplanetary.inCorridor) {
        const btn = document.getElementById("btnCorridor");
        if (btn) btn.click();
      }
      view.interplanetary.step = (dt, pos) => {
        const p = view.interplanetary.planets.get("earth");
        if (p && p.highDetail) {
          p.highDetail.visible = true;
          p.surfaceMesh.visible = false;
          if (p.atmosphereMesh) p.atmosphereMesh.visible = false;
        }
      };
      const pos = view.camera.position.clone().set(4200, 2600, -5100);
      const target = view.camera.position.clone().set(4200, 2600, -7200);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "12_mercury_planet",
    title: "12 / 替换月球天体 Mercury Planet 水星陨石坑球体",
    desc: "替换原月球，密集撞击陨石坑高精表面与心向引力环绕球体",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const ss = view.interplanetary.downloadedAssets.get("solar_system");
      if (ss) ss.visible = false;
      if (view.interplanetary.inCorridor) {
        const btn = document.getElementById("btnCorridor");
        if (btn) btn.click();
      }
      view.interplanetary.step = (dt, pos) => {
        const p = view.interplanetary.planets.get("mercury");
        if (p && p.highDetail) {
          p.highDetail.visible = true;
          p.surfaceMesh.visible = false;
          if (p.atmosphereMesh) p.atmosphereMesh.visible = false;
        }
      };
      const pos = view.camera.position.clone().set(-3200, 1200, -4400);
      const target = view.camera.position.clone().set(-3200, 1200, -5400);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "13_stylized_planet",
    title: "13 / Stylized Planet 生机新星",
    desc: "绿意生态独立星球，哥伦布“星球是圆的”心向引力环球生态圈",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const ss = view.interplanetary.downloadedAssets.get("solar_system");
      if (ss) ss.visible = false;
      if (view.interplanetary.inCorridor) {
        const btn = document.getElementById("btnCorridor");
        if (btn) btn.click();
      }
      view.interplanetary.step = (dt, pos) => {
        const p = view.interplanetary.planets.get("stylized");
        if (p && p.highDetail) {
          p.highDetail.visible = true;
          p.surfaceMesh.visible = false;
          if (p.atmosphereMesh) p.atmosphereMesh.visible = false;
        }
      };
      const pos = view.camera.position.clone().set(-4800, 3100, 5200);
      const target = view.camera.position.clone().set(-4800, 3100, 4200);
      view.cameraOverride = { position: pos, lookAt: target };
    }
  },
  {
    id: "14_cave_and_sky",
    title: "14 / 异星洞窟 Cave on Alien Planet & 极光天气球 Fantasy Sky",
    desc: "地下全景洞窟岩壁与梦幻极光动态天气球，全景双面天幕深度包围",
    action: () => {
      const ll = window.__lastLight;
      const view = ll.view();
      const ss = view.interplanetary.downloadedAssets.get("solar_system");
      if (ss) ss.visible = false;
      const cave = view.interplanetary.caveModel;
      if (cave) cave.visible = true;
      view.interplanetary.step = () => { if (cave) cave.visible = true; };
      const pos = cave.position.clone();
      const target = cave.position.clone().add({ x: 5, y: 1.5, z: 5 });
      view.cameraOverride = { position: pos, lookAt: target };
    }
  }
];

const results = [];

for (let i = 0; i < shots.length; i++) {
  const s = shots[i];
  console.log(`[${i + 1}/${shots.length}] Capturing in-game: ${s.title}...`);
  await page.evaluate(s.action);
  await page.waitForTimeout(600);

  const docPath = path.join(DOCS_DIR, `${s.id}.png`);
  const artPath = path.join(ARTIFACT_DIR, `${s.id}.png`);

  await page.screenshot({ path: docPath });
  fs.copyFileSync(docPath, artPath);
  console.log(`  -> Saved: ${docPath}`);
  results.push({ id: s.id, title: s.title, desc: s.desc, filename: `${s.id}.png` });
}

fs.writeFileSync(
  path.join(DOCS_DIR, "manifest.json"),
  JSON.stringify(results, null, 2),
);

console.log("\nAll 14 in-game screenshots captured successfully!");
await browser.close();
process.exit(0);
