"""Create original low-poly game props with Blender, exported in meters as GLB."""
import math
from pathlib import Path
import bpy

OUT = Path(__file__).resolve().parents[1] / 'public' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, metal=0.0, emission=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = 0.35 if metal else 0.6
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m

shell = material('ceramic pearl', (0.66, 0.73, 0.73), 0.4)
dark = material('graphite titanium', (0.065, 0.085, 0.09), 0.7)
cyan = material('ion cyan', (0.05, 0.8, 0.7), 0.3, 3)
red = material('signal vermilion', (0.9, 0.14, 0.07), 0.2, 2)
orange = material('rescue orange', (0.91, 0.37, 0.09), 0.3)
gold = material('contact brass', (0.8, 0.65, 0.23), 0.7)

def finish(obj, mat):
    obj.data.materials.append(mat)
    return obj

def box(name, location, scale, mat, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('edge highlights', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        o.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    return finish(o, mat)

def cylinder(name, location, radius, depth, mat, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    o = bpy.context.object
    o.name = name
    mod = o.modifiers.new('machined edges', 'BEVEL')
    mod.width, mod.segments = 0.025, 2
    o.modifiers.new('weighted normals', 'WEIGHTED_NORMAL')
    return finish(o, mat)

def sphere(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=location)
    o = bpy.context.object
    o.name, o.scale = name, scale
    finish(o, mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def ring(name, z, radius, minor, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, location=(0, 0, z), major_radius=radius, minor_radius=minor)
    o = bpy.context.object
    o.name = name
    return finish(o, mat)

def save(name):
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB', export_apply=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

cylinder('containment base', (0, 0, 0.15), 0.8, 0.3, dark)
cylinder('lower coupling', (0, 0, 0.38), 0.64, 0.15, shell)
cylinder('plasma chamber', (0, 0, 1.2), 0.36, 1.35, cyan)
for z in (0.52, 0.72, 1.68, 1.88):
    ring('flux coil', z, 0.5, 0.055, gold)
for a in range(4):
    theta = a * math.pi / 2
    box('containment rib', (math.cos(theta)*0.55, math.sin(theta)*0.55, 1.2), (0.13, 0.13, 1.5), shell)
cylinder('top locking cap', (0, 0, 2.03), 0.6, 0.2, dark)
ring('top status', 2.15, 0.44, 0.04, cyan)
save('core')

sphere('armored hull', (0, 0, 0), (0.62, 0.45, 0.4), shell)
sphere('optical visor', (0, -0.38, 0.05), (0.42, 0.16, 0.18), dark)
sphere('sensor iris', (0, -0.51, 0.05), (0.12, 0.06, 0.12), red)
for side in (-1, 1):
    box('wing strut', (side*0.7, 0.05, 0), (0.8, 0.15, 0.13), dark)
    cylinder('thruster housing', (side*1.02, 0.05, 0), 0.24, 0.35, dark)
    cylinder('thruster glow', (side*1.02, 0.05, -0.2), 0.18, 0.04, red)
    box('shoulder armor', (side*0.45, 0.02, 0.32), (0.25, 0.48, 0.12), orange)
box('antenna', (0, 0.08, 0.55), (0.06, 0.06, 0.4), dark)
save('drone')

box('field tool receiver', (0, 0, 0), (0.2, 0.52, 0.22), shell)
box('magnetic barrel', (0, -0.4, 0.035), (0.12, 0.35, 0.12), dark)
box('capacitor', (0, 0.06, 0.145), (0.14, 0.25, 0.06), cyan)
box('grip', (0, 0.12, -0.2), (0.12, 0.16, 0.3), dark)
for side in (-1, 1):
    box('copper contact', (side*0.085, -0.4, 0.09), (0.025, 0.27, 0.05), gold)
save('tool')

box('cargo shell', (0, 0, 0.77), (1.5, 1.5, 1.5), orange, 0.09)
for x in (-0.73, 0.73):
    for y in (-0.73, 0.73):
        box('corner protector', (x, y, 0.8), (0.17, 0.17, 1.6), dark)
for z in (0.2, 1.3):
    box('steel band', (0, 0, z), (1.6, 1.6, 0.12), shell)
box('lock', (0, -0.81, 0.75), (0.32, 0.05, 0.35), dark)
box('lock indicator', (0, -0.85, 0.75), (0.2, 0.02, 0.055), cyan)
save('crate')

sphere('helmet', (0, 0, 1.55), (0.27, 0.26, 0.28), shell)
sphere('visor', (0, -0.21, 1.57), (0.21, 0.1, 0.16), dark)
box('suit torso', (0, 0, 1.08), (0.55, 0.34, 0.6), shell, 0.1)
box('oxygen pack', (0, 0.25, 1.08), (0.38, 0.25, 0.48), orange)
for side in (-1, 1):
    box('arm', (side*0.37, 0, 1.0), (0.19, 0.23, 0.61), shell, 0.08)
    box('leg', (side*0.17, 0, 0.49), (0.22, 0.25, 0.67), dark, 0.07)
    box('boot', (side*0.17, -0.06, 0.12), (0.25, 0.4, 0.2), shell)
box('chest signal', (0, -0.2, 1.18), (0.22, 0.025, 0.08), cyan)
save('astronaut')
print('Exported original GLB assets to', OUT)
