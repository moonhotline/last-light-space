"""Convert and optimize the high-fidelity PEREGRINE EVA suit (explorer-v4).

Exports:
- frontend/space-escape/public/assets/explorer-v4.glb (PBR SkinnedMesh with 4 animations)
- frontend/space-escape/assets/source/explorer-v4.blend
- docs/space-escape/explorer-v4-cycles.png
"""
from pathlib import Path
import urllib.request
import bpy

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

# Remove Icosphere mesh and objects
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

# Scale model by 0.8 to fit 1.9m height
arm.scale = (0.8, 0.8, 0.8)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# Resize all textures to 1024x1024
for img in bpy.data.images:
    w, h = img.size
    if w > 1024 or h > 1024:
        img.scale(min(w, 1024), min(h, 1024))

glb_path = OUT / "explorer-v4.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_image_format="JPEG",
    export_image_quality=85
)
print("Exported GLB to:", glb_path)

blend_path = SOURCE / "explorer-v4.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print("Saved blend file to:", blend_path)

# Setup camera and lighting for portrait
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
