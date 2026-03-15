"""
Convert <img> tags in HTML files to <picture> elements with WebP sources.
Only converts images that have corresponding .webp files.
Also adds preload links for hero/LCP images.
"""
import re
import os
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = SITE_ROOT / "assets" / "img"

# Files to process
HTML_FILES = [
    "index.html",
    "games/inga/index.html",
    "videos/index.html",
]

def get_webp_path(img_src, html_file):
    """Check if a WebP version exists for the given img src."""
    html_dir = (SITE_ROOT / html_file).parent
    
    # Resolve relative path
    img_path = (html_dir / img_src).resolve()
    webp_path = img_path.with_suffix(".webp")
    
    if webp_path.exists():
        # Return the webp src with same relative prefix
        base, ext = os.path.splitext(img_src)
        return base + ".webp"
    return None


def convert_img_to_picture(html_content, html_file):
    """Replace <img> tags with <picture> elements where WebP exists."""
    
    def replace_img(match):
        full_tag = match.group(0)
        src_match = re.search(r'src="([^"]+)"', full_tag)
        if not src_match:
            return full_tag
        
        src = src_match.group(1)
        
        # Skip external images, SVGs, data URIs
        if src.startswith("http") or src.startswith("data:") or src.endswith(".svg"):
            return full_tag
        
        # Skip icon/favicon images
        if "icon.png" in src or "randaworks_icon" in src:
            return full_tag
        
        webp_src = get_webp_path(src, html_file)
        if not webp_src:
            return full_tag
        
        # Detect indentation
        line_start = html_content.rfind("\n", 0, match.start())
        indent = ""
        if line_start >= 0:
            indent = re.match(r"[ \t]*", html_content[line_start + 1:match.start()]).group(0) if line_start + 1 < match.start() else ""
        
        # Build <picture> element
        picture = f'<picture>\n{indent}  <source srcset="{webp_src}" type="image/webp">\n{indent}  {full_tag}\n{indent}</picture>'
        return picture
    
    # Match <img ... > or <img ... />
    pattern = r'<img\s[^>]*?/?>'
    result = re.sub(pattern, replace_img, html_content)
    return result


def add_preload(html_content, preload_images):
    """Add preload links for hero images after the last <link> or before </head>."""
    preload_html = ""
    for img_path, img_type in preload_images:
        preload_html += f'\n    <link rel="preload" as="image" href="{img_path}" type="{img_type}">'
    
    # Insert before </head>
    return html_content.replace("</head>", f"{preload_html}\n  </head>", 1)


def main():
    # Preload configurations per file
    preloads = {
        "index.html": [
            ("./assets/img/games/inga/demo-cards/poster_steam_store_pv_v1_1.webp", "image/webp"),
        ],
        "games/inga/index.html": [
            ("../../assets/img/games/inga/title_logo.webp", "image/webp"),
        ],
    }
    
    for html_file in HTML_FILES:
        filepath = SITE_ROOT / html_file
        if not filepath.exists():
            print(f"  SKIP  {html_file} (not found)")
            continue
        
        content = filepath.read_text(encoding="utf-8")
        original = content
        
        # Convert <img> to <picture>
        content = convert_img_to_picture(content, html_file)
        
        # Add preload links
        if html_file in preloads:
            content = add_preload(content, preloads[html_file])
        
        if content != original:
            filepath.write_text(content, encoding="utf-8")
            # Count changes
            pic_count = content.count("<picture>") - original.count("<picture>")
            preload_count = content.count('rel="preload"') - original.count('rel="preload"')
            print(f"  OK  {html_file}: +{pic_count} <picture>, +{preload_count} preload")
        else:
            print(f"  NO CHANGE  {html_file}")


if __name__ == "__main__":
    main()
