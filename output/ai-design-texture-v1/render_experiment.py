import bpy,sys,runpy
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent
qa=runpy.run_path(str(root.parent.parent/'scripts/render-glb-qa-views.py'))
qa['clear_scene']()
bpy.ops.import_scene.gltf(filepath=str(root/'garment.glb'))
# This file includes a hidden helper cube which the web viewer does not display.
for obj in list(bpy.context.scene.objects):
 if obj.type=='MESH' and obj.name=='Cube': bpy.data.objects.remove(obj,do_unlink=True)
bpy.context.view_layer.update()
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
argv=sys.argv[sys.argv.index('--')+1:]
texture=root/argv[0]; out=root/argv[1];out.mkdir(exist_ok=True)
qa['tune_fabric_materials'](objects)
qa['set_base_color_image']([o for o in objects if 'UV_RETOPO' in o.name],texture)
for o in objects:
 if 'UV_RETOPO' in o.name:
  for m in o.data.materials:
   tex=m.node_tree.nodes.get('QA direction texture')
   uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
   mapping=m.node_tree.nodes.new('ShaderNodeMapping')
   mapping.inputs['Scale'].default_value=(1,-1,1)
   mapping.inputs['Location'].default_value=(0,1,0)
   m.node_tree.links.new(uv.outputs['UV'],mapping.inputs['Vector'])
   m.node_tree.links.new(mapping.outputs['Vector'],tex.inputs['Vector'])
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
for o in objects:
 if 'Stitch' in o.name:
  for m in o.data.materials:
   bsdf=m.node_tree.nodes.get('Principled BSDF')
   if bsdf:
    for link in list(bsdf.inputs['Base Color'].links):m.node_tree.links.remove(link)
    bsdf.inputs['Base Color'].default_value=tuple(linear(int(h,16)/255) for h in ['87','97','7C'])+(1,)
center,largest=qa['setup_scene'](objects,True,1)
bpy.context.scene.render.resolution_x=800;bpy.context.scene.render.resolution_y=1000
for name,d in {'front':(0,-1,.08),'back':(0,1,.08),'left':(-1,0,.08),'right':(1,0,.08),'cover':(-.42,-1,.16)}.items():
 qa['render_view'](out,center,largest,name,Vector(d))
# Export only garment meshes, preserving their exact original UVs.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'designed-garment.glb'),export_format='GLB',use_selection=True)
