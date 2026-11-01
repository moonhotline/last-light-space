#!/usr/bin/env python3
"""
Sketchfab High-Fidelity Asset Pipeline & Downloader
Usage:
  python3 frontend/space-escape/scripts/import-sketchfab-assets.py [--token YOUR_SKETCHFAB_API_TOKEN]
"""

import os
import sys
import json
import zipfile
import argparse
import urllib.request
import urllib.error

MODELS = [
    {"tag": "rifle", "uid": "533204d3a9f240f78b65973b323cba7c", "name": "HMG-379 电磁机枪", "out": "hmg-379.glb"},
    {"tag": "blerk", "uid": "86aebb842059480697a6eaaa87425a4a", "name": "Blerk 外星向导", "out": "alien-blerk.glb"},
    {"tag": "alien1", "uid": "18e8a671ba15466390108c01e190a989", "name": "异星潜行者 (Another Alien)", "out": "alien-crawler.glb"},
    {"tag": "alien2", "uid": "4ec6a2ed140b4dcaba5f3bd6c06fd475", "name": "重装蜥蜴卫士 (Reptillian Alien)", "out": "alien-reptillian.glb"},
    {"tag": "stylized_planet", "uid": "789725db86f547fc9163b00f302c3e70", "name": "绿意新星 (Stylized Planet)", "out": "planet-stylized.glb"},
    {"tag": "mercury", "uid": "ccb6c6a9ac3742109cc67c0f16032b49", "name": "水星 (替换月球)", "out": "mercury-globe.glb"},
    {"tag": "cave", "uid": "25aebeb12d8b481190bef3e86c3c2ddf", "name": "异星洞窟天空盒", "out": "alien-cave.glb"},
    {"tag": "sky", "uid": "15c79bb2fc1147128039fe4ff90fd5a0", "name": "梦幻天象天气背景", "out": "fantasy-sky.glb"},
    {"tag": "minerals", "uid": "f3da55f7fedb41adb3c57bd70c6ada76", "name": "地质博物馆矿物样本", "out": "mineral-samples.glb"},
    {"tag": "earth", "uid": "5f9c35be31a047928eace8b415a8ee3a", "name": "蓝星地球 PBR", "out": "earth-pbr.glb"},
    {"tag": "solar_system", "uid": "e1448a9bebb449dea6c11f7e42021594", "name": "太阳系星图航线", "out": "solar-system.glb"},
    {"tag": "corridor", "uid": "1cdd1db557b8428892af4773bdada913", "name": "飞船内饰战术走廊", "out": "spaceship-corridor.glb"},
    {"tag": "fighter", "uid": "51616ef53af84fe595c5603cd3e0f3e1", "name": "轻型穿梭战机 (Light Fighter)", "out": "light-fighter.glb"},
    {"tag": "intergalactic", "uid": "d36e54a3118744c8ba1a4a47b408b659", "name": "跃迁级重型星舰", "out": "intergalactic-ship.glb"}
]

def main():
    parser = argparse.ArgumentParser(description="Download Sketchfab models for Last Light Space")
    parser.add_argument("--token", help="Sketchfab API token from https://sketchfab.com/settings/password")
    args = parser.parse_args()

    token = args.token or os.environ.get("SKETCHFAB_API_TOKEN")
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../public/assets")
    os.makedirs(out_dir, exist_ok=True)

    if not token:
        print("提示: 未提供 Sketchfab API Token。")
        print("请在 https://sketchfab.com/settings/password 免费获取您的 API Token 并通过 --token 参数传入：")
        print("  python3 frontend/space-escape/scripts/import-sketchfab-assets.py --token <YOUR_TOKEN>")
        print("\n当前已启用的 14 大公网模型资产清单:")
        for m in MODELS:
            print(f"  - [{m['tag']:15}] {m['name']:30} -> {m['out']}")
        return

    headers = {"Authorization": f"Token {token}", "User-Agent": "Mozilla/5.0"}

    for item in MODELS:
        uid = item["uid"]
        name = item["name"]
        tag = item["tag"]
        model_dir = os.path.join(out_dir, "models", tag)
        gltf_file = os.path.join(model_dir, "scene.gltf")
        zip_path = os.path.join(out_dir, f"{tag}.zip")

        if os.path.exists(gltf_file):
            print(f"\n[已存在] {name} -> {model_dir}")
            continue

        if os.path.exists(zip_path) and not os.path.exists(gltf_file):
            try:
                print(f"\n[解压中] {name} 从 {zip_path}...")
                os.makedirs(model_dir, exist_ok=True)
                with zipfile.ZipFile(zip_path, "r") as z:
                    z.extractall(model_dir)
                print(f"  [解压完成] -> {model_dir}")
                continue
            except zipfile.BadZipFile:
                print(f"  [发现不完整压缩包，重新下载] {zip_path}")
                os.remove(zip_path)

        print(f"\n正在查询: {name} (UID: {uid})...")
        download_url = f"https://api.sketchfab.com/v3/models/{uid}/download"
        req = urllib.request.Request(download_url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())
                gltf_info = data.get("gltf")
                if not gltf_info:
                    print(f"  [跳过] 未返回 gltf 下载链接: {data}")
                    continue
                file_url = gltf_info["url"]
                size_mb = gltf_info.get("size", 0) / (1024 * 1024)
                print(f"  [下载中] 大小: {size_mb:.2f} MB...")
                
                urllib.request.urlretrieve(file_url, zip_path)
                print(f"  [下载成功] 已保存至: {zip_path}")

                print(f"  [解压中] -> {model_dir}...")
                os.makedirs(model_dir, exist_ok=True)
                with zipfile.ZipFile(zip_path, "r") as z:
                    z.extractall(model_dir)
                print(f"  [解压完成] -> {gltf_file}")
        except urllib.error.HTTPError as e:
            print(f"  [错误] HTTP {e.code}: {e.read().decode()}")
        except Exception as e:
            print(f"  [错误] {e}")

if __name__ == "__main__":
    main()
