# Codex 実装指示書 v1.0

## Design Principles

1. ブランド・URL・GitHub・インフラは独立した4レイヤーとして管理する。
2. AI IntelligenceはWeb Assistの研究・検証部門として位置付けるが、システムは完全に独立させる。
3. 公開ベンチマークとCANAE独自評価を混同しない。
4. AIニュースサイトではなく、AI業界を構造化・可視化する知識基盤を目指す。
5. ニュースよりもCANAEの実務検証を価値の中心に据える。

## プロジェクト目的

AI Intelligenceを、CANAEおよびWeb AssistのAI調査・実務検証・提案判断に使える社内知識基盤として実装する。

## 実装優先順位

1. GitHub、Cloudflare、URL、ブランドの独立性を守る。
2. Cloudflare Workers Static Assetsで安定してデプロイできる。
3. `ai.canae.tokyo`へ接続できる構成にする。
4. Cloudflare Accessで社内限定公開できる。
5. Verified運用と評価分離をUIとデータで表現する。

## 実装対象

Next.js 14、TypeScript、Tailwind、React Flow、ダッシュボード、6ジャンルページ、ニュース一覧、検索、タグ、重要度、状態フィルタ、相関図、ランキング切替。

## 実装禁止事項

- v1.0で外部API、DB、ログイン機能を追加しない。
- Web Assist本体のGitHub、URL、Cloudflare設定へ混在させない。
- 公開ベンチマークとCANAE評価を単一スコアとして混同しない。
- 未Verifiedの情報をトップ、ランキング、営業資料へ確定値として出さない。
- 実数未確認のサンプル値を事実として表現しない。

## Rule A（変更禁止）

ブランド構造、本番予定URL、GitHub、Cloudflare独立運用、評価分離、Design Principles、外部API/DB/ログインなし方針。

## Rule B（要相談）

URL構造、ジャンル体系、評価軸、相関図階層、管理画面、DB、自動収集、一般公開文言、Access公開範囲。

## Rule C（改善歓迎）

表示速度、コンポーネント整理、型安全性、JSON読み込み、視認性、アクセシビリティ、README補足。

## デプロイ手順

```bash
npm install
npm run build
npx wrangler deploy out --name canae-ai-intelligence --compatibility-date 2026-07-20
```

## テスト項目

- `npm run build`成功
- `/`、`/news`、6ジャンルページ表示
- ランキング軸切替
- 公開BmkとCANAE評価の分離表示
- 検索、タグ、重要度、状態フィルタ
- 相関図ノードクリック
- Cloudflare Workers URLでHTML/CSS/JS応答

## 完了報告フォーマット

```text
実施内容:
- 

変更ファイル:
- 

確認結果:
- npm run build:
- Cloudflare deploy:
- 表示確認:

残課題:
- 
```
