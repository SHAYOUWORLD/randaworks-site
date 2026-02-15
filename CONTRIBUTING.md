# Contributing

このリポジトリは `main` 直pushを禁止し、必ずブランチ + Pull Request で反映します。

## 標準フロー

```bash
git switch main
git pull --ff-only
git switch -c fix/<topic>
# 変更
git add -A
git commit -m "fix: <summary>"
git push -u origin fix/<topic>
```

その後、GitHubでPRを作成し、レビュー承認後に `main` へマージしてください（Squash推奨）。

## ローカル確認（静的サイト）

```bash
python -m http.server 4173
```

`http://localhost:4173/` を開き、DevToolsで幅 `<=480px` を確認してください。

## 今回の表示確認基準（ホーム）

- `index.html` のスマホ幅 (`<=480px`) で、ヘッダーの文字ロゴが非表示
- ヒーローのロゴが表示
- `RandaWorks` ロゴが二重表示にならない

キャッシュ切り分けが必要な場合:

![1771149476803](image/CONTRIBUTING/1771149476803.png)- `https://www.randaworks.com/?v=<timestamp>`
- `https://www.randaworks.com/assets/css/style.css?v=<timestamp>`

## 自動チェック

PR時に `scripts/verify-mobile-logo.ps1` を実行し、以下を検証します。

- `index.html` に `<body class="home-page">` がある
- `assets/css/style.css` の `@media (max-width: 480px)` 内に `.home-page .nav .brand { display: none; }` がある
- `home-page` クラスが `index.html` 以外に入っていない
