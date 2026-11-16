#!/usr/bin/env python3
"""Make the small product icons the site shows, from each product's own app icon.

Usage:  python3 tools/make-icons.py <Money Tycoon icon.png> <Domino Reactor icon.png>

Each icon is the product's own 1024-pixel app icon, from that product's
repository. Needs Pillow (pip install pillow). Writes img/<name>-icon.webp, 192 pixels
square: three times the size the page shows them at, so they stay sharp on
high-density screens.
"""

import sys
from pathlib import Path

from PIL import Image

SITE = Path(__file__).resolve().parent.parent
SIZE = 192

NAMES = ("money-tycoon", "domino-reactor")  # in the order their icons are given


def main() -> None:
    if len(sys.argv) != 1 + len(NAMES):
        raise SystemExit(__doc__)
    for name, source in zip(NAMES, map(Path, sys.argv[1:])):
        if not source.is_file():
            raise SystemExit(f"{name}: the icon was not found at {source}")
        icon = Image.open(source).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
        out = SITE / "img" / f"{name}-icon.webp"
        icon.save(out, "WEBP", quality=92, method=6)
        print(f"{out.relative_to(SITE)}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
