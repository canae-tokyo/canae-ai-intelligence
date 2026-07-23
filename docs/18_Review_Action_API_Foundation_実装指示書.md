# Review Action API Foundation 実装指示書

## Design Principles

1. ブランド・URL・GitHub・インフラは独立した4レイヤーとして管理する。
2. AI IntelligenceはWeb Assistの研究・検証部門として位置付けるが、システムは完全に独立させる。
3. 公開ベンチマークとCANAE独自評価を混同しない。
4. AIニュースサイトではなく、AI業界を構造化・可視化する知識基盤を目指す。
5. ニュースよりもCANAEの実務検証を価値の中心に据える。

## 目的

Internal Review Access Control Foundationが正式完了したため、次段階としてReview UIから利用できるレビュー状態変更APIの安全境界を実装する。

本Foundationでは、API側で`update-candidates.json`のレビュー判断を安全に記録できることだけを目的とする。UIボタン、正本データ昇格、通知、公開反映は含めない。

## 現在の前提

| 項目 | 内容 |
| --- | --- |
| 正本URL | `https://canae-ai-intelligence.canae-tokyo.workers.dev` |
| Cloudflare所有アカウント | `canae.tokyo@gmail.com` |
| Access Team | `ancient-dream-d0c9` |
| Worker Version ID | `f9f6c705-93a9-4ff0-b547-1c3fdcea8474` |
| Access AUD | `9d53a0e4773553030826e4ff6c4e33bedd53e0b592ca0071b0c624f1cd7a3dbf` |
| Certs URL | `https://ancient-dream-d0c9.cloudflareaccess.com/cdn-cgi/access/certs` |
| Review UI | 読み取り専用でProduction反映済み |
| Access制御 | CANAE正本Cloudflare環境で認可あり200確認済み |

## 実装スコープ

### 対象

- Review Action APIの追加
- Cloudflare Access認可済みユーザーのみ実行可能
- 対象データは`data/update-candidates.json`のみ
- `pending`候補の`approved` / `rejected` / `on-hold`判断
- `reviewing`候補の保留解除判断
- `reviewedAt`、`reviewedBy`、`reviewNotes`、`reviewDecision`の記録
- `changeLog`への監査履歴追記
- 入力ハッシュ再確認
- 原子的更新
- 失敗時ロールバック
- API実行レポートまたはレスポンスで処理結果を返す

### 非対象

- Review UIの承認・却下・保留ボタン
- `news.json`、`tools.json`、`benchmarks.json`、`canae-evaluations.json`の更新
- Verified Promotionの実行
- 自動公開
- CANAE影響メモの生成
- 通知
- ロール細分化
- 外部DB / 外部API / ログイン機能の追加

## API設計

初期案は以下とする。

```text
POST /internal/api/review-candidates
```

リクエスト例:

```json
{
  "candidateId": "candidate-news-github-changelog-2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle",
  "decision": "approved",
  "reviewedBy": "CANAE/Sato",
  "notes": "公式情報と内容を確認",
  "expectedStoreHash": "sha256:..."
}
```

許可する`decision`:

```text
approved
rejected
on-hold
```

保留解除時は明示フラグを必須にする。

```json
{
  "candidateId": "...",
  "decision": "approved",
  "resolveHold": true,
  "reviewedBy": "CANAE/Sato",
  "notes": "追加確認完了",
  "expectedStoreHash": "sha256:..."
}
```

## 状態遷移

| 現在状態 | 操作 | 結果 | 条件 |
| --- | --- | --- | --- |
| `pending` | `approved` | `reviewStatus: accepted` | 通常許可 |
| `pending` | `rejected` | `reviewStatus: rejected` | 通常許可 |
| `pending` | `on-hold` | `reviewStatus: reviewing` | 通常許可 |
| `reviewing` | `approved` | `reviewStatus: accepted` | `resolveHold: true`必須 |
| `reviewing` | `rejected` | `reviewStatus: rejected` | `resolveHold: true`必須 |
| `reviewing` | `on-hold` | 拒否 | 保留の再保留は禁止 |
| `accepted` | 任意 | 拒否 | 終端状態 |
| `rejected` | 任意 | 拒否 | 終端状態 |

## 認可境界

- `/internal/api/*`はCloudflare Access + Worker側ガードの二重制御下に置く。
- Cloudflare Access JWTがない場合はFail-closed。
- 許可メールに一致しない場合はFail-closed。
- 本番ではローカルバイパスを無効にする。
- 未認可レスポンスに候補本文、候補ID一覧、差分、レビュー履歴を含めない。
- ログに候補本文や機密情報を出さない。

## 書き込み安全境界

- 通常のAPI実行は明示的なレビュー操作として扱う。
- `expectedStoreHash`を必須にし、書き込み直前に`data/update-candidates.json`を再読込して一致確認する。
- ハッシュ不一致は`409 Conflict`で拒否する。
- 一時ファイルへ書き込み、JSON再読込検証後にrenameする。
- 更新前バックアップを作成し、更新失敗時はロールバックする。
- 候補が存在しない場合、既に終端状態の場合、不正な状態遷移の場合はストアを書き換えない。
- `news.json`等の正本データは絶対に更新しない。

## バリデーション

- `candidateId`必須
- `decision`は`approved` / `rejected` / `on-hold`のみ
- `reviewedBy`必須、空白のみは禁止
- `notes`必須、空白のみは禁止
- `expectedStoreHash`必須
- `resolveHold`は`reviewing`からの承認・却下時のみ許可
- `reviewedAt`はサーバー側でISO日時を生成
- `reviewDecision`と`reviewStatus`の整合を検証
- `changeLog`を上書きせず追記する

## レスポンス

成功例:

```json
{
  "ok": true,
  "candidateId": "...",
  "previousReviewStatus": "pending",
  "reviewStatus": "accepted",
  "reviewDecision": "approved",
  "reviewedAt": "2026-07-24T00:00:00.000Z",
  "storeChanged": true
}
```

拒否例:

```json
{
  "ok": false,
  "error": "candidate-already-finalized",
  "storeChanged": false
}
```

## テスト項目

- 未認可API呼び出しは拒否される
- 許可メール以外は拒否される
- `pending -> approved`
- `pending -> rejected`
- `pending -> on-hold`
- `reviewing -> approved`は`resolveHold: true`必須
- `reviewing -> rejected`は`resolveHold: true`必須
- `accepted` / `rejected`の再変更拒否
- 存在しないCandidate ID拒否
- 不正decision拒否
- 空の`reviewedBy`拒否
- 空の`notes`拒否
- ハッシュ不一致は`409 Conflict`
- 書き込み失敗時にロールバック
- `news.json`等の正本データ未変更
- Review UIに操作ボタンを追加していない
- 公開ページ`/`、`/news`、`/genre/coding`に影響なし
- 404正常
- `noindex`維持

## 検証コマンド

```bash
npm run validate:access-control
npm run validate:data
npm run validate:collection
npm run validate:candidates
npm run validate:manual-review
npm run lint
npm run build
git diff --check
```

必要に応じてAPI専用の検証コマンドを追加する。

```bash
npm run validate:review-action-api
```

## PR方針

### PR名

```text
Add v1.1.2 review action API foundation
```

### PR本文に含めること

```text
Summary:
- Add Review Action API foundation for update candidates.
- Require Cloudflare Access authorization.
- Update only data/update-candidates.json.
- Record approved / rejected / on-hold decisions.
- Preserve read-only Review UI.

Safety:
- No Review Action UI buttons.
- No news.json updates.
- No verified promotion.
- No auto publish.
- Fail-closed for unauthorized requests.
- Hash check, atomic write, rollback.

Verification:
- validate commands
- lint
- build
- git diff --check
```

## 完了条件

- 認可済み管理者だけがAPIを実行できる
- 未認可レスポンスに候補情報が混入しない
- `update-candidates.json`のみが更新対象
- 正本データは未変更
- 状態遷移が詰まらない
- 終端状態の再変更を拒否する
- ハッシュ再確認、原子的更新、ロールバックが実装されている
- Review UIは読み取り専用のまま
- CI、build、validatorが通る
