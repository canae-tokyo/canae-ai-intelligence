# AI Intelligence v1.0 システム仕様書

## Design Principles

1. ブランド・URL・GitHub・インフラは独立した4レイヤーとして管理する。
2. AI IntelligenceはWeb Assistの研究・検証部門として位置付けるが、システムは完全に独立させる。
3. 公開ベンチマークとCANAE独自評価を混同しない。
4. AIニュースサイトではなく、AI業界を構造化・可視化する知識基盤を目指す。
5. ニュースよりもCANAEの実務検証を価値の中心に据える。

## システム概要

Next.js 14、TypeScript、Tailwind CSS、React Flowで構築する静的ダッシュボード。外部API、DB、ログイン機能はv1.0では持たない。

## システム構成図

GitHub main branch -> Cloudflare Workers build -> Static Assets -> `ai.canae.tokyo`。Cloudflare Accessにより社内限定公開を行う。

## URL設計

- `/`: ダッシュボード
- `/genre/[id]`: 6ジャンルページ
- `/news`: ニュース一覧

## GitHub構成

Repository: `canae-tokyo/canae-ai-intelligence`。アプリ本体は`C-Ai-Map/`、仕様書は`docs/`に配置する。

## Cloudflare構成

- Service: `canae-ai-intelligence`
- Root directory: `C-Ai-Map`
- Build command: `npm install && npm run build`
- Deploy command: `npx wrangler deploy out --name canae-ai-intelligence --compatibility-date 2026-07-20`

## ディレクトリ構成

- `app/`: Next.js App Router
- `components/`: UI部品
- `data/`: JSONデータ
- `lib/`: 型とデータ取得
- `public/_headers`: セキュリティヘッダー
- `docs/`: 正本ドキュメント

## データモデル

`tools.json`、`news.json`、`companies.json`、`genres.json`をv1.0の正データとする。将来、`models.json`、`benchmarks.json`、`categories.json`へ分離する。

## ニュース仕様

ニュースは`draft`、`verified`、`archived`で管理する。トップとジャンル別表示はVerifiedのみ、ニュース一覧はArchived以外を表示する。

## AIツール仕様

ツールはカテゴリ、スコア、公開Bmk順位、CANAE評価、価格、API有無、タグで管理する。

## モデル仕様

v1.0ではツール内にモデル相当情報を含め、Phase 3以降に`models.json`へ分離する。

## ランキング仕様

総合、性能、日本語、操作性、速度、自動化で切り替える。公開ベンチマーク由来の順位とCANAE評価は別列で表示する。

## 相関図仕様

企業 -> 系列 -> 製品の3階層をReact Flowで表示し、ノードクリックで詳細パネルを開く。

## UI仕様

黒・濃グレー基調のダークテーマ。重要ニュースは赤、更新は青、新規・Verifiedは緑を使う。

## Access設計

v1.0はnoindexとCloudflare Accessを前提に、公開検索流入を避ける。

## 更新フロー

JSON更新 -> `npm run build` -> GitHub push -> Cloudflare build -> 表示確認。

## Phase管理

Phase 1は静的サイトと運用文書。Phase 2以降でAccess、独自ドメイン、データ拡張を進める。

## Rule A/B/C

Rule Aは変更禁止、Rule Bは要相談、Rule Cは改善歓迎として`03_Codex_実装指示書_v1.0.md`に定義する。

## 運用ルール

Verified基準、情報源、差し戻しは`04_運用ルール.md`に従う。

## 完了条件

`npm run build`成功、8ページ表示、相関図クリック、ランキング切替、検索・タグ・重要度・状態フィルタ、noindex、Cloudflare build成功。
