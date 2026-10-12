"""Build a UV texture deterministically from generated artwork; no UV geometry edits."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent
atlas = Image.new('RGBA', (1024,1024), '#87977C')
art = Image.open(root/'generated-print-v2.png').convert('RGBA')
assert art.getextrema()[3][0] == 0, 'Artwork must have real transparency'
art = art.crop(art.getbbox())
art.thumbnail((90,135), Image.Resampling.LANCZOS)
atlas.alpha_composite(art, (765-art.width//2,560-art.height//2))
atlas.convert('RGB').save(root/'composed-atlas-v2.png')
print('Composed 1024×1024 atlas; front artwork centered at (765, 560).')
