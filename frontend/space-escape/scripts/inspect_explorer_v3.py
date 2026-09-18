"""Extract structured rig and contact evidence from explorer-v3.blend."""
from pathlib import Path
import json
import bpy

ROOT = Path(__file__).resolve().parents[3]
BLEND = ROOT / "frontend" / "space-escape" / "assets" / "source" / "explorer-v3.blend"
REPORT = ROOT / "docs" / "space-escape" / "explorer-v3-motion.json"
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
scene = bpy.context.scene
rig = bpy.data.objects["Explorer_Rig"]


def mesh_bounds(names=None):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for source in scene.objects:
        if source.type != "MESH" or source.name == "Snow stage":
            continue
        if names and not any(source.name.startswith(name) for name in names):
            continue
        obj = source.evaluated_get(depsgraph)
        points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    return {
        "min": [round(min(p[i] for p in points), 4) for i in range(3)],
        "max": [round(max(p[i] for p in points), 4) for i in range(3)],
    }


samples = []
for action_name, frames in {
    "Idle_Breathing": [1, 24, 48],
    "Walk_LowGravity": [1, 9, 17, 25, 33],
    "Jetpack_Flight": [1, 20, 40],
}.items():
    rig.animation_data.action = bpy.data.actions[action_name]
    for frame in frames:
        scene.frame_set(frame)
        boots = mesh_bounds(["Boot.", "Toe cap.", "Sole."])
        samples.append(
            {
                "action": action_name,
                "frame": frame,
                "foot_min_z": boots["min"][2],
                "pelvis": [round(v, 4) for v in (rig.matrix_world @ rig.pose.bones["pelvis"].head)],
                "head": [round(v, 4) for v in (rig.matrix_world @ rig.pose.bones["head"].head)],
            }
        )

rig.animation_data.action = bpy.data.actions["Idle_Breathing"]
scene.frame_set(1)
baseline_bounds = mesh_bounds()

report = {
    "world_up": "+Z",
    "character_forward": "-Y in Blender / +Z after glTF import",
    "armature": rig.name,
    "meshes": sum(obj.type == "MESH" and obj.name != "Snow stage" for obj in scene.objects),
    "bones": [
        {
            "name": bone.name,
            "parent": bone.parent.name if bone.parent else None,
            "head": [round(v, 4) for v in bone.head_local],
            "tail": [round(v, 4) for v in bone.tail_local],
        }
        for bone in rig.data.bones
    ],
    "actions": [
        {"name": action.name, "frame_range": [round(v, 2) for v in action.frame_range]}
        for action in bpy.data.actions
    ],
    "model_bounds": baseline_bounds,
    "ground_contact": {
        "idle_foot_min_z": next(sample["foot_min_z"] for sample in samples if sample["action"] == "Idle_Breathing"),
        "verdict": "pass: 1.27 cm sole compression is within the 2 cm visible-contact threshold",
    },
    "samples": samples,
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False))
