from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import xml.etree.ElementTree as E,re,colorsys,json
p=Path(__file__).resolve().parent;r=E.parse(p.parent/'ai-christmas-hoodie-v1/template.svg').getroot();xmin,ymin,w,h=map(float,r.get('viewBox').split());n=2048;atlas=Image.new('RGB',(n,n),'#f1f1ed');polys={}
for node in r.iter('{http://www.w3.org/2000/svg}path'):
 if node.get('data-island') is None:continue
 vals=re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',node.get('d',''));xy=list(zip(map(float,vals[0::2]),map(float,vals[1::2])))
 polys.setdefault(int(node.get('data-island')),[]).append([((x-xmin)/w*n,(y-ymin)/h*n) for x,y in xy])
legend=[]
for i,paths in sorted(polys.items()):
 rgb=tuple(round(c*255) for c in colorsys.hsv_to_rgb((i*.61803398875)%1,.85, .95 if i%2 else .73));color='#'+''.join(f'{c:02x}' for c in rgb)
 mask=Image.new('L',(n,n));d=ImageDraw.Draw(mask)
 for pts in paths:d.polygon(pts,fill=255)
 atlas.paste(Image.new('RGB',(n,n),rgb),(0,0),mask);mask.save(p/f'mask-{i:02}.png');legend.append({'id':i,'color':color,'bbox':mask.getbbox()})
atlas.save(p/'color-atlas.png');labels=atlas.copy();d=ImageDraw.Draw(labels);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',24)
for region in legend:
 b=region['bbox'];x=(b[0]+b[2])//2;y=(b[1]+b[3])//2
 if b[2]-b[0]>45 and b[3]-b[1]>45:d.text((x,y),str(region['id']),anchor='mm',font=font,fill='white',stroke_width=2,stroke_fill='black')
labels.save(p/'color-atlas-labels.png');(p/'legend.json').write_text(json.dumps(legend,indent=2))
