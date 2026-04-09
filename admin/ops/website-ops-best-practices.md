# RandaWorks Website Ops Best Practices

RandaWorks サイトの実運用向けベストプラクティスです。  
対象は静的サイト本体、ゲーム公式ページ、動画ページ、ニュース、サポート導線、計測基盤です。

ゲーム体験版の GCS 配信手順は別紙を参照してください。  
関連資料: `admin/release/inga-demo-gcs-upload.md`

## 1. 前提

- 公開サイトは `https://www.randaworks.com/` を正本ドメインとして扱う
- `randaworks.com` も利用者流入はありうるため、挙動と CORS は `www` なしも考慮する
- サイト本体は軽量な HTML / CSS / JS を配信する
- 重いゲーム配信物は GCS に置き、サイト本体には置かない
- 計測は GA4 と `assets/js/analytics.js` の `RandaAnalytics` を併用する
- `admin/` は公開対象ではなく、`robots.txt` でもクロール除外する

## 2. 公開運用

### 基本ルール

- 作業は必ずブランチで行い、`main` へ直接 push しない
- PR には「何を変えたか」「公開影響」「確認方法」を必ず書く
- 本番確認前に merge しない
- 公開URL、GCS URL、計測イベント名はレビュー対象に含める
- ローカル専用ファイル、認証情報、個人メモは Git に入れない

### 公開前の最低確認

- 対象ページが `dev.randa` または `localhost` で崩れていない
- タイトル、説明、 canonical、OG 系が意図どおり
- CTA リンクが本番URLを向いている
- 外部リンクに `noopener noreferrer` が付いている
- `sitemap.xml` と内部リンクの追加漏れがない
- `noindex` ページを誤って公開対象にしていない

### 公開後の最低確認

- 本番URLで `200` を返す
- Console に重大エラーがない
- 主要 CTA がクリックできる
- GA4 / 独自計測が発火する
- モバイルとデスクトップの両方で致命的崩れがない

## 3. パフォーマンス

### 目標

- LCP: `2.5s` 未満
- INP: `200ms` 未満
- CLS: `0.1` 未満

### 基本ルール

- 1st view に不要な JavaScript を増やさない
- 外部スクリプトは最小限にし、広告や埋め込みは必要箇所だけで使う
- フォントは種類とウェイトを増やしすぎない
- 画像は可能なら WebP / AVIF を使い、表示サイズに合ったものを出す
- fold 下の画像・動画は `loading="lazy"` を基本にする
- レイアウト確定前に画像サイズ不明の要素を置かない

### ゲームページ固有

- ゲーム本体はページ読み込み時に自動起動しない
- プレイ開始は明示的なクリック起点にする
- `wasm` と `pck.part*` は GCS 配信を前提にし、サイト本体に置かない
- HTML シェル修正時は新しい `build-vX.Y.Z-rN/` パスで出す
- 同じ build パスを上書きして hotfix しない

### 画像・動画

- ヒーロー画像は見た目優先でも 1 枚に絞る
- 動画は埋め込みよりも、必要に応じてサムネイル + 遷移を優先する
- 連番スクリーンショットは最適化済み画像を使う

## 4. SEO

### ページ単位の原則

- すべての公開ページに一意の `<title>` を付ける
- すべての公開ページに一意の meta description を付ける
- canonical は `https://www.randaworks.com/...` に統一する
- H1 は原則 1 つにする
- 見出しは `H1 > H2 > H3` の順で論理的に置く

### 公開対象と除外対象

- 一般公開ページは `sitemap.xml` に入れる
- 一般公開ページは内部リンクで到達可能にする
- 一時プレイヤー、確認ページ、管理導線は `noindex` を使う
- `noindex` ページは `sitemap.xml` に入れない

### 構造化データ

- 主要ページは BreadcrumbList を基本採用する
- 作品ページは必要に応じて Game / CreativeWork 系 schema を検討する
- schema は入れた後に Rich Results Test で確認する

### サイト全体

- `robots.txt` は `/admin/` を除外したまま維持する
- `sitemap.xml` は新規公開ページ追加時に更新する
- `www` あり / なしで重複評価を起こさないよう canonical を一貫させる
- ニュースや作品ページは更新時に `lastmod` を見直す

## 5. アクセシビリティ

### 必須ルール

- `lang="ja"` を正しく付ける
- スキップリンクを維持する
- キーボードだけで主要操作が完了できる
- ボタンとリンクに視覚的な focus 状態を持たせる
- 色だけで状態を伝えない
- 装飾画像は空 alt、本当に意味のある画像だけ説明 alt を入れる
- iframe、アイコンボタン、メニューにはアクセシブルな名前を付ける

### フォームと操作系

- ラベルのない入力欄を置かない
- エラー時は色だけでなくメッセージも出す
- モーダルやオーバーレイは Escape と Tab 移動を考慮する
- タップターゲットは小さすぎない

### メディア

- 動画ページでは字幕や要約の有無を意識する
- 音が出る要素は利用者の明示操作で始める
- 自動再生する場合でも無音を前提にする

## 6. キャッシュ戦略

### 基本方針

- HTML は将来修正される前提で扱う
- 大きな静的アセットは版付きパスで immutable に近い運用をする
- Cloudflare のエッジキャッシュは「すぐ差し替わる」と期待しない

### 実運用ルール

- ゲーム Web シェルは `build-vX.Y.Z-rN/` の新規パスで出す
- 緊急時の query string cache bust は補助策であり、主戦略にしない
- GCS 配信物は `inga-demo/X.Y.Z/` のようにバージョンパス固定にする
- 同じ URL に別ファイルを上書きしない
- `randaworks.com` と `www.randaworks.com` の両方で参照確認する

### チェック項目

- 本番 HTML が本当に最新 build パスを返している
- 内側 HTML が正しい GCS パスを見ている
- `index.wasm` と `index.pck.part*` が `200`
- CORS が `https://www.randaworks.com` と `https://randaworks.com` の両方で通る

## 7. 計測

### 原則

- 計測は「意思決定に使うものだけ」入れる
- vanity metric を増やしすぎない
- イベント名は小文字 + underscore を基本にする
- PII は送らない

### RandaWorks の実装ルール

- クリック計測は `data-track-event` を優先する
- あわせて次をできるだけ付ける
  - `data-track-placement`
  - `data-track-label`
  - `data-track-kind`
- 明示ロジックが必要なものは `window.RandaAnalytics.track(...)` を使う

### 主要イベントの考え方

- 集客: `page_view`, `pv_play`, `social_click`
- 主要CTA: `cta_click`, `wishlist_click`, `demo_download`
- ゲーム起動: `game_launch`, `demo_boot_start`, `demo_boot_success`, `demo_boot_error`
- 継続導線: `play_session_start`, `play_session_end`, フィードバック導線

### URL 設計

- 流入判定が必要な導線には `src` を付ける
- 外部施策は `utm_source`, `utm_medium`, `utm_campaign` を使う
- URL は増やしすぎず、命名規則を固定する

### 検証

- 公開前に `?debug=analytics` で console 出力を確認する
- GA4 DebugView または Realtime で主要イベントを確認する
- コンバージョン相当イベントは公開後にも再確認する

## 8. セキュリティと情報管理

- API キー、トークン、管理URL直書きは公開リポジトリに入れない
- ローカル専用ファイルは `.gitignore` に入れる
- 公開リポジトリに残してよいのは公開URL、一般化した手順、公開済みバケット名まで
- 個人用メモや暫定原稿は公開前提のディレクトリに置かない

## 9. 運用チェックリスト

### ページ追加時

- タイトル、説明、H1、canonical を設定
- OGP を設定
- 内部リンクを追加
- `sitemap.xml` を更新
- 計測イベントを確認
- キーボード操作とモバイル表示を確認

### ゲーム体験版更新時

- GCS に Windows ZIP と Web 重い配信物を配置
- 新しい `build-vX.Y.Z-rN/` を作成
- 外側ページの参照先を更新
- CORS を両ドメインで確認
- `randaworks.com` と `www.randaworks.com` の両方で起動確認

### 月次レビュー

- 404 リンクがないか
- `sitemap.xml` と実ページがずれていないか
- 主要ページの Core Web Vitals が悪化していないか
- GA4 の主要コンバージョンが取れているか
- フォーム、動画、ゲーム導線にアクセシビリティ上の後退がないか

## 10. このドキュメントの使い方

- 新しいページやキャンペーンを出す前に見る
- ゲーム体験版を更新する前に release 手順書とセットで見る
- 問題が起きたら、原因だけでなく「運用ルールに昇格すべき再発防止」をここへ追記する
