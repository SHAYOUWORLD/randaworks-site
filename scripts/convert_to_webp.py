"""
Convert all PNG/JPG images under assets/img/ to WebP format.
Original files are kept for fallback. WebP files are created alongside originals.
"""
import os
from pathlib import Path
from PIL import Image

IMG_ROOT = Path(__file__).resolve().parent.parent / "assets" / "img"
QUALITY = 80
SKIP_PATTERNS = ["icon.png", "randaworks_icon.png"]  # Small icons - not worth converting


def convert_image(src: Path):
    dst = src.with_suffix(".webp")
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return None  # Already up-to-date

    img = Image.open(src)

    # Handle transparency for PNGs
    if img.mode in ("RGBA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        img.save(dst, "WEBP", quality=QUALITY, method=6)
    else:
        img = img.convert("RGB")
        img.save(dst, "WEBP", quality=QUALITY, method=6)

    src_kb = src.stat().st_size / 1024
    dst_kb = dst.stat().st_size / 1024
    saving = (1 - dst_kb / src_kb) * 100
    return src_kb, dst_kb, saving


def main():
    total_src = 0
    total_dst = 0
    converted = 0

    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for src in sorted(IMG_ROOT.rglob(ext)):
            if src.name in SKIP_PATTERNS:
                print(f"  SKIP  {src.relative_to(IMG_ROOT)}")
                continue

            result = convert_image(src)
            if result is None:
                print(f"  UP-TO-DATE  {src.relative_to(IMG_ROOT)}")
                continue

            src_kb, dst_kb, saving = result
            total_src += src_kb
            total_dst += dst_kb
            converted += 1
            print(f"  OK  {src_kb:7.0f}KB -> {dst_kb:7.0f}KB ({saving:5.1f}%)  {src.relative_to(IMG_ROOT)}")

    if converted:
        print(f"\n  Total: {total_src/1024:.1f}MB -> {total_dst/1024:.1f}MB ({(1-total_dst/total_src)*100:.0f}% reduction)")
        print(f"  Converted {converted} images")
    else:
        print("\n  All images already up-to-date.")


if __name__ == "__main__":
    main()
