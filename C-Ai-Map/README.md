# CANAE AI Intelligence Map（社内検証用モックアップ）

CANAE社内向けに、AIツール・ニュース・企業関係をジャンル別に整理し、相関図で直感的に閲覧できるかを検証するための静的プロトタイプです。外部API・DB・ログイン機能・自動収集は実装していません。データはすべて `data/*.json` で管理し、静的に表示します。

## セットアップ

```bash
npm install
npm run dev
```

`http://localhost:3000` で確認できます。

## 公開方法

- **Vercel**：このフォルダをそのままインポートすればビルド・公開できます（URLは非公開運用を想定し、パスワード保護 or チーム限定公開を推奨）。
- **GitHub Pages**：`next.config.mjs` の `output: 'export'` を有効化し、`npm run build` 後に生成される `out/` を公開してください。相関図（React Flow）はクライアント側描画のため静的書き出しでも動作します。

## ディレクトリ構成

```
app/
  page.tsx              ダッシュボード
  genre/[slug]/page.tsx ジャンル別ページ（相関図・ランキング・ツール一覧・ニュース）
  news/page.tsx          ニュース一覧（絞り込み付き）
components/              UIコンポーネント一式
data/
  genres.json            ジャンル定義（7ジャンル）
  tools.json              ツール一覧（サンプル46件）
  news.json               ニュース一覧（サンプル24件）
  companies.json          相関図用データ（企業→モデル→製品の3階層）
lib/
  types.ts                型定義
  data.ts                  データ読み込み・集計ユーティリティ
```

## データの更新方法

### ニュースを追加する

`data/news.json` に以下の形式でオブジェクトを追加してください（`id` は一意にする）。

```json
{
  "id": "n-025",
  "title": "新モデル公開",
  "company": "OpenAI",
  "category": "coding",
  "importance": "high",
  "publishedAt": "2026-07-21",
  "summary": "主要な変更点を3行以内で記載",
  "impact": "CANAEの開発業務への影響",
  "sourceType": "official",
  "sourceUrl": "https://example.com",
  "status": "verified"
}
```

`category` は `model / coding / image / video / audio / agent` のいずれかです。

### ツールを追加・更新する

`data/tools.json` に1件追加してください。`scores` は0〜100の自己評価値、`benchmarkRank` は公開ベンチマーク順位（不明な場合は `null`）、`internalGrade` はCANAE実務評価（S/A/B/C）です。ランキングは「公開ベンチマーク」と「自社評価」を明確に分けて表示する設計になっているため、この2つを混同しないようにしてください。

### 相関図に反映する

`data/companies.json` は `tools.json` から自動生成した「企業 → 系列 → 製品」の3階層構造です。新しいツールを `tools.json` に追加したら、同じ企業・カテゴリの `children[0].children` 配列に `{ "id": "prod-<tool id>", "name": "<ツール名>", "toolId": "<tool id>" }` を追記してください（新しい企業・カテゴリの場合は企業ノードごと追加）。

## 検証のポイント（本仕様書より）

- ジャンル別に直感的に探せるか
- 相関図が理解しやすいか
- ランキングとニュースが混同されないか
- 毎日の更新作業を無理なく継続できるか

2〜4週間、自社運用しながら上記を確認し、次の開発段階（自動収集・会員機能・収益化など）に進むかを判断してください。

## 注意事項

`data/tools.json` および `data/news.json` の内容は仕様検証用のサンプルデータです。価格・スコア・最新情報は実際の値に置き換えてご利用ください。
