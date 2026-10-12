import bpy,json
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath='output/ai-christmas-hoodie-v1/garment-decoded.glb')
bpy.context.view_layer.update()
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  pts=[o.matrix_world@Vector(c) for c in o.bound_box]
  print(json.dumps({'name':o.name,'dimensions':list(o.dimensions),'bounds':[[min(p[i] for p in pts),max(p[i] for p in pts)] for i in range(3)],'materials':[m.name for m in o.data.materials]}))

for o in bpy.context.scene.objects:
 if o.type=='MESH':
  print('UVS',o.name,[(u.name, [min(x.uv[i] for x in u.data) for i in range(2)], [max(x.uv[i] for x in u.data) for i in range(2)]) for u in o.data.uv_layers])
