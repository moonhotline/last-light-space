"""Original metered, articulated expedition assets. Blender -> glTF, +Y forward in runtime."""
from pathlib import Path
import math, random
import bpy
exec(Path(__file__).with_name('generate_assets.py').read_text().split("cylinder('containment base'")[0])
random.seed(2087)
ceramic=material('Weathered ivory ceramic',(.57,.64,.63),.35)
carbon=material('Graphite elastomer',(.022,.033,.039),.2)
titanium=material('Brushed titanium',(.17,.22,.24),.8)
amber=material('Rescue ochre enamel',(.70,.33,.08),.35)
visor=material('Gold dielectric visor',(.36,.22,.07),.95)
visor.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.14
blue=material('Instrument phosphor',(.16,.72,.88),.4,2.3)
white=material('Warm luminaire',(1,.77,.42),.1,3)

def pivot(name,loc,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc
    if parent: bind(o,parent)
    return o

def bind(o,p):
    bpy.context.view_layer.update();m=o.matrix_world.copy();o.parent=p;o.matrix_world=m
    return o

def tube(name,pts,r,mat):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2
    sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
    for v,p in zip(sp.points,pts):v.co=(*p,1)
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def lettering(text,loc,size,mat,rotation=(math.pi/2,0,0),parent=None):
    cu=bpy.data.curves.new('Lettering '+text,'FONT');cu.body=text;cu.size=size;cu.extrude=.0005;cu.align_x='CENTER'
    o=bpy.data.objects.new('Lettering '+text,cu);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=rotation;o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
    if parent:bind(o,parent)
    return o

# Articulated EVA suit: hip, knee, shoulder, elbow and helmet pivots.
body=pivot('body',(0,0,.98))
for o in [box('Pressure torso',(0,0,1.24),(.53,.37,.53),ceramic,.105),box('Hip harness',(0,0,.97),(.5,.36,.11),carbon,.025),cylinder('Collar',(0,0,1.52),.19,.095,titanium,32)]:bind(o,body)
head=pivot('head',(0,0,1.55),body)
for o in [sphere('Helmet shell',(0,0,1.77),(.295,.275,.315),ceramic),sphere('Visor rim',(0,-.175,1.78),(.268,.15,.25),carbon),sphere('Gold wrap visor',(0,-.197,1.785),(.248,.145,.224),visor)]:bind(o,head)
for side in [-1,1]:
    bind(sphere('Comms module',(side*.29,0,1.77),(.05,.11,.115),titanium),head)
    bind(box('Temple lamp',(side*.23,-.16,1.98),(.08,.065,.036),white,.01),head)
    bind(box('Shoulder harness',(side*.19,-.2,1.30),(.055,.028,.35),amber,.008),body)
bind(box('Chest instrumentation',(0,-.216,1.29),(.29,.074,.24),carbon,.028),body)
for j in range(3):bind(box('Status bar',(-.065+j*.064,-.259,1.32),(.04,.015,.04),blue,.005),body)
lettering('07',(0,-.267,1.23),.055,ceramic,parent=body)
for side in [-1,1]:
    bind(tube('Life support hose',[(side*.14,-.20,1.05),(side*.31,-.19,1.02),(side*.32,.18,1.2),(side*.18,.35,1.25)],.022,carbon),body)
    bind(cylinder('Fuel canister',(side*.19,.30,1.25),.09,.46,titanium,24),body)
    bind(cylinder('Nozzle',(side*.19,.30,.94),.074,.14,carbon,24),body)
    bind(cylinder('Nozzle aperture',(side*.19,.30,.86),.046,.022,blue,24),body)
bind(box('Life support housing',(0,.29,1.25),(.47,.23,.53),ceramic,.045),body)
for j in range(5):bind(box('Heat sink',(0,.42,1.13+j*.047),(.31,.012,.018),carbon,.003),body)
lettering('PEREGRINE',(0,.432,1.42),.038,titanium,(math.pi/2,0,math.pi),body)
for side,name in [(-1,'L'),(1,'R')]:
    arm=pivot('arm_'+name,(side*.34,0,1.43),body)
    for o in [sphere('Shoulder bearing',(side*.34,0,1.43),(.13,.14,.14),carbon),box('Bicep armor',(side*.38,0,1.26),(.2,.24,.29),ceramic,.07),box('Shoulder insignia',(side*.48,-.02,1.4),(.035,.2,.13),amber,.012)]:bind(o,arm)
    elbow=pivot('elbow_'+name,(side*.39,0,1.08),arm)
    for o in [sphere('Elbow',(side*.39,0,1.08),(.098,.112,.10),carbon),box('Forearm shell',(side*.40,-.015,.96),(.19,.22,.24),ceramic,.065),sphere('Glove',(side*.4,-.035,.79),(.10,.12,.115),carbon)]:bind(o,elbow)
    if side==-1:bind(box('Wrist grapple emitter',(side*.4,-.14,.94),(.16,.08,.18),titanium,.024),elbow)
    hip=pivot('leg_'+name,(side*.15,0,.95))
    for o in [box('Thigh pressure liner',(side*.15,0,.75),(.23,.27,.34),carbon,.065),box('Thigh armor',(side*.15,-.13,.76),(.22,.09,.27),ceramic,.035)]:bind(o,hip)
    knee=pivot('knee_'+name,(side*.15,0,.55),hip)
    for o in [sphere('Knee seal',(side*.15,0,.54),(.108,.11,.11),carbon),box('Knee plate',(side*.15,-.12,.54),(.19,.09,.13),titanium,.025),box('Shin plate',(side*.15,0,.35),(.215,.24,.28),ceramic,.06),box('Boot',(side*.15,-.075,.12),(.25,.40,.22),carbon,.04),box('Toe cap',(side*.15,-.22,.16),(.24,.105,.08),titanium,.02)]:bind(o,knee)
    for j in range(3):bind(box('Boot tread',(side*.15,-.19+j*.13,.026),(.27,.06,.035),titanium,.005),knee)
save('explorer-v2')

# PEREGRINE utility skiff: longitudinal loft, glazing, twin nacelles, folding gear.
def loft(name,sections,mat):
    verts=[]
    for y,w,h,z in sections:
        for a in [0,math.pi/4,3*math.pi/4,math.pi,5*math.pi/4,7*math.pi/4]: verts.append((math.cos(a)*w,y,z+math.sin(a)*h))
    faces=[]
    for i in range(len(sections)-1):
        for j in range(6):faces.append((i*6+j,i*6+(j+1)%6,(i+1)*6+(j+1)%6,(i+1)*6+j))
    faces.extend([tuple(range(5,-1,-1)),tuple((len(sections)-1)*6+j for j in range(6))])
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,mat)
    be=o.modifiers.new('Radiused aerospace seams','BEVEL');be.width=.09;be.segments=3;o.modifiers.new('Normals','WEIGHTED_NORMAL');return o
loft('Primary pressure hull',[(-6.5,.28,.24,2.6),(-4.7,1.8,.65,2.7),(-1.6,2.7,1.45,2.8),(2.8,2.5,1.15,2.6),(4.1,1.7,.75,2.45)],ceramic)
loft('Panoramic canopy',[(-5,.6,.08,3.05),(-3.4,1.65,.52,3.63),(-1.5,1.75,.48,3.88),(-.7,1.65,.17,3.84)],visor)
for x in [-1,1]:
    tube('Canopy spar',[(x*.6,-5,3.05),(x*1.65,-3.4,3.99),(x*1.75,-1.5,4.22),(x*1.65,-.7,3.84)],.055,titanium)
    loft('Swept outrigger '+str(x),[(-1.4,1,.12,2.0),(2.6,1,.20,2.0),(3.7,.6,.15,2.0)],titanium).location.x=x*3.3
    loft('Engine nacelle '+str(x),[(-2.8,.6,.55,2.1),(-1.8,.87,.78,2.15),(3.4,.82,.72,2.05),(4.4,.56,.52,2.05)],titanium).location.x=x*4.1
    for y in [-1.4,0,1.4]:box('Nacelle ceramic plates',(x*4.1,y,2.89),(1.08,1.16,.13),ceramic,.05)
    for j in range(8):box('Engine vents',(x*4.12,2+j*.21,2.75),(1.05,.08,.055),carbon,.01)
    nozzle=cylinder('Engine exhaust',(x*4.1,4.45,2.05),.49,.25,carbon,32);nozzle.rotation_euler.x=math.pi/2
    aperture=cylinder('engine_glow_'+str(x),(x*4.1,4.59,2.05),.36,.03,blue,32);aperture.rotation_euler.x=math.pi/2
    box('Navigation lamp',(x*4.75,-1.6,2.12),(.055,.35,.07),blue if x<0 else red,.012)
    leg=pivot('gear_'+str(x),(x*2.4,1.3,1.9))
    for y in [-2.8,2.4]:
        bind(tube('Landing strut',[(x*2.4,y,1.8),(x*3.35,y,.48)],.105,titanium),leg)
        bind(box('Landing skid',(x*3.35,y,.22),(.8,1.4,.28),carbon,.07),leg)
    for j in range(4):box('Hull fastener',(x*2.58,-.5+j*.82,2.72),(.04,.14,.1),carbon,.01)
    box('Rescue stripe',(x*2.53,.7,3.24),(.17,3,.06),amber,.018)
    fin=box('Tail stabilizer',(x*1.6,3.1,3.62),(.16,1.8,1.65),titanium,.09);fin.rotation_euler.y=x*.34
for j in range(6):box('Dorsal heat exchanger',(0,.2+j*.48,3.81),(.95,.19,.11),carbon,.025)
box('Repair hatch',(0,2.8,3.62),(1.25,1.22,.1),amber,.07)
lettering('PEREGRINE',(0,-5.75,2.8),.21,titanium)
lettering('07',(0,-5.77,2.45),.19,amber)
box('Landing floodlight',(0,-5.66,2.28),(.45,.07,.1),white,.025)
save('skiff')

# Walkable abandoned research lab. Geometry exactly matches LAB_BOXES dimensions.
wall=material('Oxidised lab cladding',(.18,.24,.24),.5)
concrete=material('Porous basalt concrete',(.20,.24,.23),.1)
rust=material('Oxidation',(.25,.105,.036),.2)
glass=material('Smoke glass',(.055,.135,.14),.5)
# Coordinates below are Three.js world-local x/y/z, converted to Blender.
def wb(name,x,y,z,sx,sy,sz,mat,bevel=.05):return box(name,(x,-z,y),(sx,sz,sy),mat,bevel)
blocks=[(0,.15,0,20,.3,26),(-10,3.6,0,.5,7.2,26),(10,3.6,0,.5,7.2,26),(0,3.6,-13,20,7.2,.5),(-6.8,3.6,13,6.4,7.2,.5),(6.8,3.6,13,6.4,7.2,.5),(0,6.4,13,7.2,1.6,.5),(-5,7.3,0,10,.3,26),(7,7.3,-5,6,.3,16)]
for n,b in enumerate(blocks):wb('Structure '+str(n),*b,concrete if n==0 else wall)
for x in [-9.6,9.6]:
    for z in [-11,-5,1,7,12]:
        wb('Structural rib',x,3.7,z,.3,7,.3,titanium)
        wb('Low running lamp',x,1,z,.04,.055,3,blue,.01)
for x in [-7,-3,1,5,9]:wb('Floor seam',x,.312,0,.018,.008,25,titanium,.0)
for z in [-10,-4,2,8]:wb('Floor seam',0,.312,z,19,.008,.018,titanium,.0)
# Broken greenhouse: glazed specimen columns with dormant roots.
for j in range(4):
    x=-7.4;z=-8+j*4.5
    wb('Specimen plinth',x,.75,z,2.4,.9,2.4,carbon)
    wb('Opaque containment glass',x,2.2,z,2,2.1,2,glass)
    wb('Specimen top',x,3.5,z,2.3,.2,2.3,titanium)
    for side in [-1,1]:wb('Column strut',x+side*1.12,2.2,z,.08,2.5,.12,titanium,.02)
    tube('Escaped root',[(x,-z,1.3),(x+1.8,-z+.4,.5),(x+2.8,-z+2,.33),(x+3.7,-z+2.5,.32)],.09,rust)
wb('Archive desk',0,1.15,-4,4.3,1.5,1.7,carbon,.15)
wb('Terminal screen',0,2.05,-4.3,2.1,.85,.13,blue,.025)
for j in range(6):wb('Broken console key',-.7+j*.26,1.94,-3.5,.12,.04,.11,ceramic,.005)
for j in range(16):
    x=random.uniform(3,8);z=random.uniform(-10,10)
    o=wb('Ceiling debris',x,.45,z,random.uniform(.2,1.5),.15,random.uniform(.2,.8),concrete);o.rotation_euler.z=random.random()*3
for x in [-3.8,3.8]:wb('Doorframe',x,2.7,13.1,.25,5.4,.75,titanium)
wb('Entrance strip',0,5.36,13.4,7,.10,.06,white,.01)
lettering('DAWN / RESEARCH 07',(0,-13.32,6.25),.5,ceramic,(math.pi/2,0,0))
lettering('DO NOT RESTART',(0,12.69,4.6),.5,amber)
save('dawn-lab')
print('Echo assets exported: explorer-v2, skiff, dawn-lab')
