"""Convert and optimize the high-fidelity PEREGRINE EVA suit (explorer-v4) on standard Humanoid rig.

Exports:
- frontend/space-escape/public/assets/explorer-v4.glb (PBR SkinnedMesh with 4 Mocap actions)
- frontend/space-escape/assets/source/explorer-v4.blend
- docs/space-escape/explorer-v4-cycles.png
"""
from pathlib import Path
import math
import shutil
import time
import bpy
from mathutils import Matrix, Euler
from mathutils.kdtree import KDTree

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

if BASE_BLEND.exists() and not CACHE_BLEND.exists():
    shutil.copy2(BASE_BLEND, CACHE_BLEND)

# Step 1: Open clean slate & import standard Mixamo Mocap rig
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MOCAP_SRC))
bpy.ops.object.select_all(action="DESELECT")

arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
vanguard = bpy.data.objects["vanguard_Mesh"]
visor_van = bpy.data.objects["vanguard_visor"]

# Keep track of genuine mocap action objects from Soldier.glb
mocap_actions = {act.name: act for act in bpy.data.actions if act.name in {"Idle", "Walk", "Run"}}

# Step 2: Append astronaut meshes from cache blend
with bpy.data.libraries.load(str(CACHE_BLEND)) as (data_from, data_to):
    data_to.objects = [name for name in data_from.objects if name in ["Mesh_0", "Mesh_1", "Mesh_2"]]

for obj in data_to.objects:
    bpy.context.collection.objects.link(obj)

# CRITICAL FIX: Purge any legacy actions dragged in by the blend library
for act in list(bpy.data.actions):
    if act not in mocap_actions.values():
        bpy.data.actions.remove(act)

mesh_backpack = bpy.data.objects["Mesh_0"]
mesh_visor = bpy.data.objects["Mesh_1"]
mesh_suit = bpy.data.objects["Mesh_2"]

for o in list(bpy.data.objects):
    if "icosphere" in o.name.lower():
        bpy.data.objects.remove(o, do_unlink=True)

for m in [mesh_backpack, mesh_visor, mesh_suit]:
    m.vertex_groups.clear()
    for mod in list(m.modifiers):
        m.modifiers.remove(mod)

# Step 3: Match height and transform suit into vanguard local armature space
# In Vanguard local coords: Y is height (-183 to 0), Z is depth, X is width
# In suit raw coords: Z is height (0 to 237), Y is depth, X is width
van_pts = [v.co for v in vanguard.data.vertices]
van_h = max(p[1] for p in van_pts) - min(p[1] for p in van_pts)
suit_pts = [v.co for v in mesh_suit.data.vertices]
suit_h = max(p[2] for p in suit_pts) - min(p[2] for p in suit_pts)
s = van_h / suit_h

# Rot matrix -90 deg on X: (x, y, z) -> (s*x, -s*z, s*y)
M = Matrix((
    (s,  0,  0, 0),
    (0,  0, -s, 0),
    (0,  s,  0, 0),
    (0,  0,  0, 1)
))

for m in [mesh_backpack, mesh_visor, mesh_suit]:
    for v in m.data.vertices:
        v.co = M @ v.co
    m.data.update()
    m.parent = arm
    m.matrix_local.identity()
    m.matrix_parent_inverse.identity()
    arm_mod = m.modifiers.new(name="Armature", type="ARMATURE")
    arm_mod.object = arm

# Step 4: Robust KDTree skinning weight transfer in local space from vanguard to suit
t0 = time.time()
kd = KDTree(len(vanguard.data.vertices))
for i, v in enumerate(vanguard.data.vertices):
    kd.insert(v.co, i)
kd.balance()

dst_groups = {}
for vg in vanguard.vertex_groups:
    dst_groups[vg.index] = mesh_suit.vertex_groups.new(name=vg.name)

src_vert_groups = [v.groups for v in vanguard.data.vertices]
for i, v in enumerate(mesh_suit.data.vertices):
    co, src_idx, dist = kd.find(v.co)
    for g in src_vert_groups[src_idx]:
        if g.group in dst_groups:
            dst_groups[g.group].add([i], g.weight, "REPLACE")

print(f"Transferred skinning weights to {len(mesh_suit.data.vertices)} suit vertices in {time.time() - t0:.2f}s.")

# Step 5: Backpack & Visor rigid attachment
vg_spine2 = mesh_backpack.vertex_groups.new(name="mixamorig:Spine2")
vg_spine2.add(range(len(mesh_backpack.data.vertices)), 1.0, "REPLACE")

vg_head = mesh_visor.vertex_groups.new(name="mixamorig:Head")
vg_head.add(range(len(mesh_visor.data.vertices)), 1.0, "REPLACE")

bpy.data.objects.remove(vanguard, do_unlink=True)
bpy.data.objects.remove(visor_van, do_unlink=True)

# Step 6: Standardize bone names (strip colon prefix to prevent Three.js sanitizeNodeName discrepancies)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="OBJECT")

bone_name_map = {}
for b in arm.data.bones:
    old_name = b.name
    new_name = old_name.replace("mixamorig:", "")
    b.name = new_name
    bone_name_map[old_name] = new_name

print("Renamed", len(bone_name_map), "bones to colon-free standard names.")

# Rename vertex groups on all meshes to match new bone names
for m in [mesh_backpack, mesh_visor, mesh_suit]:
    for vg in m.vertex_groups:
        if vg.name in bone_name_map:
            vg.name = bone_name_map[vg.name]

# Step 7: Update animation fcurves to new bone names and lowercase action names
for act in list(bpy.data.actions):
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    fc.data_path = fc.data_path.replace("mixamorig:", "")
    act.name = act.name.lower()
    act.use_fake_user = True

# Sample idle pose for natural arm base
arm.animation_data.action = bpy.data.actions["idle"]
bpy.context.scene.frame_set(1)
idle_quats = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}

# Step 8: Author aerodynamic floating flight action (Iron-man / skydiver posture)
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
    
    # Torso and head
    arm.pose.bones["Spine"].rotation_quaternion = Euler((0.15, 0, 0)).to_quaternion() @ rest_quats["Spine"]
    arm.pose.bones["Spine1"].rotation_quaternion = Euler((0.12 + 0.02 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["Spine1"]
    arm.pose.bones["Head"].rotation_quaternion = Euler((-0.20, 0, 0)).to_quaternion() @ rest_quats["Head"]
    
    # Trailing legs with bent knees
    arm.pose.bones["LeftUpLeg"].rotation_quaternion = Euler((-0.45 + 0.02 * math.sin(phi), 0, -0.06)).to_quaternion() @ rest_quats["LeftUpLeg"]
    arm.pose.bones["RightUpLeg"].rotation_quaternion = Euler((-0.38 + 0.02 * math.cos(phi), 0, 0.06)).to_quaternion() @ rest_quats["RightUpLeg"]
    arm.pose.bones["LeftLeg"].rotation_quaternion = Euler((0.95 + 0.03 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["LeftLeg"]
    arm.pose.bones["RightLeg"].rotation_quaternion = Euler((1.05 + 0.03 * math.cos(phi), 0, 0)).to_quaternion() @ rest_quats["RightLeg"]
    arm.pose.bones["LeftFoot"].rotation_quaternion = Euler((0.40, 0, 0)).to_quaternion() @ rest_quats["LeftFoot"]
    arm.pose.bones["RightFoot"].rotation_quaternion = Euler((0.45, 0, 0)).to_quaternion() @ rest_quats["RightFoot"]
    
    # Symmetrical streamlined tucked arms (down by sides/hips, elbows bent slightly back)
    arm.pose.bones["LeftShoulder"].rotation_quaternion = Euler((0, 0, -0.05)).to_quaternion() @ rest_quats["LeftShoulder"]
    arm.pose.bones["RightShoulder"].rotation_quaternion = Euler((0, 0, 0.05)).to_quaternion() @ rest_quats["RightShoulder"]
    arm.pose.bones["LeftArm"].rotation_quaternion = Euler((0.15, 0, 0)).to_quaternion() @ idle_quats["LeftArm"]
    arm.pose.bones["RightArm"].rotation_quaternion = Euler((0.15, 0, 0)).to_quaternion() @ idle_quats["RightArm"]
    arm.pose.bones["LeftForeArm"].rotation_quaternion = Euler((-0.25, 0, 0)).to_quaternion() @ idle_quats["LeftForeArm"]
    arm.pose.bones["RightForeArm"].rotation_quaternion = Euler((0.25, 0, 0)).to_quaternion() @ idle_quats["RightForeArm"]
    
    for bname in [
        "Spine", "Spine1", "Head",
        "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
        "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"
    ]:
        arm.pose.bones[bname].keyframe_insert(data_path="rotation_quaternion", frame=f)

bpy.ops.object.mode_set(mode="OBJECT")

# Step 9: Purge any non-standard actions
valid_actions = {"idle", "walk", "run", "floating"}
for act in list(bpy.data.actions):
    if act.name not in valid_actions or "." in act.name:
        bpy.data.actions.remove(act)

print("Exporting animations:", [a.name for a in bpy.data.actions])

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
cam_obj.location = (0, 3.2, 1.1)
cam_obj.rotation_euler = (1.5708, 0, 3.14159)
bpy.context.scene.camera = cam_obj

sun_data = bpy.data.lights.new(name="KeyLight", type="SUN")
sun_data.energy = 4.0
sun_obj = bpy.data.objects.new("KeyLight", object_data=sun_data)
bpy.context.collection.objects.link(sun_obj)
sun_obj.location = (2, 3, 3)
sun_obj.rotation_euler = (0.6, -0.2, 2.7)

fill_data = bpy.data.lights.new(name="FillLight", type="SUN")
fill_data.energy = 2.0
fill_obj = bpy.data.objects.new("FillLight", object_data=fill_data)
bpy.context.collection.objects.link(fill_obj)
fill_obj.location = (-2, 3, 1.5)
fill_obj.rotation_euler = (0.8, 0.4, 3.6)

bpy.context.scene.render.resolution_x = 768
bpy.context.scene.render.resolution_y = 1024
bpy.context.scene.render.filepath = str(RENDER)
bpy.ops.render.render(write_still=True)
print("Rendered portrait to:", RENDER)
