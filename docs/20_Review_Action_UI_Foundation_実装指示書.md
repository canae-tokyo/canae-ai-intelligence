# Review Action UI Foundation 実装指示書

## Design Principles

1. ブランド・URL・GitHub・インフラは独立した4レイヤーとして管理する。
2. AI IntelligenceはWeb Assistの研究・検証部門として位置付けるが、システムは完全に独立させる。
3. 公開ベンチマークとCANAE独自評価を混同しない。
4. AIニュースサイトではなく、AI業界を構造化・可視化する知識基盤を目指す。
5. ニュースよりもCANAEの実務検証を価値の中心に据える。

## 目的

Review Action Storage Foundationが正式完了したため、次段階として、内部レビュー画面`/internal/review-candidates`から既存API（`POST /internal/api/review-candidates`）を呼び出し、承認・却下・保留のレビュー操作をCloudflare D1へ保存できるようにする。

本Foundationでは、UIから既存APIを呼び出してD1へ保存できることだけを目的とする。promotion連携、正本データ（`data/*.json`）更新、GitHub自動commitは含めない。

## 現在の前提

| 項目 | 内容 |
| --- | --- |
| 正本URL | `https://canae-ai-intelligence.canae-tokyo.workers.dev` |
| Cloudflare所有アカウント | `canae.tokyo@gmail.com` |
| Access Team | `ancient-dream-d0c9` |
| Access AUD | `9d53a0e4773553030826e4ff6c4e33bedd53e0b592ca0071b0c624f1cd7a3dbf` |
| Certs URL | `https://ancient-dream-d0c9.cloudflareaccess.com/cdn-cgi/access/certs` |
| D1 database | `canae-ai-intelligence-review-actions` |
| D1 database_id | `48bc9be4-5219-49cc-a2ea-9428db53bc0a`（Production反映済み） |
| Review Action API / Storage | Production反映済み。`apply: true`でD1保存が動作する |

## 実装スコープ

### 対象

- `/internal/review-candidates`の候補詳細パネルに承認 / 却下 / 保留の操作UIを追加
- `POST /internal/api/review-candidates`を`apply: true`で呼び出し
- ビルド時に計算した`expectedStoreHash`を送信
- 成功・失敗・競合（409）・保存先未設定（501）をUIに表示
- 二重送信防止（送信中はボタンをdisabled、成功後は確定表示に切り替え）
- Cloudflare Access配下でのみ動作（既存のWorker境界ガードを再利用、UI側の追加認可実装はしない）

### 非対象

- Verified Promotionの自動実行
- `news.json` / `tools.json` / `benchmarks.json` / `canae-evaluations.json`の更新
- `data/update-candidates.json`の直接更新
- GitHub自動commit
- 外部通知、public navigation追加
- D1最新状態のページ初期表示への統合取得（成功レスポンスを使ったクライアント側表示更新のみ）

## API契約との差異（重要）

指示書の payload 例は `candidateType` / `action` / `reason` というキー名を挙げていたが、Review Action API Foundation / Storage Foundationで実装・Production反映済みの実際のAPI契約は以下の通りであり、UIはこの実契約に合わせて実装した。

| 指示書の例 | 実際のAPIフィールド | 備考 |
| --- | --- | --- |
| `action` | `decision`（`approved` / `rejected` / `on-hold`） | `action`という名前のフィールドは存在しない |
| `candidateType` | （送信不要） | サーバー側が`decision.candidate.candidateType`から自動導出する |
| `reason` | `notes` | 必須・単一行・500文字以内。改行・タブ不可（`isCleanSingleLine`） |
| （なし） | `reviewedBy` | 必須・単一行・80文字以内。API定義上必須のため追加 |
| （なし） | `resolveHold` | `reviewStatus: "reviewing"`の候補を承認/却下する際に`true`を送る |

また、`notes`（UI上は「理由・確認メモ」）はAPI側で必須項目（空文字不可）であるため、指示書9.3の「承認では理由を任意にしてよい」という想定は実際のAPI検証と矛盾する。今回はAPIの必須条件を優先し、承認・却下・保留のすべてで担当者名・理由の入力を必須とした。

さらに、Storage Foundationの実装を確認したところ、D1の`review_candidate_actions.reason` / `review_candidate_action_logs.reason`列には、UIが送る自由記述の`notes`ではなく、サーバー内部の状態遷移コード（`manual-review-recorded` / `manual-review-resolved`）が保存される仕様になっている。ユーザーが入力した理由文はAPIレスポンスのエコー以外には永続化されない。これは本UI Foundationのスコープでは変更していない（Storage Foundation側の既存実装であり、変更する場合は別途合意のうえで対応する）。

## UI実装

- `app/internal/review-candidates/page.tsx`をServer Componentのまま`async`化し、`lib/reviewActionStoreHash.ts`の`computeReviewActionStoreHash()`でビルド時に`expectedStoreHash`を計算して`ReviewCandidatesClient`へpropsで渡す。
- `lib/reviewActionStoreHash.ts`は`src/worker.mjs`の`serializeCandidateStore` + `sha256`と同一アルゴリズムを持つ（`JSON.stringify(candidateStore, null, 2) + "\n"`のSHA-256）。ビルド時に計算した値がAPI側の実行時計算値と一致することを検証スクリプトで確認している。
- `components/ReviewCandidatesClient.tsx`の候補詳細パネル内に`ReviewActionPanel`を追加。担当者名・理由入力（各1行、必須）、承認/却下/保留ボタン、送信中/成功/失敗/競合の状態表示を実装。
- リクエストは`fetch("/internal/api/review-candidates", { method: "POST", ... })`という相対パスで送信し、Cloudflare Access配下の同一オリジンリクエストとして扱う。JWT/Cookieはブラウザが自動的に扱うため、クライアントJSでは一切読み取らない。
- `reviewStatus: "reviewing"`の候補では、保留ボタンを無効化し、承認・却下時に`resolveHold: true`を自動付与する。
- 成功後はクライアント側stateのみを更新（`reviewStatus`をレスポンス値に反映）し、`data/update-candidates.json`は変更しない。ページ再読み込み時は静的データに戻る（D1統合表示は本Foundationの対象外）。

## エラー表示方針

| HTTPステータス | UI表示 |
| --- | --- |
| 400 | 入力内容に問題があります。 |
| 404 | 候補が見つからない、またはアクセス権限がありません。 |
| 409 | 候補データが更新されています。画面を再読み込みしてください。 |
| 500 | 保存に失敗しました。時間をおいて再度確認してください。 |
| 501 | 保存先が未設定です。管理者に確認してください。 |
| その他/通信エラー | 保存に失敗しました。時間をおいて再度確認してください。（フォールバック） |

APIレスポンスの詳細（内部エラーコード文字列やcandidate本文）はそのまま画面に表示しない。

## セキュリティ要件

- Cloudflare Access配下の内部ページ・APIのみで動作（既存Worker境界を変更していない）
- `actor_email`はクライアントから送信しない。API側でAccess認証情報から取得する既存動作を維持
- クライアントJSにAccess AUD / Certs URLを埋め込まない（ビルド出力を検証スクリプトで確認）
- JWT / Cookie / Access Tokenをconsole出力しない
- APIレスポンスをそのまま画面に露出しすぎない（ステータスコード単位の定型メッセージのみ表示）

## テスト要件

`scripts/validate-review-action-ui.mjs`（`npm run validate:review-action-ui`、`npm run build`後に実行）で以下を検証する。

- ビルド出力（`out/internal/review-candidates.txt`）に埋め込まれた`expectedStoreHash`が、`src/worker.mjs`の`getReviewActionStoreHash()`が返す値と完全一致する
- 内部レビューページのクライアントチャンクに「承認」「却下」「保留」ボタンラベルと`Review Action`見出し、APIパス`/internal/api/review-candidates`が含まれる
- 上記のボタンラベルが内部レビューページ以外のチャンクに含まれない（publicページへの非流出確認）
- ビルド出力全体に本番Access AUD／Certs URLホスト名、`actor_email`/`actorEmail`文字列が含まれない
- ビルド出力全体に暫定Cloudflare値（`s365963w`、`young-frost-5d7d`、暫定AUD、暫定workers.dev URL）が含まれない

加えて、`npx wrangler dev --local`によるローカルWorker + ローカルD1エミュレーション（本番D1には一切接続しない）でブラウザから実操作を確認した。

- 承認ボタン押下 → `POST /internal/api/review-candidates`が`200`で成功し、ローカルD1の`review_candidate_actions` / `review_candidate_action_logs`に正しい値（`actor_email: "local-dev"`はローカルバイパス由来）で保存されることを確認
- 担当者名・理由未入力時はボタンがdisabledのままであることを確認
- 意図的に不正な`expectedStoreHash`を送信し`409 store-hash-mismatch`を確認
- 意図的に不正な`decision`を送信し`400 decision-invalid`を確認
- 成功後、UI上で候補が確定済み表示（Accepted）に切り替わり、操作ボタンが再表示されないことを確認

既存の`npm run validate:review-action-api` / `npm run test:review-action-storage`も引き続きPASSすることを確認する。

## 検証コマンド

```bash
npm run validate:access-control
npm run validate:data
npm run validate:collection
npm run validate:review-action-api
npm run test:review-action-storage
npm run build
npm run validate:review-action-ui
npm run lint
git diff --check
```

`validate:review-action-ui`はビルド成果物（`out/`）を参照するため、`npm run build`の後に実行すること。

## PR方針

### PR名

```text
Add v1.1.2 review action UI foundation
```

### PR本文に含めること

```text
Summary:
- Add Review Action UI Foundation for internal review candidates.
- Add approved / rejected / on-hold action controls.
- Call POST /internal/api/review-candidates with apply:true.
- Persist review actions to D1 through the existing API.
- Keep public pages unchanged.
- Keep data/*.json unchanged.

Safety:
- Cloudflare Access remains required.
- No public navigation changes.
- No promotion execution.
- No news/tools/benchmarks/canae-evaluations writes.
- No update-candidates.json writes.
- No GitHub commit automation.
- No Access token/JWT exposure.
- No fail-open behavior.

Storage:
- Uses existing D1-backed Review Action Storage Foundation.
- D1 database: canae-ai-intelligence-review-actions.
- Does not directly write static JSON files.

Verification:
- npm run validate:access-control
- npm run validate:data
- npm run validate:collection
- npm run validate:review-action-api
- npm run test:review-action-storage
- npm run build
- npm run validate:review-action-ui
- npm run lint
- git diff --check
```

## 完了条件

- Review UIに承認 / 却下 / 保留ボタンが追加されている
- `POST /internal/api/review-candidates`を`apply: true`・`expectedStoreHash`付きで呼び出す
- `actor_email`をリクエストに含めない
- 成功・失敗・競合・保存先未設定をUIに表示する
- 二重送信防止が機能する
- `data/*.json`が未変更である
- publicページが未変更である
- promotion連携・GitHub自動commitが未実装である
- CI、build、validatorがPASSする
