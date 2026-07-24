# Verified Promotion Automation Foundation 実装指示書

## Design Principles

1. ブランド・URL・GitHub・インフラは独立した4レイヤーとして管理する。
2. AI IntelligenceはWeb Assistの研究・検証部門として位置付けるが、システムは完全に独立させる。
3. 公開ベンチマークとCANAE独自評価を混同しない。
4. AIニュースサイトではなく、AI業界を構造化・可視化する知識基盤を目指す。
5. ニュースよりもCANAEの実務検証を価値の中心に据える。

## 目的

Review Action UI Foundationが正式完了したため、次段階として、D1で`approved`になった候補を正本JSONへ昇格するための自動化基盤を実装する。

今回の到達点は、D1の承認済み候補一覧化・差分案生成・GitHub PR自動作成・promotion実行ログのD1保存までであり、**mainへの自動mergeは対象外**とする。

## 今回の重要設計（サマリー）

1. `update-candidates.json`の既存構造だけでは正本JSON（news/tools/benchmarks/canae-evaluations）の必須フィールドを満たせないため、`UpdateCandidate`型へ`proposedRecord`（オプショナル）を新設した。
2. `proposedRecord`が対象JSONの必須項目をすべて満たす場合にのみ、その候補はpromotion可能（`canPromote: true`）として扱う。
3. `proposedRecord`が不足する承認済み候補は、`canPromote: false`と不足フィールドの理由（`incomplete-proposed-record` / `missingFields`）を付けて一覧表示するのみとし、フィールドを推測・捏造して昇格させることはしない。
4. `POST /internal/api/promotion-pr`が`promotionPlanId`のみを受け取る設計上、plan内容をサーバー側で安全に保持する必要があるため、指示書のD1テーブル案（`promotion_runs` / `promotion_run_items`）に加えて`promotion_plans`テーブルを追加した。
5. `data/update-candidates.json`の昇格マーキング（`promotedRecordType` / `promotedRecordId` / `promotedAt`）は、正本JSONへの追記と同じpromotion branch上でのみコミットする。mainへの直接反映は行わない。
6. main自動mergeは実装しない。GitHub PR作成までが自動化範囲であり、CI通過確認とmergeは人間が行う運用を維持する。
7. `GITHUB_PROMOTION_TOKEN`が未設定の場合は、GitHub APIを一切呼び出さずに`501 github-promotion-not-configured`を返してfail-closedする。

## 現在の前提

| 項目 | 内容 |
| --- | --- |
| 正本URL | `https://canae-ai-intelligence.canae-tokyo.workers.dev` |
| Cloudflare所有アカウント | `canae.tokyo@gmail.com` |
| D1 database | `canae-ai-intelligence-review-actions`（`database_id: 48bc9be4-5219-49cc-a2ea-9428db53bc0a`） |
| Review Action API / Storage / UI | すべてProduction反映済み |

## 最重要の発見：`UpdateCandidate`だけでは正本レコードを自動生成できない

指示書は「D1のapproved候補から正本JSONへの差分案を生成する」ことを求めているが、実装前に`data/update-candidates.json`の実データ構造（`lib/types.ts`の`UpdateCandidate`）を確認したところ、昇格先スキーマ（`NewsItem`/`Tool`/`BenchmarkRecord`/`CanaeEvaluationRecord`）が要求する必須フィールドの大半を`UpdateCandidate`は持っていないことが判明した。

例（`news`の場合）：`company` / `category` / `importance` / `summary` / `impact` / `sourceType` は`UpdateCandidate`に存在しない。`tool` / `benchmark` / `canae-evaluation`も同様に、`scores` / `benchmarkName` / `useCase` / `evidence`等の中核フィールドが候補登録データには存在しない。

これは`tool`/`benchmark`/`canae-evaluation`だけでなく`news`を含む**全候補タイプに共通する構造的なギャップ**であり、既存の`scripts/verified-promotion.mjs`（人間がCLIで`--company`等を都度指定してnews.jsonへ反映する既存の手動ツール）が、まさにこのギャップを人間の入力で埋める役割を担ってきたことからも裏付けられる。

### 採用した方針：フィールドを推測・捏造しない

指示書24章「分からないフィールドは勝手に追加しない」「余計なAI内部メモ混入禁止」という安全原則を最優先し、**不足フィールドを自動生成・推測することは一切行わない**。

代わりに、`lib/types.ts`の`UpdateCandidate`に新しいオプショナルフィールド`proposedRecord?: Record<string, unknown> | null`を追加した。これは「昇格先スキーマを満たす完全な構造化レコード」を保持するための置き場所であり、将来的な候補登録フロー（`scripts/candidate-registration.mjs`や`scripts/verified-promotion.mjs`の拡張、または人間によるJSON直接編集）が責任を持って埋めるべきものである。Verified Promotion Automationは、この`proposedRecord`が候補タイプの必須フィールドをすべて満たしている場合にのみpromotion対象として扱う。

満たしていない承認済み候補は、`GET /internal/api/promotion-candidates`のレスポンスで`canPromote: false, reason: "incomplete-proposed-record", missingFields: [...]`として一覧には表示されるが、promotionは実行できない。**これはバグではなく意図した安全側の挙動である。**

現在Production環境に存在する唯一の候補（`candidate-news-github-changelog-...`）は`proposedRecord`を持たないため、本PRのマージ後もそのままでは昇格できない。動作確認は、`proposedRecord`を含む合成データ（テストフィクスチャ、および一時的にローカルのみで`data/update-candidates.json`に追加してブラウザ確認した後に必ず元へ戻したデータ）で行った。

## 実装スコープ

### 対象

- `GET /internal/api/promotion-candidates`：D1のapproved候補を`update-candidates.json`と照合し、promotion可否を一覧化
- `POST /internal/api/promotion-plan`：承認済み・完全な`proposedRecord`を持つ候補から差分案を生成し、D1へ保存（`promotionPlanId`発行）
- `POST /internal/api/promotion-pr`：保存済みplanを確認し、GitHub上にpromotion branchを作成、正本JSON差分と`update-candidates.json`の昇格マーキングをcommitし、PRを作成
- `migrations/0002_verified_promotion.sql`：`promotion_runs` / `promotion_run_items` / `promotion_plans`
- `/internal/review-candidates`ページへの`PromotionPanel`追加
- `scripts/validate-verified-promotion.mjs`（純粋ロジック・D1モック）、`scripts/test-verified-promotion.mjs`（GitHub APIモックを使ったPR作成フロー）

### 非対象（指示書通り）

- mainへの自動merge
- GitHub PRの自動承認
- rejected / on-hold候補のpromotion
- 外部通知（Slack/メール）
- 不確実候補の自動承認

## API契約とD1テーブルの実装詳細

### `promotion_plans`テーブルを追加した理由（指示書との差異）

指示書14章に記載のD1テーブルは`promotion_runs`と`promotion_run_items`のみだったが、`POST /internal/api/promotion-pr`のpayload例は`promotionPlanId`のみを受け取り`candidateIds`を含まない。Workerはリクエスト間で状態を保持しないため、「どのcandidateIdsを対象とするplanなのか」をどこかに永続化する必要がある。

このため、`promotion_plans`テーブル（`id` / `candidate_ids` / `source_store_hash` / `plan` / `actor_email` / `created_at` / `consumed_at`）を追加した。`POST /internal/api/promotion-plan`がplanをここへ保存し、`POST /internal/api/promotion-pr`は`promotionPlanId`をキーにplanを取得して実行する。これにより、confirm時にクライアントから再送されたcandidateIdsを信用するのではなく、実際にplan生成時点でサーバーが検証した内容だけを実行する設計になっている。`consumed_at`はPR作成成功後に記録し、同一planの再利用を防ぐ。

### `data/update-candidates.json`のpromotion branch上での更新について

指示書7章「今回実装しないもの」には（Storage/UI Foundationとは異なり）`update-candidates.json`直接更新の禁止が明記されていない。また`UpdateCandidate`型には元々`promotedRecordType` / `promotedRecordId` / `promotedAt`フィールドが存在し、promotion実行時に設定されることが明らかに意図されている。

このため、`POST /internal/api/promotion-pr`は正本JSON（例：`data/news.json`）への追記コミットに加えて、**同一のpromotion branch上でのみ**`data/update-candidates.json`の対象候補に`promotedRecordType` / `promotedRecordId` / `promotedAt`とchangeLogエントリを設定するコミットも行う。mainへの直接コミットではなくPRブランチ上の変更であり、人間のPRレビュー・merge判断を経るまでmainには一切反映されない。

### 実際のAPIレスポンス例

`GET /internal/api/promotion-candidates`

```json
{
  "ok": true,
  "storeHash": "sha256:...",
  "candidates": [
    {
      "candidateId": "candidate-news-...",
      "candidateType": "news",
      "title": "...",
      "targetFile": "data/news.json",
      "reviewDecision": "approved",
      "reviewStatus": "accepted",
      "canPromote": true
    },
    {
      "candidateId": "candidate-tool-...",
      "candidateType": "tool",
      "title": "...",
      "targetFile": "data/tools.json",
      "reviewDecision": "approved",
      "reviewStatus": "accepted",
      "canPromote": false,
      "reason": "incomplete-proposed-record",
      "missingFields": ["name", "scores", "..."]
    }
  ]
}
```

`POST /internal/api/promotion-plan` → `{ ok, promotionPlanId, changes: [{ candidateId, candidateType, targetFile, operation: "append", summary }] }`（`record`本体・`reviewActor`はサーバー内部にのみ保持し、クライアント応答には含めない）

`POST /internal/api/promotion-pr` → 成功時 `{ ok, promotionRunId, pullRequestUrl, pullRequestNumber, targetBranch, candidateIds }`

## エラー仕様

| ケース | ステータス | error |
| --- | --- | --- |
| D1 binding未設定 | 501 | `storage-not-configured` |
| `GITHUB_PROMOTION_TOKEN`未設定 | 501 | `github-promotion-not-configured` |
| store hash不一致・plan再利用・重複ID等 | 409 | `promotion-conflict`（`reason`で詳細） |
| 既にpromotion済み | 409 | `promotion-pr-already-exists` |
| plan未検出 | 404 | `promotion-plan-not-found` |
| 入力不正 | 400 | `invalid-request` / `incomplete-proposed-record` / `unsupported-candidate-type` |
| D1書き込み失敗 | 500 | `storage-write-failed` |
| GitHub API失敗 | 500 | `github-promotion-failed` |

## GitHub連携

`wrangler.jsonc`の`vars`に非secretの`GITHUB_PROMOTION_REPO_OWNER=canae-tokyo` / `GITHUB_PROMOTION_REPO_NAME=canae-ai-intelligence` / `GITHUB_PROMOTION_BASE_BRANCH=main`を追加した。

**`GITHUB_PROMOTION_TOKEN`は本PRに含めていない。** `wrangler.jsonc`に平文で書かず、`wrangler secret put GITHUB_PROMOTION_TOKEN`でCloudflare側にsecretとして設定する必要がある。指示書「追加の実務判断」に従い、本PRはtoken未設定時に確実に`501 github-promotion-not-configured`を返すところまでを実装範囲とし、実際のtoken発行・secret登録・本番PR作成確認は別途`canae.tokyo@gmail.com`側のGitHubアカウントで行う。

GitHub操作（branch取得・作成、ファイル取得・更新、PR作成）は`fetch`を注入可能な設計にしており、`scripts/test-verified-promotion.mjs`ではGitHub APIをすべてモックしてPR作成フロー・branch名衝突時のsuffix付与・D1への実行ログ保存・失敗時のfailedステータス記録を検証している。**mainへのmerge・merge APIの呼び出しは一切実装していない**（テストでも呼ばれていないことを確認済み）。

## UI実装

`/internal/review-candidates`の上部に`components/PromotionPanel.tsx`を追加した。

- ページ読み込み時に`GET /internal/api/promotion-candidates`を呼び出し、promotion可能な候補をチェックボックス一覧で表示（不可の候補は理由付きで表示のみ）
- 選択後「Promotion planを生成」→ 差分案を表示 →「GitHub PRを作成」の2段階操作
- 「このボタンはmainへ直接反映しません。GitHub PRを作成するだけで、mergeは人間が判断します。」を明示
- 401/404/409/500/501を定型文言で表示し、内部エラーコードや候補本文を露出しない
- `scripts/validate-review-action-ui.mjs`を拡張し、Promotion UIのラベル・APIパスが内部チャンクにのみ存在し、publicページ向けチャンクやビルド出力全体に一切漏れないこと、GitHub token文字列が含まれないことを確認している

## 検証

### 自動テスト

- `npm run validate:verified-promotion`：D1をモックした純粋ロジック（approved限定・source_store_hash検証・重複/既promotion除外・incomplete-proposed-record検出・store-hash競合）
- `npm run test:verified-promotion`：GitHub APIをモックしたPR作成フル フロー（token未設定501・branch作成・ファイル更新・PR作成・D1ログ保存・branch名衝突リトライ・失敗時のfailed記録・二重promotion拒否・main mergeが一切呼ばれないことの確認）

### 手動確認（ローカルのみ、本番D1・本番GitHubには一切接続していない）

`wrangler dev --local`のローカルD1に承認済みレビューレコードを直接投入し、`data/update-candidates.json`へテスト用の完全な`proposedRecord`を一時的に追加してブラウザ実操作を確認（**確認後、`data/update-candidates.json`は元の内容に復元済み**、`git diff`で無変更を確認済み）。

- Promotion候補一覧が正しく表示される
- 候補選択 → 「Promotion planを生成」→ 差分案表示まで成功
- 「GitHub PRを作成」→ `GITHUB_PROMOTION_TOKEN`未設定のため`501`、UI上に「GitHub連携が未設定です。管理者に確認してください。」を表示することを確認

## 検証コマンド

```bash
npm run validate:access-control
npm run validate:data
npm run validate:collection
npm run validate:review-action-api
npm run test:review-action-storage
npm run validate:verified-promotion
npm run test:verified-promotion
npm run build
npm run validate:review-action-ui
npm run lint
git diff --check
```

`validate:review-action-ui`は`npm run build`後に実行すること。

## 完了条件

- Promotion candidates / plan / PR作成APIを実装
- D1 migration（`promotion_runs` / `promotion_run_items` / `promotion_plans`）を追加
- `GITHUB_PROMOTION_TOKEN`未設定時は`501`
- GitHub APIをモックしたPR作成フローがテストPASS
- mainへの自動mergeなし（コード上、merge系エンドポイントを一切呼ばない）
- 正本JSON変更はpromotion branch上のみ（`data/*.json`は本PR自体では無変更）
- Access認可必須、GitHub token非露出、JWT/Cookie非露出
- CI PASS、Cloudflare Workers Build PASS、working tree clean

## 追記：promotion-ready検証候補（GitHub Promotion Token Foundation）

`GITHUB_PROMOTION_TOKEN`設定後にPromotion PR自動作成をエンドツーエンドで確認するため、`data/update-candidates.json`へ`proposedRecord`を完全に満たす候補を1件追加した（`candidate-news-github-changelog-2026-07-07-github-copilot-app-available-to-all`）。

- 内容はテスト用の架空データではなく、GitHub公式changelog（`https://github.blog/changelog/2026-07-07-github-copilot-app-available-to-all/`）で確認した実際の発表内容（Copilotデスクトップアプリが全プラン・全OSで利用可能になったこと）に基づく。
- `proposedRecord`は`news`タイプの必須フィールド（`id`/`title`/`company`/`category`/`importance`/`publishedAt`/`summary`/`impact`/`sourceType`/`sourceUrl`/`sourceCheckedAt`/`status`）をすべて満たしており、推測・捏造したフィールドはない。
- この候補はReview UIでの承認・Promotion UIでのplan生成・PR作成の一連の流れを検証するためのものであり、実際に`data/news.json`へ掲載しても問題ない内容として作成している。
- `news.json`等の正本JSONは本PRでは直接変更していない（`data/update-candidates.json`のみ）。
