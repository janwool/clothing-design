"""Build the Fashion Mockups hero GIF from an existing white mockup and print."""

from math import sin, tau
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "public/images/hero"
MOCKUP_DIR = ROOT / "public/images/mockups/on-model/generated"
BASE = MOCKUP_DIR / "crewneck-tee-male-front-base.png"
MASK = MOCKUP_DIR / "crewneck-tee-male-front-mask.png"
PRINT = IMAGE_DIR / "fashion-mockups-print-v1.png"
GIF = IMAGE_DIR / "fashion-mockups-artwork-motion-v2.gif"
POSTER = IMAGE_DIR / "fashion-mockups-artwork-poster-v2.webp"

SOURCE_BOX = (0, 0, 1024, 640)
PORTRAIT_SIZE = (560, 350)
OUTPUT_SIZE = (700, 350)
FRAME_COUNT = 14


def make_frame(base, garment_mask, artwork, index):
    phase = tau * index / FRAME_COUNT
    x = round(425 + 75 * sin(phase))
    y = round(438 + 9 * sin(phase - 0.5))
    frame = base.copy()
    alpha = artwork.getchannel("A")
    shirt_region = garment_mask.crop((x, y, x + artwork.width, y + artwork.height))
    alpha = ImageChops.multiply(alpha, shirt_region)
    alpha = alpha.point(lambda value: round(value * 0.91))

    fabric = base.crop((x, y, x + artwork.width, y + artwork.height)).convert("RGB")
    shaded_ink = ImageChops.multiply(artwork.convert("RGB"), fabric)
    frame.paste(shaded_ink, (x, y), alpha)
    portrait = frame.resize(PORTRAIT_SIZE, Image.Resampling.LANCZOS)
    frame = Image.new("RGB", OUTPUT_SIZE)
    side_width = (OUTPUT_SIZE[0] - PORTRAIT_SIZE[0]) // 2
    frame.paste(portrait.crop((0, 0, 1, PORTRAIT_SIZE[1])).resize((side_width, PORTRAIT_SIZE[1])), (0, 0))
    frame.paste(portrait, (side_width, 0))
    frame.paste(portrait.crop((PORTRAIT_SIZE[0] - 1, 0, PORTRAIT_SIZE[0], PORTRAIT_SIZE[1])).resize((side_width, PORTRAIT_SIZE[1])), (side_width + PORTRAIT_SIZE[0], 0))
    return frame


def main():
    base = Image.open(BASE).convert("RGB").crop(SOURCE_BOX)
    garment_mask = Image.open(MASK).convert("L").crop(SOURCE_BOX)
    artwork = Image.open(PRINT).convert("RGBA")
    artwork.thumbnail((190, 190), Image.Resampling.LANCZOS)

    frames = [make_frame(base, garment_mask, artwork, index) for index in range(FRAME_COUNT)]
    frames[0].save(POSTER, "WEBP", quality=84, method=6)

    palette = frames[0].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    indexed = [frame.quantize(palette=palette) for frame in frames]
    indexed[0].save(
        GIF,
        save_all=True,
        append_images=indexed[1:],
        duration=120,
        loop=0,
        disposal=2,
        optimize=True,
    )
    print(f"Created {GIF.relative_to(ROOT)} and {POSTER.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
