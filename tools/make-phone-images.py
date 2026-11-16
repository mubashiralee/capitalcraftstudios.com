#!/usr/bin/env python3
"""Cut the three phones for the Money Tycoon section out of the store screenshots.

The store art (in the Money Tycoon repository, under
docs/marketing/cpp/2026-10-27/screenshots/tycoon/) is a caption above a
rendered phone. Each phone sits at exactly the same place, so one set of
measurements cuts all three. The bottom 17 rows of each phone fall outside the
art; they are only the frame's edge, which is the same at the top, so the top
edge is mirrored in to close the phone.

    python3 tools/make-phone-images.py <folder of store screenshots>

Needs Pillow (`pip install pillow`). Only needed when the store art changes;
the site itself has no build step. Writes img/mt-phone-<name>-<width>.webp.
"""

import pathlib
import sys

from PIL import Image, ImageDraw

SITE = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit(__doc__)
ART = pathlib.Path(sys.argv[1])

# Measured on the 1320 x 2868 store art. The phone's outer edge:
LEFT, RIGHT, TOP = 112, 1206, 584  # inclusive pixel columns / first row
BOTTOM = 2884  # last row of the phone; the art stops at row 2867
CORNER = 176  # radius of the phone's outer corner
SUPERSAMPLE = 4  # for a smooth edge on the cut-out

PHONES = {"home": "02_home.png", "exchange": "04_exchange.png", "bank": "06_bank.png"}
WIDTHS = (900, 600)


def cut(path: pathlib.Path) -> Image.Image:
    art = Image.open(path).convert("RGB")
    if art.size != (1320, 2868):
        raise SystemExit(f"{path.name} is {art.size}, expected 1320 x 2868: re-measure before cutting")

    width = RIGHT - LEFT + 1
    height = BOTTOM - TOP + 1
    phone = Image.new("RGB", (width, height))
    body = art.crop((LEFT, TOP, RIGHT + 1, art.height))
    phone.paste(body, (0, 0))

    # Close the bottom edge with the top edge, mirrored.
    missing = height - body.height
    edge = body.crop((0, 0, width, missing)).transpose(Image.FLIP_TOP_BOTTOM)
    phone.paste(edge, (0, body.height))

    # Everything outside the rounded outline becomes transparent.
    big = Image.new("L", (width * SUPERSAMPLE, height * SUPERSAMPLE), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, width * SUPERSAMPLE - 1, height * SUPERSAMPLE - 1), radius=CORNER * SUPERSAMPLE, fill=255
    )
    outline = big.resize((width, height), Image.LANCZOS)
    phone.putalpha(outline)
    return phone


def main() -> None:
    for name, source in PHONES.items():
        phone = cut(ART / source)
        for width in WIDTHS:
            height = round(phone.height * width / phone.width)
            out = SITE / "img" / f"mt-phone-{name}-{width}.webp"
            phone.resize((width, height), Image.LANCZOS).save(out, "WEBP", quality=86, method=6)
            print(f"{out.relative_to(SITE)}  {width} x {height}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
