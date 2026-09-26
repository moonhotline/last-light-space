"""Convert and optimize the high-fidelity PEREGRINE EVA suit (explorer-v4) with game-ready animations.

Exports:
- frontend/space-escape/public/assets/explorer-v4.glb (PBR SkinnedMesh with 5 animations)
- frontend/space-escape/assets/source/explorer-v4.blend
- docs/space-escape/explorer-v4-cycles.png
"""
from pathlib import Path
import math
import urllib.request
import bpy
from mathutils import Euler, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "frontend" / "space-escape"
OUT = GAME / "public" / "assets"
SOURCE = GAME / "assets" / "source"
RENDER = ROOT / "docs" / "space-escape" / "explorer-v4-cycles.png"
CACHE_SRC = Path("/tmp/model_inspect/ankita_astronaut.glb")

OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

if not CACHE_SRC.exists():
    print("Downloading base astronaut asset...")
    url = "https://raw.githubusercontent.com/ankita-kanchan/space_astronaut/main/public/astronaut.glb"
    CACHE_SRC.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, CACHE_SRC)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(CACHE_SRC))

# Remove Icosphere diorama mesh and objects
for obj in list(bpy.data.objects):
    if "Icosphere" in obj.name or (obj.type == "MESH" and "Icosphere" in obj.data.name):
        bpy.data.objects.remove(obj, do_unlink=True)
for m in list(bpy.data.meshes):
    if "Icosphere" in m.name:
        bpy.data.meshes.remove(m, do_unlink=True)

# Find armature
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
arm.name = "Astronaut_Rig"
arm.data.name = "Astronaut_Armature"

# Scale model by 0.8 to fit standard 1.9m suit height
arm.scale = (0.8, 0.8, 0.8)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# Resize high-res 4K textures to 1024x1024 for WebGL runtime efficiency
for img in bpy.data.images:
    w, h = img.size
    if w > 1024 or h > 1024:
        img.scale(min(w, 1024), min(h, 1024))

# Prepare animation setup
bpy.ops.object.mode_set(mode="POSE")
if not arm.animation_data:
    arm.animation_data_create()

# Delete diorama showcase actions
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)

rest_quats = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
rest_locs = {pb.name: pb.location.copy() for pb in arm.pose.bones}
rest_scales = {pb.name: pb.scale.copy() for pb in arm.pose.bones}

def create_action(name, num_frames, key_fn):
    act = bpy.data.actions.new(name=name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(1, num_frames + 1):
        phi = 2 * math.pi * (f - 1) / num_frames
        # Reset all bones to rest
        for pb in arm.pose.bones:
            pb.rotation_quaternion = rest_quats[pb.name].copy()
            pb.location = rest_locs[pb.name].copy()
            pb.scale = rest_scales[pb.name].copy()
        
        # Apply authored keyframe pose
        key_fn(f, phi)
        
        # Insert keyframe on all bones for clean cross-fading
        for pb in arm.pose.bones:
            pb.keyframe_insert(data_path="rotation_quaternion", frame=f)
            if pb.name == "Hip.81":
                pb.keyframe_insert(data_path="location", frame=f)
    return act

# 1. Locomotion Cycle (moon_walk & walk) - 32 frames, full 0.9m stride, natural knee tuck
def key_walk(f, phi):
    # Thighs: dynamic forward/backward stride (+-28 deg)
    arm.pose.bones["L_Thigh.82"].rotation_quaternion = Euler((0, 0, 0.48 * math.sin(phi))).to_quaternion() @ rest_quats["L_Thigh.82"]
    arm.pose.bones["R_Thigh.88"].rotation_quaternion = Euler((0, 0, -0.48 * math.sin(phi))).to_quaternion() @ rest_quats["R_Thigh.88"]
    
    # Knees: human bipedal flexion during swing phase (tucks heel up to clear ground)
    arm.pose.bones["L_Knee.83"].rotation_quaternion = Euler((0, 0, -0.12 - 0.65 * max(0.0, math.cos(phi))**1.5)).to_quaternion() @ rest_quats["L_Knee.83"]
    arm.pose.bones["R_Knee.89"].rotation_quaternion = Euler((0, 0, -0.12 - 0.65 * max(0.0, math.cos(phi + math.pi))**1.5)).to_quaternion() @ rest_quats["R_Knee.89"]
    
    # Ankles: landing & push-off flexion
    arm.pose.bones["L_Ankle.84"].rotation_quaternion = Euler((0, 0, 0.15 * math.sin(phi))).to_quaternion() @ rest_quats["L_Ankle.84"]
    arm.pose.bones["R_Ankle.90"].rotation_quaternion = Euler((0, 0, -0.15 * math.sin(phi))).to_quaternion() @ rest_quats["R_Ankle.90"]
    
    # Arms: natural counter-swing opposite to legs
    arm.pose.bones["L_Arm.10"].rotation_quaternion = Euler((-0.38 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["L_Arm.10"]
    arm.pose.bones["R_Arm.44"].rotation_quaternion = Euler((0.38 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["R_Arm.44"]
    
    # Elbows: athletic bend
    arm.pose.bones["L_Elbow.11"].rotation_quaternion = Euler((0, -0.40 - 0.15 * math.sin(phi), 0)).to_quaternion() @ rest_quats["L_Elbow.11"]
    arm.pose.bones["R_Elbow.45"].rotation_quaternion = Euler((0, 0.40 + 0.15 * math.sin(phi), 0)).to_quaternion() @ rest_quats["R_Elbow.45"]
    
    # Spine forward athletic lean & pelvic counter-twist
    arm.pose.bones["Spine_2.7"].rotation_quaternion = Euler((0.12 + 0.02 * math.cos(2 * phi), 0, 0.04 * math.sin(phi))).to_quaternion() @ rest_quats["Spine_2.7"]
    arm.pose.bones["Hip.81"].location = rest_locs["Hip.81"] + Vector((0, 0, -1.0 * abs(math.sin(phi))))

create_action("moon_walk", 32, key_walk)
create_action("walk", 32, key_walk)

# 2. Idle - 60 frames, natural breathing posture
def key_idle(f, phi):
    arm.pose.bones["Spine_2.7"].rotation_quaternion = Euler((0.02 + 0.018 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["Spine_2.7"]
    arm.pose.bones["head.42"].rotation_quaternion = Euler((-0.012 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["head.42"]
    arm.pose.bones["L_Arm.10"].rotation_quaternion = Euler((0.015 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["L_Arm.10"]
    arm.pose.bones["R_Arm.44"].rotation_quaternion = Euler((-0.015 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["R_Arm.44"]
    arm.pose.bones["L_Elbow.11"].rotation_quaternion = Euler((0, -0.28 - 0.02 * math.sin(phi), 0)).to_quaternion() @ rest_quats["L_Elbow.11"]
    arm.pose.bones["R_Elbow.45"].rotation_quaternion = Euler((0, 0.28 + 0.02 * math.sin(phi), 0)).to_quaternion() @ rest_quats["R_Elbow.45"]

create_action("idle", 60, key_idle)

# 3. Floating / Jetpack Flight - 40 frames, aerodynamic slipstream pose
def key_floating(f, phi):
    # Dynamic flight posture: spine arched forward, head looking ahead
    arm.pose.bones["Spine_2.7"].rotation_quaternion = Euler((0.20 + 0.03 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["Spine_2.7"]
    arm.pose.bones["head.42"].rotation_quaternion = Euler((-0.18, 0, 0)).to_quaternion() @ rest_quats["head.42"]
    
    # Trailing legs in slipstream
    thigh_l = -0.30 + 0.03 * math.sin(phi)
    thigh_r = -0.20 + 0.03 * math.cos(phi)
    knee_l = -0.42 + 0.04 * math.sin(phi)
    knee_r = -0.58 + 0.04 * math.cos(phi)
    arm.pose.bones["L_Thigh.82"].rotation_quaternion = Euler((0, 0, thigh_l)).to_quaternion() @ rest_quats["L_Thigh.82"]
    arm.pose.bones["R_Thigh.88"].rotation_quaternion = Euler((0, 0, thigh_r)).to_quaternion() @ rest_quats["R_Thigh.88"]
    arm.pose.bones["L_Knee.83"].rotation_quaternion = Euler((0, 0, knee_l)).to_quaternion() @ rest_quats["L_Knee.83"]
    arm.pose.bones["R_Knee.89"].rotation_quaternion = Euler((0, 0, knee_r)).to_quaternion() @ rest_quats["R_Knee.89"]
    arm.pose.bones["L_Ankle.84"].rotation_quaternion = Euler((0, 0, 0.20)).to_quaternion() @ rest_quats["L_Ankle.84"]
    arm.pose.bones["R_Ankle.90"].rotation_quaternion = Euler((0, 0, 0.25)).to_quaternion() @ rest_quats["R_Ankle.90"]
    
    # Arms stabilized
    arm.pose.bones["L_Arm.10"].rotation_quaternion = Euler((-0.20 + 0.03 * math.sin(phi), 0, 0)).to_quaternion() @ rest_quats["L_Arm.10"]
    arm.pose.bones["R_Arm.44"].rotation_quaternion = Euler((-0.20 + 0.03 * math.cos(phi), 0, 0)).to_quaternion() @ rest_quats["R_Arm.44"]
    arm.pose.bones["L_Elbow.11"].rotation_quaternion = Euler((0, -0.38, 0)).to_quaternion() @ rest_quats["L_Elbow.11"]
    arm.pose.bones["R_Elbow.45"].rotation_quaternion = Euler((0, 0.38, 0)).to_quaternion() @ rest_quats["R_Elbow.45"]
    arm.pose.bones["Hip.81"].location = rest_locs["Hip.81"] + Vector((0, 0, 0.8 * math.sin(phi)))

create_action("floating", 40, key_floating)

# 4. Wave - 40 frames, friendly greeting emote
def key_wave(f, phi):
    arm.pose.bones["L_Arm.10"].rotation_quaternion = rest_quats["L_Arm.10"].copy()
    arm.pose.bones["L_Elbow.11"].rotation_quaternion = rest_quats["L_Elbow.11"].copy()
    arm.pose.bones["R_Arm.44"].rotation_quaternion = Euler((0.85, 0, -0.35)).to_quaternion() @ rest_quats["R_Arm.44"]
    arm.pose.bones["R_Elbow.45"].rotation_quaternion = Euler((0, 0.85, 0.30 * math.sin(4 * phi))).to_quaternion() @ rest_quats["R_Elbow.45"]
    arm.pose.bones["R_Wrist.46"].rotation_quaternion = Euler((0, 0, 0.35 * math.sin(4 * phi))).to_quaternion() @ rest_quats["R_Wrist.46"]

create_action("wave", 40, key_wave)

bpy.ops.object.mode_set(mode="OBJECT")

glb_path = OUT / "explorer-v4.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_image_format="JPEG",
    export_image_quality=85
)
print("Exported GLB with game actions to:", glb_path)

blend_path = SOURCE / "explorer-v4.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print("Saved blend file to:", blend_path)

# Setup camera and lighting for portrait render
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
