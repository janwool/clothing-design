from PIL import Image,ImageDraw,ImageFont
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
art=Image.open(p/'christmas-artwork.png').convert('RGBA')
# Exact text is composed locally; generated lettering is not trusted for Chinese spelling.
art=art.crop((0,0,art.width,round(art.height*.77)))
front=Image.new('RGB',(220,300),'#183D32');art.thumbnail((214,235),Image.Resampling.LANCZOS);front.paste(art,((220-art.width)//2,0),art)
d=ImageDraw.Draw(front);d.rectangle((0,240,219,299),fill='#F5EAD2');font=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',32);d.text((110,270),'圣诞快乐',anchor='mm',font=font,fill='#183D32')
front=front.rotate(180);atlas.paste(front,(678-110,1770-150))
# Upright back graphic with exact English and Chinese wording.
d=ImageDraw.Draw(atlas);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia Bold.ttf',46)
d.text((1110,1660),'Merry',anchor='mm',font=font,fill='#F5EAD2');d.text((1110,1718),'Christmas',anchor='mm',font=font,fill='#F5EAD2');zh=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',32);d.text((1110,1780),'圣诞快乐',anchor='mm',font=zh,fill='#CCAC62')
for y in [1600,1840]:
 for x in range(990,1231,40):d.ellipse((x-3,y-3,x+3,y+3),fill='#F5EAD2')
atlas.save(p/'christmas-atlas.png')
print('Atlas ready',Image.open(p/'christmas-artwork.png').mode)
