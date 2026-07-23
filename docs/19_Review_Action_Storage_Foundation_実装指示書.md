# Review Action Storage Foundation 実装指示書

## Design Principles

1. ブランド・URL・GitHub・インフラは独立した4レイヤーとして管理する。
2. AI IntelligenceはWeb Assistの研究・検証部門として位置付けるが、システムは完全に独立させる。
3. 公開ベンチマークとCANAE独自評価を混同しない。
4. AIニュースサイトではなく、AI業界を構造化・可視化する知識基盤を目指す。
5. ニュースよりもCANAEの実務検証を価値の中心に据える。

## 目的

Review Action API Foundationが正式完了したため、次段階として、APIが受け付けたレビュー操作をCloudflare D1へ安全に永続保存できるようにする。

本Foundationでは、`apply: true`が送られたときにレビュー操作の最新状態と監査ログをD1へ保存できることだけを目的とする。Review UIボタン、promotion連携、正本データ（`data/*.json`）更新は含めない。

## 現在の前提

| 項目 | 内容 |
| --- | --- |
| 正本URL | `https://canae-ai-intelligence.canae-tokyo.workers.dev` |
| Cloudflare所有アカウント | `canae.tokyo@gmail.com` |
| Access Team | `ancient-dream-d0c9` |
| Access AUD | `9d53a0e4773553030826e4ff6c4e33bedd53e0b592ca0071b0c624f1cd7a3dbf` |
| Certs URL | `https://ancient-dream-d0c9.cloudflareaccess.com/cdn-cgi/access/certs` |
| Review Action API | Production反映済み。`apply: true`は保存先未設定のため`501 storage-not-configured`固定 |

## 実装スコープ

### 対象

- Cloudflare D1 bindingの追加
- D1 migrationの追加（最新状態テーブル、監査ログテーブル）
- `POST /internal/api/review-candidates`の`apply: true`時のD1保存対応
- `apply: false`／未指定時のdry-run維持
- D1未設定時の`501`維持
- Cloudflare Access認可必須の維持
- `expectedStoreHash`競合検知の維持
- 状態遷移検証の維持
- `actor_email`をAccess認証情報から記録（request bodyの値は信用しない）

### 非対象

- Review UIボタン、UIからの操作導線
- `news.json` / `tools.json` / `benchmarks.json` / `canae-evaluations.json`の更新
- `data/update-candidates.json`の直接更新
- Verified Promotionの自動実行
- GitHub自動commit
- 外部通知
- 管理画面デザイン変更

## データ方針

```text
data/update-candidates.json
  = 候補の元データ・静的ベースライン（変更しない）

Cloudflare D1
  = レビュー操作・状態上書き・監査履歴の保存先
```

Review UIへのD1最新状態の統合表示は本Foundationの対象外とする。

## D1 binding

`wrangler.jsonc`に以下を追加した。

```jsonc
"d1_databases": [
  {
    "binding": "REVIEW_ACTION_DB",
    "database_name": "canae-ai-intelligence-review-actions",
    "database_id": "REPLACE_WITH_PRODUCTION_D1_DATABASE_ID",
    "migrations_dir": "migrations"
  }
]
```

`database_id`はCloudflare側でproduction用D1データベースを作成した後に正本値へ置き換える。ローカルテスト用と本番用のデータベースを混同しない。

## D1 migration

`migrations/0001_review_action_storage.sql`に以下を定義した。

- `review_candidate_actions`：候補ごとの最新レビュー状態（`candidate_id`を主キーにUPSERT）
- `review_candidate_action_logs`：レビュー操作ごとの監査ログ（`apply: true`のたびに必ずINSERT）
- `idx_review_candidate_action_logs_candidate_id` / `idx_review_candidate_action_logs_created_at`インデックス

## API仕様

対象API：`POST /internal/api/review-candidates`（変更なし）。

### dry-run（`apply`未指定または`false`）

- Cloudflare Access認可確認
- 入力検証、candidate存在確認、`expectedStoreHash`検証、状態遷移検証
- D1書き込みなし
- `200`で`mode: "dry-run"`を返す

### apply（`apply: true`）

- 上記の検証をすべて実施した後、
- D1 binding (`REVIEW_ACTION_DB`) が未設定の場合は`501 storage-not-configured`
- D1 bindingが設定されている場合は、`review_candidate_actions`へupsert、`review_candidate_action_logs`へinsertを1つの`batch`で実行し、`200`で`mode: "applied"`を返す
- D1書き込みが失敗した場合は`500 storage-write-failed`

## エラー仕様

| ケース | ステータス | error |
| --- | --- | --- |
| D1 binding未設定 | 501 | `storage-not-configured` |
| D1書き込み失敗 | 500 | `storage-write-failed` |
| `expectedStoreHash`不一致 | 409 | `store-hash-mismatch` |
| 不正入力 | 400 | 検証エラーコード（例: `decision-invalid`） |
| candidate未存在 | 404 | `candidate-not-found` |
| 終端状態の再操作 | 409 | `candidate-already-reviewed` |
| 未認可 | 404 | （候補情報・API詳細を含めない） |

## 状態遷移

Review Action API Foundationと同一の遷移表を維持する。

| 現在状態 | 操作 | 結果 | 条件 |
| --- | --- | --- | --- |
| `pending` | `approved` | `reviewStatus: accepted` | 通常許可 |
| `pending` | `rejected` | `reviewStatus: rejected` | 通常許可 |
| `pending` | `on-hold` | `reviewStatus: reviewing` | 通常許可 |
| `reviewing` | `approved` | `reviewStatus: accepted` | `resolveHold: true`必須 |
| `reviewing` | `rejected` | `reviewStatus: rejected` | `resolveHold: true`必須 |
| `reviewing` | `on-hold` | 拒否 | 保留の再保留は禁止 |
| `accepted` / `rejected` | 任意 | 拒否 | 終端状態 |

## セキュリティ要件

- Cloudflare Access認可必須（Worker境界の既存ガードを再利用）
- `actor_email`はAccess認証済み情報（`authorization.email`）から取得し、request bodyの`reviewedBy`とは独立して記録する
- JWT / Cookie / Access Tokenをログ・監査ログに出力しない
- candidate本文やdiffSummary全文を監査ログに出力しない（`reason`は機械可読な状態遷移コードのみを記録する）
- 未認可時は候補情報を返さない（既存のFail-closed 404を維持）
- D1未設定時は`501`固定。storage未設定を成功扱いにしない

## 監査ログ

`apply: true`で保存する場合、`review_candidate_action_logs`へ必ず1件insertする。

含める項目：`action_id` (`id`) / `candidate_id` / `candidate_type` / `action` / `review_decision` / `review_status` / `previous_review_decision` / `previous_review_status` / `reason` / `actor_email` / `source_store_hash` / `request_hash` / `created_at`

含めない項目：JWT / Cookie / Access Token / candidate本文全文 / diffSummary全文

`request_hash`はリクエストボディ全体のSHA-256ハッシュとし、内容を保存せずに改ざん検知・追跡に利用する。

## テスト要件

`scripts/validate-review-action-storage.mjs`（`npm run test:review-action-storage`）で以下を検証する。

- D1未設定なら`501`
- D1設定ありなら保存成功、`actor_email`はAccess由来（request bodyの値ではない）
- 最新状態upsert、audit log insertが1つのbatchで実行される
- D1書き込み失敗時は`500 storage-write-failed`
- dry-run（`apply`未指定 / `false`）はD1バインドがあっても書き込まない
- `expectedStoreHash`不一致で`409`、D1未書き込み
- 存在しないcandidateIdで`404`、D1未書き込み
- 不正decisionで`400`、D1未書き込み
- 終端状態の不正再操作を拒否、D1未書き込み
- Workerレベルで未認可リクエストがD1に到達しないこと、候補情報を含めないこと
- Workerレベルでローカル認可済みリクエストがD1へ保存できること

既存の`npm run validate:review-action-api`も引き続きPASSすることを確認する。

## 検証コマンド

```bash
npm run validate:access-control
npm run validate:data
npm run validate:collection
npm run validate:review-action-api
npm run test:review-action-storage
npm run lint
npm run build
git diff --check
```

## 実装制約メモ

現行のProductionはNext.js Static Export + Cloudflare Workers Static Assetsであり、Worker実行時に`data/update-candidates.json`を直接書き換える設計は採用しない。

- 永続保存先はCloudflare D1（`REVIEW_ACTION_DB`）に限定する。
- `data/update-candidates.json`、`news.json`等の正本データは本Foundationでも更新しない。
- Production用D1データベースは、このPRのレビュー・マージ後にCloudflareで作成し、`wrangler.jsonc`の`database_id`を正本値へ置き換えたうえでmigrationを適用する。それまでは`database_id`はプレースホルダーのままとし、Production環境ではD1未バインドとして`501`を維持する。
- Review UIへのD1最新状態の統合表示、promotion連携、GitHub自動commitは別PRで扱う。

## PR方針

### PR名

```text
Add v1.1.2 review action storage foundation
```

### PR本文に含めること

```text
Summary:
- Add D1-backed Review Action Storage Foundation.
- Keep Review UI read-only.
- Keep data/*.json unchanged.
- Store review actions and audit logs in D1 only.
- Require Cloudflare Access authorization.
- Keep dry-run behavior.
- Return 501 when storage is not configured.

Safety:
- No Review Action UI.
- No public navigation changes.
- No promotion execution.
- No news/tools/benchmarks/canae-evaluations writes.
- No update-candidates.json writes.
- No GitHub commit automation.
- No fail-open behavior.

Verification:
- npm run validate:access-control
- npm run validate:data
- npm run validate:collection
- npm run validate:review-action-api
- npm run test:review-action-storage
- npm run lint
- npm run build
- git diff --check
```

## 完了条件

- D1 binding / migrationが追加されている
- dry-runが維持されている
- `apply: true`でD1未設定時は`501`を維持している
- `apply: true`でD1設定時はupsertと監査ログinsertが実行される
- `actor_email`がAccess認証情報から記録される
- `expectedStoreHash`競合検知が維持されている
- `data/*.json`が未変更である
- Review UIに操作ボタンが追加されていない
- CI、build、validatorがPASSする
- Production用D1 `database_id`はこのPRのマージ後に別途正本値へ設定する
