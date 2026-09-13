"""Original beveled GLB explorer, monumental beacon and ancient observatory."""
from pathlib import Path
import math
import bpy
helpers = Path(__file__).with_name('generate_assets.py').read_text().split("cylinder('containment base'")[0]
exec(helpers)
ceramic=material('Warm ceramic / micro roughness',(0.73,0.77,0.74),.28)
carbon=material('Carbon joint',(0.025,0.045,0.052),.35)
visor=material('Amber gold visor',(0.58,0.33,0.08),.88)
stone=material('Ancient basalt',(0.095,0.135,0.16),.32)
edge=material('Cut stone edges',(0.20,0.27,0.29),.4)
light=material('Beacon light',(0.25,0.78,1),.2,3.5)

sphere('Helmet ceramic shell',(0,0,1.77),(.30,.28,.31),ceramic)
sphere('Gold panoramic visor',(0,-.195,1.79),(.251,.139,.221),visor)
for side in [-1,1]:
    sphere('Helmet communication node',(side*.296,0,1.76),(.048,.105,.105),carbon)
    box('Visor rim',(side*.26,-.12,1.68),(.036,.18,.055),carbon,.015)
cylinder('Pressure collar',(0,0,1.51),.195,.1,carbon,32)
box('Pressure suit',(0,0,1.23),(.57,.38,.55),ceramic,.12)
box('Harness chest panel',(0,-.225,1.30),(.34,.09,.26),carbon,.032)
box('Display glass',(0,-.277,1.35),(.18,.014,.075),cyan,.01)
for x in [-.13,-.06,.01,.08]:box('Panel switch',(x,-.279,1.22),(.025,.02,.025),orange,.006)
box('Hip belt',(0,0,.945),(.54,.37,.11),carbon,.03)
box('Life support',(0,.265,1.24),(.46,.27,.59),carbon,.07)
box('Backpack ceramic face',(0,.42,1.29),(.4,.08,.42),ceramic,.04)
for side in [-1,1]:
    cylinder('Ion fuel canister',(side*.18,.31,1.22),.085,.45,gold,24)
    cylinder('Jet nozzle',(side*.18,.31,.92),.078,.13,carbon,24)
    cylinder('Jet aperture',(side*.18,.31,.85),.048,.015,cyan,24)
    for z in [1.17,1.3]:box('Back vent',(side*.11,.467,z),(.12,.015,.035),carbon,.005)
    # Pivot objects survive GLB export and allow movement-driven limb animation.
    pivot=bpy.data.objects.new('arm_L' if side<0 else 'arm_R',None);bpy.context.collection.objects.link(pivot);pivot.location=(side*.38,0,1.42)
    pieces=[sphere('Shoulder',(side*.36,0,1.42),(.15,.16,.16),ceramic),box('Upper arm',(side*.40,0,1.25),(.21,.25,.30),ceramic,.085),sphere('Elbow seal',(side*.41,0,1.07),(.105,.12,.105),carbon),box('Forearm',(side*.42,-.015,.94),(.205,.23,.27),ceramic,.07),sphere('Glove',(side*.42,-.025,.76),(.10,.12,.13),carbon)]
    for o in pieces:o.parent=pivot;o.location-=pivot.location
    pivot=bpy.data.objects.new('leg_L' if side<0 else 'leg_R',None);bpy.context.collection.objects.link(pivot);pivot.location=(side*.16,0,.94)
    pieces=[box('Thigh',(side*.16,0,.75),(.235,.29,.36),ceramic,.08),sphere('Knee seal',(side*.16,0,.53),(.115,.125,.11),carbon),box('Shin',(side*.16,0,.35),(.225,.255,.30),ceramic,.06),box('Boot',(side*.16,-.08,.105),(.26,.43,.20),carbon,.045),box('Toe armor',(side*.16,-.22,.14),(.255,.12,.09),ceramic,.025)]
    for o in pieces:o.parent=pivot;o.location-=pivot.location
save('explorer')

cylinder('Observatory foundation',(0,0,.18),6,.36,stone,64)
for radius in [3.8,5.5]:ring('Inlaid orbit',.38,radius,.04,gold)
for i in range(8):
    a=i*math.pi/4
    o=box('Radial step',(math.cos(a)*5,math.sin(a)*5,.28),(2.3,.75,.25),edge,.04);o.rotation_euler.z=a
for side in [-1,1]:
    o=box('Monolith lower',(side*2,0,2.45),(1.25,1.5,4.3),stone,.09);o.rotation_euler.y=side*-.09
    o=box('Monolith crown',(side*1.68,0,6.4),(.88,1.12,3.2),edge,.065);o.rotation_euler.y=side*-.22
    box('Luminous channel',(side*1.4,-.77,2.5),(.05,.04,3.9),light,.005)
    for j in range(6):box('Carved glyph',(side*2.05,-.77,1+j*.48),(.32 if j%2 else .48,.025,.035),gold,.003)
sphere('Suspended heart',(0,0,4.9),(.55,.55,.9),light)
for z in [4.2,5.6]:ring('Heart suspension',z,.83,.035,gold)
cylinder('Activation plinth',(0,-3,1),.65,1.2,stone,16)
ring('Plinth illumination',1.63,.5,.04,light)
save('beacon')

# Broken cyclopean arch. Geometry remains deliberately sparse at silhouette scale.
for i in range(18):
    if i in [4,5,14]:continue
    a=i/20*math.pi*2
    o=box('Ancient arch segment',(math.cos(a)*17,0,18+math.sin(a)*17),(5.2,3.5,3.4),stone,.13)
    o.rotation_euler.y=-a
    o=box('Inset amber',(math.cos(a)*15.7,-1.78,18+math.sin(a)*15.7),(3.0,.04,.055),gold,.01);o.rotation_euler.y=-a
for side in [-1,1]:box('Arch footing',(side*14,0,2),(6,7,4),edge,.2)
save('observatory')

sphere('Lander hull',(0,0,2.8),(3.7,2.3,1.5),ceramic)
sphere('Cockpit',(0,-1.65,3.0),(2.2,.8,.75),visor)
box('Engine block',(0,1.8,2.5),(4,2,1.5),carbon,.2)
for side in [-1,1]:
    box('Outrigger',(side*3.5,0,1.6),(3,.4,.3),carbon,.1)
    cylinder('Landing foot',(side*4.6,0,.3),.85,.4,stone,24)
    o=box('Landing leg',(side*4.15,0,.95),(.22,.35,1.6),ceramic,.06);o.rotation_euler.y=side*.4
    cylinder('Rear engine',(side*1.4,1.9,1.45),.55,.6,carbon,32)
    ring('Engine ring',1.14,.4,.05,cyan)
save('lander')
print('Planet expedition assets exported')
