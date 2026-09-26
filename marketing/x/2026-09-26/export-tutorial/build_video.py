from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import subprocess, imageio_ffmpeg
P=Path(__file__).resolve().parent
F=imageio_ffmpeg.get_ffmpeg_exe()
FONT='/System/Library/Fonts/Helvetica.ttc'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
def text(d,xy,s,n=30,b=False,fill='#172126'):d.text(xy,s,font=font(n,b),fill=fill)
def panel(k,title,sub,lines,transparent=False):
 im=Image.new('RGBA',(1080,1080),(0,0,0,0) if transparent else '#F7F7F4'); d=ImageDraw.Draw(im)
 d.rectangle((0,0,1080,237),fill='#F7F7F4');d.rectangle((0,847,1080,1080),fill='#F7F7F4')
 text(d,(54,34),'CLOZDESIGN',25,True);text(d,(845,38),'QUICK GUIDE',18)
 d.rectangle((54,84,120,90),fill='#4C6659')
 text(d,(54,111),title,49,True);text(d,(54,179),sub,25)
 text(d,(54,879),k,22,True,fill='#4C6659')
 for j,line in enumerate(lines):text(d,(54,918+j*43),line,28,j==0)
 text(d,(54,1037),'cloz-design.com',21)
 return im
photo=Image.open(P/'front-back.png').convert('RGB')
# Crop only empty margins; preserve both garments and their original watermarks.
photo=photo.crop((160,240,1890,1300))
photo=ImageOps.contain(photo,(1000,610),Image.Resampling.LANCZOS)
for name,k,title,sub,lines in [
 ('hook','ONE GARMENT / TWO FORMATS','Show every angle.','A quick guide to image and video exports.',['Front + back image. A rotating video.','Both from the same 3D garment.']),
 ('images','01 / IMAGES','Export both sides.','Start on the garment page and open Export.',['Images > Front + back','Slate background / PNG / 2048 px']),
 ('end','TRY THE WORKFLOW','Your next preview.','Choose a garment. Open Export.',['Explore the models at cloz-design.com','Image and video options in one place.'])]:
 im=panel(k,title,sub,lines);im.paste(photo,((1080-photo.width)//2,237+(610-photo.height)//2));im.convert('RGB').save(P/(name+'.png'))
vid=panel('02 / VIDEO','Add a rotating view.','Export > Video > 360° rotation',['10 seconds / 1080p / 1:1','Slate background > Export video'],True)
vid.save(P/'video-overlay.png')
def run(args):
 r=subprocess.run([F,'-y','-hide_banner','-loglevel','error']+args,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
for name,secs in [('hook',3),('images',7),('end',4)]:
 run(['-loop','1','-i',str(P/(name+'.png')),'-t',str(secs),'-r','30','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(P/(name+'.mp4'))])
# The original export is used as-is; crop blank border to improve mobile readability.
run(['-i',str(P/'rotation-source.mp4'),'-loop','1','-i',str(P/'video-overlay.png'),'-filter_complex','[0:v]crop=720:720:180:180,scale=610:610,pad=1080:1080:235:237:color=0x858b95,fps=30[b];[b][1:v]overlay=0:0:shortest=1[v]','-map','[v]','-t','10','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(P/'video.mp4')])
(P/'segments.txt').write_text(''.join("file '"+str(P/(n+'.mp4'))+"'\n" for n in ['hook','images','video','end']))
inputs=[]
for n in ['hook','images','video','end']: inputs += ['-i',str(P/(n+'.mp4'))]
fc=';'.join(f'[{i}:v]setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v{i}]' for i in range(4))+';[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]'
run(inputs+['-filter_complex',fc,'-map','[v]','-c:v','libx264','-crf','19','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(P/'cloz-export-guide.mp4')])
run(['-i',str(P/'cloz-export-guide.mp4'),'-vf','fps=1/6,scale=360:360,tile=4x1','-frames:v','1',str(P/'review-contact-sheet.jpg')])
print(P/'cloz-export-guide.mp4')
