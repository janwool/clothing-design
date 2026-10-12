from PIL import Image,ImageDraw
from pathlib import Path
import xml.etree.ElementTree as E,re,math
p=Path(__file__).resolve().parent;size=2048;root=E.parse(p/'template.svg').getroot();xmin,ymin,w,h=map(float,root.get('viewBox').split());atlas=Image.new('RGB',(size,size),'#183D32');polys={}
for node in root.iter('{http://www.w3.org/2000/svg}path'):
 if node.get('data-island') is None:continue
 vals=re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',node.get('d',''));xy=list(zip(map(float,vals[0::2]),map(float,vals[1::2])))
 pts=[((x-xmin)/w*size,(y-ymin)/h*size) for x,y in xy];polys.setdefault(int(node.get('data-island')),[]).append(pts)
for island,paths in polys.items():
 if island in [0,3,4,5,7,8,9,10,11,12,13,14,15,16,18,20,21,22,23,25,26]:
  for pts in paths:ImageDraw.Draw(atlas).polygon(pts,fill='#A92732')
# Ivory snowflakes on sleeves, clipped to their exact UV masks.
for island in [1,2]:
 mask=Image.new('L',(size,size));md=ImageDraw.Draw(mask)
 for pts in polys[island]:md.polygon(pts,fill=255)
 pattern=Image.new('RGB',(size,size),'#183D32');d=ImageDraw.Draw(pattern)
 for y in range(1040,1490,46):
  for x in range(440,1240,46):
   cx=x+(23 if (y//46)%2 else 0)
   for a in [0,math.pi/3,math.pi*2/3]:d.line([(cx-math.cos(a)*9,y-math.sin(a)*9),(cx+math.cos(a)*9,y+math.sin(a)*9)],fill='#F5EAD2',width=2)
 atlas.paste(pattern,(0,0),mask)
# Keep AI lettering, ribbon and illustration together as a single uncut print.
art=Image.open(p/'christmas-artwork.png').convert('RGBA')
front=art.copy();front.thumbnail((220,300),Image.Resampling.LANCZOS)
front=front.rotate(180,expand=True)
atlas.paste(front,(678-front.width//2,1770-front.height//2),front)
back=art.copy();back.thumbnail((200,300),Image.Resampling.LANCZOS)
atlas.paste(back,(1110-back.width//2,1830-back.height//2),back)
atlas.save(p/'christmas-atlas-v2.png')
print('Full integrated artwork composed without text replacement or cropping.')
