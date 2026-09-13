"""Burn bilingual captions into the real gameplay recording. Requires Pillow and FFmpeg."""
from pathlib import Path
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[3]
output = root / "docs/space-escape"
source = output / "last-light-gameplay.mp4"
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(source)],
    check=True, capture_output=True, text=True,
)
duration = float(json.loads(probe.stdout)["format"]["duration"])
font_file = Path("/System/Library/Fonts/STHeiti Medium.ttc")
if not font_file.exists():
    raise SystemExit("Set font_file to an installed Chinese font before running on another OS.")
title_font = ImageFont.truetype(str(font_file), 28)
detail_font = ImageFont.truetype(str(font_file), 17)
captions = [
    (0.0, 3.0, "LAST LIGHT / 余晖", "空间站合作撤离 · 单人实机 · 加速剪辑"),
    (3.0, 9.6, "01 / 恢复供电", "维修工程终端，打开反应堆"),
    (9.6, 15.0, "02 / 回收核心", "扫描危险，带走能源"),
    (15.0, 24.4, "03 / 带着战利品撤离", "负重会减速，及时返回气闸"),
    (24.4, duration, "任务完成 / MISSION COMPLETE", "创建房间，邀请队友一起出发"),
]
caption_dir = output / "captions"
caption_dir.mkdir(exist_ok=True)
arguments = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source)]
filters = []
srt = []

def timestamp(seconds):
    ms = round(seconds * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

for index, (start, end, title, detail) in enumerate(captions, 1):
    panel = Image.new("RGBA", (620, 86), (0, 0, 0, 0))
    draw = ImageDraw.Draw(panel)
    draw.rounded_rectangle((0, 0, 619, 85), radius=9, fill=(9, 24, 27, 230), outline=(99, 162, 154, 220))
    draw.text((310, 12), title, anchor="mt", font=title_font, fill=(161, 244, 209))
    draw.text((310, 53), detail, anchor="mt", font=detail_font, fill=(238, 243, 240))
    path = caption_dir / f"{index}.png"
    panel.save(path)
    arguments += ["-loop", "1", "-i", str(path)]
    previous = "0:v" if index == 1 else f"v{index - 1}"
    filters.append(f"[{previous}][{index}:v]overlay=(W-w)/2:84:enable='gte(t,{start})*lt(t,{end})'[v{index}]")
    srt.append(f"{index}\n{timestamp(start)} --> {timestamp(end)}\n{title}\n{detail}\n")

(output / "last-light-trailer.srt").write_text("\n".join(srt), encoding="utf-8")
arguments += [
    "-filter_complex", ";".join(filters), "-map", f"[v{len(captions)}]", "-map", "0:a",
    "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-t", str(duration), "-movflags", "+faststart", str(output / "last-light-trailer.mp4"),
]
subprocess.run(arguments, check=True)
print(output / "last-light-trailer.mp4")
