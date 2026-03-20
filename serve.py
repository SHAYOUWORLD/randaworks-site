"""
ローカル開発サーバー
使い方: python serve.py

非推奨:
- このスクリプトは 8080 固定です
- RandaWorks公式サイトのローカル確認には使わないでください
- 代わりに `python -m http.server 8888 -d c:/dev/randaworks-site` を使ってください
- 確認URLは `http://dev.randa:8888/` です
"""
import http.server
import socketserver
import os

PORT = 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # 静的ファイルのログは省略し、ページアクセスのみ表示
        if not any(args[0].startswith(f"GET /{d}") for d in ["assets/", "favicon"]):
            super().log_message(format, *args)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print("警告: serve.py は非推奨です。RandaWorks公式サイトの確認には dev.randa:8888 を使ってください。")
    print(f"サーバー起動中: http://localhost:{PORT}/")
    print(f"About ページ: http://localhost:{PORT}/about/")
    print("停止するには Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")
