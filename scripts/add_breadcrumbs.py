"""
Add breadcrumb navigation and BreadcrumbList schema to game-related pages.
"""
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent

# Breadcrumb configs: (file, crumbs, current_name)
PAGES = [
    (
        "games/inga/index.html",
        [
            ("https://www.randaworks.com/", "ホーム", "../../"),
            ("https://www.randaworks.com/games/", "ゲーム一覧", "../"),
        ],
        "日本史因果クロニクル"
    ),
    (
        "games/inga/play/index.html",
        [
            ("https://www.randaworks.com/", "ホーム", "../../../"),
            ("https://www.randaworks.com/games/", "ゲーム一覧", "../../"),
            ("https://www.randaworks.com/games/inga/", "日本史因果クロニクル", "../"),
        ],
        "体験版プレイヤー"
    ),
    (
        "games/inga/privacy/index.html",
        [
            ("https://www.randaworks.com/", "ホーム", "../../../"),
            ("https://www.randaworks.com/games/", "ゲーム一覧", "../../"),
            ("https://www.randaworks.com/games/inga/", "日本史因果クロニクル", "../"),
        ],
        "プライバシーポリシー"
    ),
    (
        "games/inga/support/index.html",
        [
            ("https://www.randaworks.com/", "ホーム", "../../../"),
            ("https://www.randaworks.com/games/", "ゲーム一覧", "../../"),
            ("https://www.randaworks.com/games/inga/", "日本史因果クロニクル", "../"),
        ],
        "サポート"
    ),
]


def build_breadcrumb_html(crumbs, current_name, indent="            "):
    """Build breadcrumb nav HTML."""
    parts = [f'{indent}<nav aria-label="パンくずリスト">',
             f'{indent}  <ol class="breadcrumb">']
    
    for url, name, href in crumbs:
        parts.append(f'{indent}    <li><a href="{href}">{name}</a></li>')
        parts.append(f'{indent}    <li class="breadcrumb-separator" aria-hidden="true">›</li>')
    
    parts.append(f'{indent}    <li class="breadcrumb-current" aria-current="page">{current_name}</li>')
    parts.append(f'{indent}  </ol>')
    parts.append(f'{indent}</nav>')
    
    return "\n".join(parts)


def build_breadcrumb_schema(crumbs, current_name, current_url):
    """Build BreadcrumbList JSON-LD schema."""
    items = []
    for i, (url, name, _) in enumerate(crumbs, 1):
        items.append(f'''          {{
            "@type": "ListItem",
            "position": {i},
            "name": "{name}",
            "item": "{url}"
          }}''')
    
    # Add current page as last item (without item URL per Google spec)
    items.append(f'''          {{
            "@type": "ListItem",
            "position": {len(crumbs) + 1},
            "name": "{current_name}",
            "item": "{current_url}"
          }}''')
    
    items_joined = ",\n".join(items)
    
    return f'''    <script type="application/ld+json">
      {{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
{items_joined}
        ]
      }}
    </script>'''


def main():
    url_map = {
        "games/inga/index.html": "https://www.randaworks.com/games/inga/",
        "games/inga/play/index.html": "https://www.randaworks.com/games/inga/play/",
        "games/inga/privacy/index.html": "https://www.randaworks.com/games/inga/privacy/",
        "games/inga/support/index.html": "https://www.randaworks.com/games/inga/support/",
    }
    
    for html_file, crumbs, current_name in PAGES:
        filepath = SITE_ROOT / html_file
        if not filepath.exists():
            print(f"  SKIP  {html_file}")
            continue
        
        content = filepath.read_text(encoding="utf-8")
        
        # Skip if already has breadcrumb
        if 'class="breadcrumb"' in content:
            print(f"  ALREADY HAS BREADCRUMB  {html_file}")
            continue
        
        # Add breadcrumb HTML after <main id="main-content">
        main_tag = '<main id="main-content">'
        if main_tag not in content:
            # Try without id
            main_tag = '<main>'
            if main_tag not in content:
                print(f"  NO MAIN TAG  {html_file}")
                continue
        
        breadcrumb_html = build_breadcrumb_html(crumbs, current_name)
        content = content.replace(main_tag, f"{main_tag}\n{breadcrumb_html}", 1)
        
        # Add BreadcrumbList schema before </head>
        current_url = url_map[html_file]
        schema = build_breadcrumb_schema(crumbs, current_name, current_url)
        content = content.replace("</head>", f"{schema}\n  </head>", 1)
        
        filepath.write_text(content, encoding="utf-8")
        print(f"  OK  {html_file}: breadcrumb + schema added")


if __name__ == "__main__":
    main()
