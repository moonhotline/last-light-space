"""Convert and retarget the high-fidelity PEREGRINE EVA suit to standard Mixamo Humanoid.

Exports:
- frontend/space-escape/public/assets/explorer-v4.glb (Standard Humanoid SkinnedMesh with Idle, Walk, Run, Flight Mocap actions)
- frontend/space-escape/assets/source/explorer-v4.blend
- docs/space-escape/explorer-v4-cycles.png
"""
from pathlib import Path
import math
import shutil
import bpy
from mathutils import Euler, Quaternion

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "frontend" / "space-escape"
OUT = GAME / "public" / "assets"
SOURCE = GAME / "assets" / "source"
RENDER = ROOT / "docs" / "space-escape" / "explorer-v4-cycles.png"
MOCAP_SRC = Path("/tmp/xbot_inspect/Soldier.glb")
BASE_BLEND = SOURCE / "explorer-v4.blend"
CACHE_BLEND = Path("/tmp/astro_source_cache.blend")

OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

# Copy base blend to temporary cache so we can overwrite SOURCE / explorer-v4.blend later
if BASE_BLEND.exists() and not CACHE_BLEND.exists():
    shutil.copy2(BASE_BLEND, CACHE_BLEND)

# Step 1: Open clean slate & import standard Mixamo Mocap rig
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MOCAP_SRC))

arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.name = "Astronaut_Rig"
arm.data.name = "Astronaut_Armature"
vanguard = bpy.data.objects["vanguard_Mesh"]
visor_van = bpy.data.objects["vanguard_visor"]

# Clear any non-Soldier actions
valid_mocap = {"Idle", "Walk", "Run", "TPose"}
for act in list(bpy.data.actions):
    if act.name not in valid_mocap:
        bpy.data.actions.remove(act)

# Step 2: Append astronaut meshes from cache blend
with bpy.data.libraries.load(str(CACHE_BLEND)) as (data_from, data_to):
    data_to.objects = [name for name in data_from.objects if name in ["Mesh_0", "Mesh_1", "Mesh_2"]]

for obj in data_to.objects:
    bpy.context.collection.objects.link(obj)

mesh_backpack = bpy.data.objects["Mesh_0"]
mesh_visor = bpy.data.objects["Mesh_1"]
mesh_suit = bpy.data.objects["Mesh_2"]

# Clear any Icospheres or stray meshes
for o in list(bpy.data.objects):
    if "icosphere" in o.name.lower():
        bpy.data.objects.remove(o, do_unlink=True)

for m in [mesh_backpack, mesh_visor, mesh_suit]:
    m.vertex_groups.clear()
    for mod in list(m.modifiers):
        m.modifiers.remove(mod)

# Step 3: Match height to vanguard standard human height (1.83m)
van_pts = [vanguard.matrix_world @ v.co for v in vanguard.data.vertices]
van_h = max(p[2] for p in van_pts) - min(p[2] for p in van_pts)
suit_pts = [mesh_suit.matrix_world @ v.co for v in mesh_suit.data.vertices]
suit_h = max(p[2] for p in suit_pts) - min(p[2] for p in suit_pts)
scale_f = van_h / suit_h

for m in [mesh_backpack, mesh_visor, mesh_suit]:
    m.scale = (scale_f, scale_f, scale_f)
    bpy.context.view_layer.objects.active = m
    bpy.ops.object.transform_apply(scale=True)

# Step 4: Transfer skinning weights via DataTransfer from standard humanoid vanguard
mod = mesh_suit.modifiers.new(name="DataTransfer", type="DATA_TRANSFER")
mod.object = vanguard
mod.use_vert_data = True
mod.data_types_verts = {"VGROUP_WEIGHTS"}
mod.vert_mapping = "NEAREST"
bpy.context.view_layer.objects.active = mesh_suit
bpy.ops.object.datalayout_transfer(modifier="DataTransfer")
bpy.ops.object.modifier_apply(modifier="DataTransfer")

# Step 5: Backpack & Visor rigid attachment
# Backpack is solidly weighted 100% to Spine2 (upper back) to eliminate any seam tearing
vg_spine2 = mesh_backpack.vertex_groups.new(name="mixamorig:Spine2")
vg_spine2.add(range(len(mesh_backpack.data.vertices)), 1.0, "REPLACE")

vg_head = mesh_visor.vertex_groups.new(name="mixamorig:Head")
vg_head.add(range(len(mesh_visor.data.vertices)), 1.0, "REPLACE")

# Step 6: Parent meshes to Mixamo armature
for m in [mesh_backpack, mesh_visor, mesh_suit]:
    m.parent = arm
    m.parent_type = "OBJECT"
    arm_mod = m.modifiers.new(name="Armature", type="ARMATURE")
    arm_mod.object = arm

# Remove vanguard template meshes
bpy.data.objects.remove(vanguard, do_unlink=True)
bpy.data.objects.remove(visor_van, do_unlink=True)

# Step 7: Duplicate action aliases for Three.js findByName (idle, walk, run)
for name in ["Idle", "Walk", "Run"]:
    src = bpy.data.actions.get(name)
    if src:
        lower = src.copy()
        lower.name = name.lower()
        lower.use_fake_user = True
        src.use_fake_user = True

# Step 8: Author dynamic aerodynamic flight / jump hover action
float_act = bpy.data.actions.new(name="floating")
float_act.use_fake_user = True
arm.animation_data.action = float_act
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="POSE")

for pb in arm.pose.bones:
    pb.matrix_basis.identity()

rest_quats = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
FRAMES = 30
for f in range(1, FRAMES + 1):
    phi = 2 * math.pi * (f - 1) / FRAMES
    arm.pose.bones["mixamorig:Spine1"].rotation_quaternion = Euler((0.15 + 0.02 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["mixamorig:Spine1"]
    arm.pose.bones["mixamorig:Head"].rotation_quaternion = Euler((-0.12, 0, 0)).to_quaternion() @ rest_quats["mixamorig:Head"]
    arm.pose.bones["mixamorig:LeftUpLeg"].rotation_quaternion = Euler((-0.25 + 0.02 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["mixamorig:LeftUpLeg"]
    arm.pose.bones["mixamorig:RightUpLeg"].rotation_quaternion = Euler((-0.18 + 0.02 * math.cos(phi), 0, 0)).to_quaternion() @ rest_quats["mixamorig:RightUpLeg"]
    arm.pose.bones["mixamorig:LeftLeg"].rotation_quaternion = Euler((0.35 + 0.03 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["mixamorig:LeftLeg"]
    arm.pose.bones["mixamorig:RightLeg"].rotation_quaternion = Euler((0.45 + 0.03 * math.cos(phi), 0, 0)).to_quaternion() @ rest_quats["mixamorig:RightLeg"]
    arm.pose.bones["mixamorig:LeftArm"].rotation_quaternion = Euler((-0.20, 0, -0.15)).to_quaternion() @ rest_quats["mixamorig:LeftArm"]
    arm.pose.bones["mixamorig:RightArm"].rotation_quaternion = Euler((-0.20, 0, 0.15)).to_quaternion() @ rest_quats["mixamorig:RightArm"]
    
    for bname in ["mixamorig:Spine1", "mixamorig:Head", "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg", "mixamorig:LeftLeg", "mixamorig:RightLeg", "mixamorig:LeftArm", "mixamorig:RightArm"]:
        arm.pose.bones[bname].keyframe_insert(data_path="rotation_quaternion", frame=f)

bpy.ops.object.mode_set(mode="OBJECT")

# Step 9: Purge legacy actions so only clean Mocap actions remain
valid_actions = {"Idle", "idle", "Walk", "walk", "Run", "run", "floating"}
for act in list(bpy.data.actions):
    if act.name not in valid_actions or "." in act.name:
        bpy.data.actions.remove(act)

# Resize textures for WebGL performance
for img in bpy.data.images:
    w, h = img.size
    if w > 1024 or h > 1024:
        img.scale(min(w, 1024), min(h, 1024))

# Step 10: Export to GLB
glb_path = OUT / "explorer-v4.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_image_format="JPEG",
    export_image_quality=85
)
print("Exported standard Humanoid GLB to:", glb_path)

blend_path = SOURCE / "explorer-v4.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print("Saved blend file to:", blend_path)

# Step 11: Render Cycles preview
cam_data = bpy.data.cameras.new("Cam")
cam_obj = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam_obj)
cam_obj.location = (0, -3.6, 0.95)
cam_obj.rotation_euler = (1.5708, 0, 0)
bpy.context.scene.camera = cam_obj

sun_data = bpy.data.lights.new(name="KeyLight", type="SUN")
sun_data.energy = 4.0
sun_obj = bpy.data.objects.new("KeyLight", object_data=sun_data)
bpy.context.collection.objects.link(sun_obj)
sun_obj.location = (2, -3, 3)
sun_obj.rotation_euler = (0.6, 0.2, -0.4)

fill_data = bpy.data.lights.new(name="FillLight", type="SUN")
fill_data.energy = 2.0
fill_obj = bpy.data.objects.new("FillLight", object_data=fill_data)
bpy.context.collection.objects.link(fill_obj)
fill_obj.location = (-2, -3, 1.5)
fill_obj.rotation_euler = (0.8, -0.4, 0.6)

bpy.context.scene.render.resolution_x = 768
bpy.context.scene.render.resolution_y = 1024
bpy.context.scene.render.filepath = str(RENDER)
bpy.ops.render.render(write_still=True)
print("Rendered portrait to:", RENDER)
