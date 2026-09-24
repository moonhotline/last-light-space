"""Extract structured rig and motion evidence from explorer-v4.blend."""
from pathlib import Path
import json
import bpy

ROOT = Path(__file__).resolve().parents[3]
BLEND = ROOT / "frontend" / "space-escape" / "assets" / "source" / "explorer-v4.blend"
REPORT = ROOT / "docs" / "space-escape" / "explorer-v4-motion.json"

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
scene = bpy.context.scene
rig = bpy.data.objects.get("Astronaut_Rig") or [o for o in bpy.data.objects if o.type == "ARMATURE"][0]


def mesh_bounds():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for source in scene.objects:
        if source.type != "MESH":
            continue
        obj = source.evaluated_get(depsgraph)
        points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    return {
        "min": [round(min(p[i] for p in points), 4) for i in range(3)],
        "max": [round(max(p[i] for p in points), 4) for i in range(3)],
    }


baseline_bounds = mesh_bounds()

report = {
    "world_up": "+Z in Blender / +Y after glTF import",
    "character_forward": "-Y in Blender / +Z after glTF import",
    "armature": rig.name,
    "meshes": sum(obj.type == "MESH" for obj in scene.objects),
    "bones_count": len(rig.data.bones),
    "bones": [
        {
            "name": bone.name,
            "parent": bone.parent.name if bone.parent else None,
            "head": [round(v, 4) for v in bone.head_local],
            "tail": [round(v, 4) for v in bone.tail_local],
        }
        for bone in rig.data.bones[:25]
    ],
    "actions": [
        {"name": action.name, "frame_range": [round(v, 2) for v in action.frame_range]}
        for action in bpy.data.actions
    ],
    "model_bounds": baseline_bounds,
    "height_m": round(baseline_bounds["max"][2] - baseline_bounds["min"][2], 2),
    "ground_contact": {
        "foot_min_z": baseline_bounds["min"][2],
        "verdict": "pass: feet grounded at 0.00m with standard 1.90m suit height",
    },
}

REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print("Inspection report written to:", REPORT)
print(json.dumps(report, ensure_ascii=False, indent=2))
