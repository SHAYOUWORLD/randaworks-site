# RandaWorks Site — AI Agent Instructions

## Cloudflare Workers デプロイ設定（重要・変更禁止）

本番ドメイン（www.randaworks.com）は本番用Cloudflareアカウントに紐づいている。

- `wrangler.toml` の `account_id` → **変更禁止**（値は wrangler.toml を参照）
- `.env` の `CLOUDFLARE_API_TOKEN` → 本番アカウントのトークン **変更禁止**

過去に別アカウントにデプロイしていた時期があり、本番に反映されない障害が発生した。絶対にaccount_idやトークンを差し替えないこと。

### デプロイコマンド

```bash
npm run build                          # Astro build + clean-dist → dist/
npx wrangler deploy                    # 本番デプロイ
npx wrangler deploy --env preview      # プレビューデプロイ
```

## ブランチ保護

- mainへの直接pushは禁止（GitHub branch protection）
- 必ずブランチ → PR → マージの流れ
- **mainへのマージはユーザーが明示的に指示するまで絶対に行わない**

## ビルド

- Astro SSG: `npm run build` → `dist/` に静的ファイル出力
- Cloudflare Workers: `worker.js` がルーティング・API処理・多言語リダイレクトを担当
- `dist/` 内の大きなバイナリ（.pck, .wasm, .zip）は `clean-dist` スクリプトで除去される
