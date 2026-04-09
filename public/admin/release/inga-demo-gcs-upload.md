# Inga Demo GCS Upload

`日本史因果クロニクル` の公式サイト向け体験版を GCS に上げる手順です。

## 前提

- `gcloud` が使えること
- `gcloud auth list` で有効なアカウントがあること
- ゲーム成果物が次にあること
  - `<game-project-root>\build\release\official_web_demo\stage`
  - `<game-project-root>\build\release\official_win`

## 配置ルール

- Windows ZIP: `gs://randaworks-game-builds/inga-demo/vX.Y.Z/IngaChronicle_Demo_vX.Y.Z_win.zip`
- Web 重い配信物:
  - `gs://randaworks-game-builds/inga-demo/X.Y.Z/index.wasm`
  - `gs://randaworks-game-builds/inga-demo/X.Y.Z/index.pck.part000`
  - `gs://randaworks-game-builds/inga-demo/X.Y.Z/index.pck.part001`

`index.html` と `index.js` はサイト側リポジトリで配信し、重い Web バイナリだけ GCS に置きます。

## サイト側の更新ルール

- Web シェルを差し替えるときは、`games/inga/play/build-vX.Y.Z-rN/` のように毎回新しいパスを切る
- 同じ `build` パスを上書きして hotfix しない
- `rN` は HTML シェルやローダー修正のたびに増やす
- 外側ページの参照先も必ず更新する
  - `games/inga/play/index.html`
  - `games/inga/index.html`
- `games/inga/play/build-vX.Y.Z-rN/index.html` では、`new Engine(...)` の前に次を設定する
  - `REMOTE_ASSET_HOSTS` に `www.randaworks.com` と `randaworks.com`
  - `REMOTE_ASSET_BASE`
  - `GODOT_CONFIG.executable`
  - `GODOT_CONFIG.mainPack`

理由:

- Cloudflare が古い `index.html` を強くキャッシュすると、正しい GCS 参照に切り替わらないことがある
- `mainPack` や `executable` を `Engine` 生成後に差し替えると、初回の `.wasm` 読み込みが相対パスへ飛ぶ

## 実行コマンド

```powershell
pwsh .\admin\release\upload-inga-demo-release.ps1 -Version 0.1.9
```

ゲーム側リポジトリが隣接配置でない場合は、明示指定します。

```powershell
pwsh .\admin\release\upload-inga-demo-release.ps1 -Version 0.1.9 -GameProjectRoot 'D:\work\chie-game-go'
```

必要に応じて片側だけアップロードできます。

```powershell
pwsh .\admin\release\upload-inga-demo-release.ps1 -Version 0.1.9 -SkipWeb
pwsh .\admin\release\upload-inga-demo-release.ps1 -Version 0.1.9 -SkipWin
```

## 公開前チェック

```powershell
gcloud storage ls gs://randaworks-game-builds/inga-demo/v0.1.9/
gcloud storage ls gs://randaworks-game-builds/inga-demo/0.1.9/
```

確認項目:

- Windows ZIP が `v0.1.9/` にある
- `0.1.9/` に `index.wasm` と `index.pck.part000/001` がある
- サイト側の Windows ダウンロードリンクが `v0.1.9` を指している
- Web ビルドが `official_web_demo/stage` と一致している
- `games/inga/play/index.html` が新しい `build-vX.Y.Z-rN/index.html` を参照している
- `games/inga/index.html` の埋め込み iframe も同じ版を参照している

## CORS チェック

GCS の CORS には最低限次の origin が必要です。

- `https://www.randaworks.com`
- `https://randaworks.com`

確認コマンド:

```powershell
curl.exe -I -H "Origin: https://www.randaworks.com" "https://storage.googleapis.com/randaworks-game-builds/inga-demo/0.1.9/index.wasm"
curl.exe -I -H "Origin: https://randaworks.com" "https://storage.googleapis.com/randaworks-game-builds/inga-demo/0.1.9/index.wasm"
curl.exe -I -H "Origin: https://randaworks.com" "https://storage.googleapis.com/randaworks-game-builds/inga-demo/0.1.9/index.pck.part000"
```

期待値:

- `Access-Control-Allow-Origin: https://www.randaworks.com`
- `Access-Control-Allow-Origin: https://randaworks.com`
- `index.wasm` と `index.pck.part000/001` が `200`

ここが欠けると、GCS 上に正しく置けていてもブラウザ版は起動しません。

## ローカル確認メモ

`official_web_demo` は Secure Context 前提です。本番は HTTPS で問題ありませんが、ローカルで `http://dev.randa:8888/` を使うとブラウザ版が起動しないことがあります。ローカル確認は `localhost` か HTTPS 環境で行ってください。
