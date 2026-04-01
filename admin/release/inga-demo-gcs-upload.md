# Inga Demo GCS Upload

`日本史因果クロニクル` の公式サイト向け体験版を GCS に上げる手順です。

## 前提

- `gcloud` が使えること
- `gcloud auth list` で有効なアカウントがあること
- ゲーム成果物が次にあること
  - `C:\dev\chie-game-go\build\release\official_web_demo\stage`
  - `C:\dev\chie-game-go\build\release\official_win`

## 配置ルール

- Windows ZIP: `gs://randaworks-game-builds/inga-demo/vX.Y.Z/IngaChronicle_Demo_vX.Y.Z_win.zip`
- Web 重い配信物:
  - `gs://randaworks-game-builds/inga-demo/X.Y.Z/index.wasm`
  - `gs://randaworks-game-builds/inga-demo/X.Y.Z/index.pck.part000`
  - `gs://randaworks-game-builds/inga-demo/X.Y.Z/index.pck.part001`

`index.html` と `index.js` はサイト側リポジトリで配信し、重い Web バイナリだけ GCS に置きます。

## 実行コマンド

```powershell
pwsh .\admin\release\upload-inga-demo-release.ps1 -Version 0.1.9
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

## ローカル確認メモ

`official_web_demo` は Secure Context 前提です。本番は HTTPS で問題ありませんが、ローカルで `http://dev.randa:8888/` を使うとブラウザ版が起動しないことがあります。ローカル確認は `localhost` か HTTPS 環境で行ってください。
