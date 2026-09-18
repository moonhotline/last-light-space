"""Build the PEREGRINE-07 articulated EVA suit, export GLB, and render in Cycles."""
from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "frontend" / "space-escape"
OUT = GAME / "public" / "assets"
SOURCE = GAME / "assets" / "source"
RENDER = ROOT / "docs" / "space-escape" / "explorer-v3-cycles.png"
SOURCE.mkdir(parents=True, exist_ok=True)

# Reuse the project's metered primitive/material helpers without generating the older props.
helper = Path(__file__).with_name("generate_assets.py").read_text()
exec(helper.split("cylinder('containment base'")[0])


def bind_bone(obj, armature, bone):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = matrix
    return obj


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, position in zip(spline.bezier_points, points):
        point.co = position
        point.handle_left_type = point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def label(text, location, size, mat, parent, bone, rotation=(math.pi / 2, 0, 0)):
    curve = bpy.data.curves.new("Marking " + text, "FONT")
    curve.body = text
    curve.size = size
    curve.extrude = 0.001
    curve.align_x = "CENTER"
    obj = bpy.data.objects.new("Marking " + text, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return bind_bone(obj, parent, bone)


ceramic = material("Polar ivory ceramic", (0.69, 0.75, 0.76), 0.22)
ceramic.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.31
graphite = material("Graphite pressure weave", (0.018, 0.027, 0.033), 0.18)
titanium = material("Brushed titanium", (0.13, 0.17, 0.19), 0.82)
ochre = material("Rescue ochre", (0.84, 0.34, 0.055), 0.28)
gold = material("Gold visor", (0.34, 0.15, 0.025), 0.72)
gold.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.08
phosphor = material("Instrument cyan", (0.08, 0.66, 0.95), 0.35, 4.5)
white = material("Helmet luminaire", (0.95, 0.82, 0.62), 0.05, 5.0)

# Semantic humanoid armature. Runtime code drives these exact bone names.
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
rig = bpy.context.object
rig.name = "Explorer_Rig"
armature = rig.data
armature.name = "Explorer_Armature"
base = armature.edit_bones[0]
armature.edit_bones.remove(base)


def bone(name, head, tail, parent=None):
    b = armature.edit_bones.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = armature.edit_bones[parent]
    return b


bone("root", (0, 0, 0.02), (0, 0, 0.22))
bone("pelvis", (0, 0, 0.83), (0, 0, 1.04), "root")
bone("body", (0, 0, 1.02), (0, 0, 1.48), "pelvis")
bone("head", (0, 0, 1.50), (0, 0, 1.92), "body")
for side, x in (("L", -0.17), ("R", 0.17)):
    bone("leg_" + side, (x, 0, 0.94), (x, 0, 0.56), "pelvis")
    bone("knee_" + side, (x, 0, 0.56), (x, -0.025, 0.18), "leg_" + side)
    bone("foot_" + side, (x, -0.02, 0.18), (x, -0.27, 0.12), "knee_" + side)
    sx = -0.35 if side == "L" else 0.35
    bone("arm_" + side, (sx, 0, 1.42), (sx, 0, 1.08), "body")
    bone("elbow_" + side, (sx, 0, 1.08), (sx, -0.02, 0.80), "arm_" + side)
    bone("hand_" + side, (sx, -0.02, 0.80), (sx, -0.08, 0.68), "elbow_" + side)
bpy.ops.object.mode_set(mode="OBJECT")
rig.show_in_front = True


def attach(objects, bone_name):
    for obj in objects:
        bind_bone(obj, rig, bone_name)


# Torso: compact hard-shell plates around a flexible pressure layer.
attach(
    [
        box("Pressure torso", (0, 0, 1.25), (0.53, 0.34, 0.52), ceramic, 0.10),
        box("Abdominal weave", (0, -0.01, 1.02), (0.43, 0.31, 0.13), graphite, 0.045),
        box("Chest control unit", (0, -0.365, 1.31), (0.30, 0.055, 0.23), titanium, 0.035),
        box("Life support pack", (0, 0.34, 1.27), (0.47, 0.20, 0.50), ceramic, 0.07),
    ],
    "body",
)
for x in (-0.19, 0.19):
    attach(
        [
            cylinder("Oxygen cylinder", (x, 0.49, 1.27), 0.085, 0.52, titanium, 28),
            cylinder("Ion nozzle", (x, 0.49, 0.92), 0.067, 0.16, graphite, 24),
            cylinder("Nozzle glow", (x, 0.49, 0.82), 0.042, 0.025, phosphor, 20),
        ],
        "body",
    )
for row in range(4):
    attach([box("Pack radiator", (0, 0.555, 1.16 + row * 0.09), (0.30, 0.014, 0.022), graphite, 0.004)], "body")
for column in range(3):
    attach([box("Status diode", (-0.075 + column * 0.075, -0.427, 1.35), (0.045, 0.013, 0.035), phosphor, 0.004)], "body")
label("07", (0, -0.429, 1.23), 0.065, ceramic, rig, "body")

# Helmet and asymmetric field instrumentation.
attach(
    [
        cylinder("Neck bearing", (0, 0, 1.53), 0.21, 0.11, titanium, 32),
        sphere("Helmet shell", (0, 0, 1.79), (0.31, 0.29, 0.32), ceramic),
        sphere("Visor seal", (0, -0.19, 1.79), (0.275, 0.16, 0.255), graphite),
        sphere("Gold visor", (0, -0.215, 1.80), (0.252, 0.145, 0.225), gold),
        box("Helmet lamp", (-0.18, -0.25, 1.99), (0.075, 0.045, 0.035), white, 0.012),
        box("Telemetry crown", (0.20, 0.0, 2.02), (0.055, 0.12, 0.045), titanium, 0.014),
    ],
    "head",
)

for side, sign in (("L", -1), ("R", 1)):
    arm = "arm_" + side
    elbow = "elbow_" + side
    hand = "hand_" + side
    leg = "leg_" + side
    knee = "knee_" + side
    foot = "foot_" + side
    attach(
        [
            sphere("Shoulder bearing." + side, (sign * 0.35, 0, 1.42), (0.14, 0.15, 0.15), graphite),
            box("Bicep shell." + side, (sign * 0.36, 0, 1.24), (0.19, 0.23, 0.27), ceramic, 0.065),
            box("Shoulder flash." + side, (sign * 0.47, -0.03, 1.39), (0.035, 0.19, 0.12), ochre, 0.012),
        ],
        arm,
    )
    attach(
        [
            sphere("Elbow seal." + side, (sign * 0.36, 0, 1.07), (0.105, 0.115, 0.105), graphite),
            box("Forearm shell." + side, (sign * 0.37, -0.015, 0.93), (0.18, 0.21, 0.24), ceramic, 0.06),
        ],
        elbow,
    )
    attach(
        [
            sphere("Glove." + side, (sign * 0.37, -0.045, 0.77), (0.105, 0.12, 0.12), graphite),
            box("Wrist computer." + side, (sign * 0.37, -0.155, 0.84), (0.15, 0.075, 0.11), phosphor if side == "L" else titanium, 0.025),
        ],
        hand,
    )
    attach(
        [
            sphere("Hip seal." + side, (sign * 0.17, 0, 0.93), (0.14, 0.14, 0.14), graphite),
            box("Thigh liner." + side, (sign * 0.17, 0, 0.75), (0.225, 0.26, 0.33), graphite, 0.065),
            box("Thigh plate." + side, (sign * 0.17, -0.135, 0.77), (0.21, 0.085, 0.26), ceramic, 0.04),
        ],
        leg,
    )
    attach(
        [
            sphere("Knee seal." + side, (sign * 0.17, 0, 0.55), (0.11, 0.115, 0.11), graphite),
            box("Knee plate." + side, (sign * 0.17, -0.13, 0.55), (0.19, 0.085, 0.13), titanium, 0.025),
            box("Shin shell." + side, (sign * 0.17, 0, 0.35), (0.21, 0.23, 0.27), ceramic, 0.055),
        ],
        knee,
    )
    attach(
        [
            box("Boot." + side, (sign * 0.17, -0.075, 0.13), (0.245, 0.39, 0.22), graphite, 0.045),
            box("Toe cap." + side, (sign * 0.17, -0.27, 0.17), (0.235, 0.105, 0.08), titanium, 0.02),
            box("Sole." + side, (sign * 0.17, -0.075, 0.018), (0.25, 0.40, 0.025), titanium, 0.008),
        ],
        foot,
    )

# Flexible hoses communicate scale and connect the hard armor masses.
for sign, side in ((-1, "L"), (1, "R")):
    hose = tube(
        "Life support hose." + side,
        [(sign * 0.13, -0.22, 1.11), (sign * 0.30, -0.25, 1.02), (sign * 0.40, 0.12, 1.17), (sign * 0.22, 0.39, 1.31)],
        0.021,
        graphite,
    )
    bind_bone(hose, rig, "body")


def action(name, frames, poses):
    clip = bpy.data.actions.new(name)
    clip.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = clip
    for frame in frames:
        for bone_name, rotation in poses(frame).items():
            pose = rig.pose.bones[bone_name]
            pose.rotation_mode = "XYZ"
            pose.rotation_euler = rotation
            pose.keyframe_insert("rotation_euler", frame=frame)
    return clip


idle = action(
    "Idle_Breathing",
    (1, 24, 48),
    lambda f: {
        "body": (0.012 if f == 24 else 0, 0, 0),
        "head": (-0.025 if f == 24 else 0.012, 0, 0),
        "arm_L": (0.035, 0, -0.035),
        "arm_R": (0.035, 0, 0.035),
    },
)
walk = action(
    "Walk_LowGravity",
    (1, 9, 17, 25, 33),
    lambda f: {
        "body": (0.07, 0, 0),
        "leg_L": (math.sin((f - 1) / 32 * math.tau) * 0.48, 0, 0),
        "leg_R": (-math.sin((f - 1) / 32 * math.tau) * 0.48, 0, 0),
        "knee_L": (max(0, -math.sin((f - 1) / 32 * math.tau)) * 0.52, 0, 0),
        "knee_R": (max(0, math.sin((f - 1) / 32 * math.tau)) * 0.52, 0, 0),
        "arm_L": (-math.sin((f - 1) / 32 * math.tau) * 0.38, 0, -0.04),
        "arm_R": (math.sin((f - 1) / 32 * math.tau) * 0.38, 0, 0.04),
    },
)
jet = action(
    "Jetpack_Flight",
    (1, 20, 40),
    lambda f: {
        "body": (-0.14, 0, 0),
        "head": (0.12, 0, 0),
        "arm_L": (-0.28, 0, -0.08),
        "arm_R": (-0.28, 0, 0.08),
        "elbow_L": (-0.22, 0, 0),
        "elbow_R": (-0.22, 0, 0),
        "leg_L": (0.15, 0, -0.05),
        "leg_R": (0.15, 0, 0.05),
        "knee_L": (0.36, 0, 0),
        "knee_R": (0.36, 0, 0),
    },
)
rig.animation_data.action = idle
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 48

# Export only the playable character. The studio set is added afterwards.
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for obj in bpy.context.scene.objects:
    if obj.parent == rig:
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "explorer-v3.glb"),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_extra_animations=True,
    export_apply=False,
)

# Cycles look-development plate. The source .blend keeps this review setup.
floor = box("Snow stage", (0, 0, -0.055), (3.4, 3.4, 0.06), material("Snow", (0.72, 0.79, 0.82), 0), 0.03)
floor.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.78
bpy.ops.object.camera_add(location=(3.7, -6.2, 2.7))
camera = bpy.context.object
camera.name = "Portrait_Camera"
bpy.context.scene.camera = camera


def point_at(obj, target):
    obj.rotation_euler = ((mathutils.Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler())


import mathutils
point_at(camera, (0, 0, 1.05))
camera.data.lens = 67
for name, location, energy, size, color in (
    ("Warm key", (-3.8, -4.2, 5.7), 950, 4.0, (1.0, 0.58, 0.32)),
    ("Cold rim", (4.0, 1.8, 4.8), 1300, 3.2, (0.28, 0.68, 1.0)),
    ("Soft fill", (0.0, -1.0, 5.8), 600, 4.5, (0.75, 0.88, 1.0)),
):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    point_at(light, (0, 0, 1.0))
world = bpy.context.scene.world or bpy.data.worlds.new("Orbital night")
bpy.context.scene.world = world
world.color = (0.004, 0.009, 0.018)
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.012, 0.025, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.12
scene = bpy.context.scene
try:
    scene.render.engine = "CYCLES"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(RENDER)
scene.view_settings.look = "AgX - Medium High Contrast"
rig.animation_data.action = walk
scene.frame_set(9)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "explorer-v3.blend"))
bpy.ops.render.render(write_still=True)
print("Generated explorer-v3.glb, explorer-v3.blend and Cycles portrait")
