# Cloudflare Access 本番導入・差異報告書

## Design Principles

1. ブランド・URL・GitHub・インフラは独立した4レイヤーとして管理する。
2. AI IntelligenceはWeb Assistの研究・検証部門として位置付けるが、システムは完全に独立させる。
3. 公開ベンチマークとCANAE独自評価を混同しない。
4. AIニュースサイトではなく、AI業界を構造化・可視化する知識基盤を目指す。
5. ニュースよりもCANAEの実務検証を価値の中心に据える。

## 文書の位置付け

本書は、`s365963w@gmail.com`側Cloudflareアカウントで実施された暫定導入作業と、CANAE正本環境で完了したCloudflare Access本番導入結果を分離して記録する報告書である。

CANAE AI Intelligenceの正本環境は以下で固定する。

| 項目 | 正本 |
| --- | --- |
| Production URL | `https://canae-ai-intelligence.canae-tokyo.workers.dev` |
| Cloudflare所有・本番管理アカウント | `canae.tokyo@gmail.com` |
| GitHubリポジトリ | `canae-tokyo/canae-ai-intelligence` |

Production URL、Cloudflare所有アカウント、WorkersサブドメインはRule A相当の変更禁止項目として扱う。`s365963w@gmail.com`側で作成されたURL、Cloudflareアカウント、Zero Trust Teamを正本へ置き換えてはならない。

## 依頼内容

2026-07-23、以下5点を依頼された。

1. Cloudflare Dashboardでworkers.devサブドメインを設定する。
2. `wrangler deploy`を実行する。
3. デプロイ後、Workerの動作確認を行う。
4. Cloudflare Accessを有効化する。
5. Allow Policyに`canae.tokyo@gmail.com`を設定する。

前提として、`npm run build`成功、`npm run validate:access-control`成功、Wranglerログイン済み（Account ID `f29a58baffefac22bd7d0cde6a79b05d`）であったが、workers.devサブドメイン未登録のため`wrangler deploy`が未完了の状態だった。

## CANAE正本環境での本番導入結果

2026-07-24、CANAE正本Cloudflare環境でCloudflare Access設定、Worker環境変数設定、再デプロイ、本番確認を実施した。

| 項目 | 内容 |
| --- | --- |
| Cloudflare所有・本番管理アカウント | `canae.tokyo@gmail.com` |
| Account ID | `108282d08ccb7743750aaa4dd6944b02` |
| Production URL | `https://canae-ai-intelligence.canae-tokyo.workers.dev` |
| Worker名 | `canae-ai-intelligence` |
| Access Team | `ancient-dream-d0c9` |
| Access Application | `canae-ai-intelligence` |
| 対象Domain | `canae-ai-intelligence.canae-tokyo.workers.dev` |
| 対象Path | `/internal/*` |
| Allow Policy | Email = `canae.tokyo@gmail.com` |
| Application Audience (AUD) | `9d53a0e4773553030826e4ff6c4e33bedd53e0b592ca0071b0c624f1cd7a3dbf` |
| JWT証明書URL | `https://ancient-dream-d0c9.cloudflareaccess.com/cdn-cgi/access/certs` |
| Worker Version ID | `f9f6c705-93a9-4ff0-b547-1c3fdcea8474` |

## CANAE正本環境のWorker環境変数

| 変数名 | 値 |
| --- | --- |
| `INTERNAL_REVIEW_ALLOWED_EMAILS` | `canae.tokyo@gmail.com` |
| `CF_ACCESS_AUD` | `9d53a0e4773553030826e4ff6c4e33bedd53e0b592ca0071b0c624f1cd7a3dbf` |
| `CF_ACCESS_CERTS_URL` | `https://ancient-dream-d0c9.cloudflareaccess.com/cdn-cgi/access/certs` |

## CANAE正本環境の本番確認結果

| 確認項目 | 結果 |
| --- | --- |
| `/` | HTTP 200 |
| `/news` | HTTP 200 |
| `/genre/coding` | HTTP 200 |
| 通常404 | 正常 |
| `/internal/review-candidates`未認可 | Cloudflare Accessログイン誘導、または未認可拒否 |
| 未認可レスポンスの候補情報 | 非混入 |
| `/internal/review-candidates`認可あり | HTTP 200 |
| Review UI | 表示確認済み |
| 候補一覧 | 表示確認済み |
| `pending` / `reviewing` / `accepted` / `rejected`絞り込み | 表示確認済み |
| 候補詳細 | 表示確認済み |
| `duplicateCheck` / `diffSummary` / レビュー履歴 | 表示確認済み |
| 読み取り専用 | 維持 |
| `X-Robots-Tag` | `noindex, nofollow`維持 |
| HTML `robots` / `googlebot` | `noindex, nofollow`維持 |

## 正式判定

Internal Review Access Control Foundationは、CANAE正本Cloudflare環境でProduction反映、Cloudflare Access有効化、本番Fail-closed、認可あり200、Review UI表示、候補情報の認可外非混入を確認済みである。

Review Action API Foundationへ進む前提条件は満たした。ただし、操作機能、書き込みAPI、承認・却下・昇格UIは本書の対象外であり、別PRで安全境界を設計・実装する。

## 暫定実施結果概要

| ステップ | 結果 |
| --- | --- |
| 1. workers.devサブドメイン設定 | `s365963w@gmail.com`側で暫定完了 |
| 2. `wrangler deploy` | `s365963w@gmail.com`側で暫定完了 |
| 3. Worker動作確認 | 暫定URLで確認 |
| 4. Cloudflare Access有効化 | `s365963w@gmail.com`側Zero Trust Teamで暫定完了 |
| 5. Allow Policy設定 | 暫定環境で設定 |
| CANAE正本環境でのAccess設定 | 完了 |

## 暫定環境

| 項目 | 内容 |
| --- | --- |
| Wranglerログインアカウント | `s365963w@gmail.com` |
| Cloudflare Account ID | `f29a58baffefac22bd7d0cde6a79b05d` |
| workers.devサブドメイン | `canae-ai-intelligence.workers.dev` |
| 暫定公開URL | `https://canae-ai-intelligence.canae-ai-intelligence.workers.dev` |
| Zero Trust Team | `young-frost-5d7d` |
| JWT証明書URL | `https://young-frost-5d7d.cloudflareaccess.com/cdn-cgi/access/certs` |
| Application Audience (AUD) | `b204fefa1ddd1f78ad153aa9dc99e1c63e5da188f69ae27dd6780c42924e0179` |

上記は暫定環境の値であり、CANAE正本Production URLやCloudflare所有アカウントを置き換える根拠にはしない。

## 1. workers.devサブドメイン設定（暫定環境）

| 項目 | 内容 |
| --- | --- |
| 希望名 | `canae-tokyo` |
| 結果 | 他アカウントが既に使用中のため登録不可（workers.devは全アカウント共通の名前空間） |
| 採用名 | `canae-ai-intelligence` |
| 確定サブドメイン | `canae-ai-intelligence.workers.dev` |

このサブドメインはCANAE正本Production URLではない。正本Production URLは`https://canae-ai-intelligence.canae-tokyo.workers.dev`のまま維持する。

## 2. `wrangler deploy`（暫定環境）

| 項目 | 内容 |
| --- | --- |
| コマンド | `wrangler deploy`（wrangler 4.113.0） |
| Worker名 | `canae-ai-intelligence` |
| デプロイ結果 | 成功、42アセットアップロード |
| 公開URL | `https://canae-ai-intelligence.canae-ai-intelligence.workers.dev` |
| Version ID（初回） | `a542fb3e-f765-43e5-a02f-c9da84c8b849` |
| Version ID（Access設定反映後） | `88389838-517e-4a83-85b1-d21a83d6c749` |

補足: 非対話環境の`wrangler deploy`はworkers.devサブドメイン未登録時に自動で登録を拒否するため、サブドメイン登録はCloudflare Dashboard側で先に完了させる必要があった。

## 3. Worker動作確認（暫定環境）

| 確認項目 | 結果 |
| --- | --- |
| `/`（ルート） | HTTP 200 |
| `/internal/review-candidates`（Access設定前） | HTTP 404 |
| `/internal/review-candidates`（Access設定後・未認証） | HTTP 302、Cloudflare Accessログイン画面へリダイレクト |

Access設定前の404は不具合ではなく、[`src/worker.mjs`](../C-Ai-Map/src/worker.mjs)の`authorizeInternalReviewRequest`によるFail-closed設計（Access JWTと`INTERNAL_REVIEW_ALLOWED_EMAILS`が揃うまで404を返す）が正しく機能した結果である。

## 4. Cloudflare Access有効化（暫定環境）

| 項目 | 内容 |
| --- | --- |
| プラン | Zero Trust Free（$0 / シート / 月、50シートまで） |
| チーム名 | `young-frost-5d7d`（自動採番） |
| 前提条件 | 支払い方法の登録（無料プランでも要求された。ユーザー本人が実施） |
| アプリケーションタイプ | セルフホスト |
| アプリケーション名 | `canae-ai-intelligence` |
| 保護対象ホスト名 | `canae-ai-intelligence.canae-ai-intelligence.workers.dev` |
| 保護対象パス | `/internal` |
| Application Audience (AUD) タグ | `b204fefa1ddd1f78ad153aa9dc99e1c63e5da188f69ae27dd6780c42924e0179` |
| JWT証明書URL | `https://young-frost-5d7d.cloudflareaccess.com/cdn-cgi/access/certs` |

Zero Trust Team `young-frost-5d7d`は暫定環境のTeamであり、CANAE正本Cloudflareアカウントの本番設定としては扱わない。

## 5. Allow Policy（暫定環境）

| 項目 | 内容 |
| --- | --- |
| ポリシー名 | `Internal Review Allow` |
| アクション | Allow |
| ルール | Email = `canae.tokyo@gmail.com` |
| 認証方法 | 外部IDプロバイダー未設定のため、Cloudflareデフォルトのワンタイムパスコード（メールOTP）を使用 |

## Worker環境変数（暫定環境の`wrangler.jsonc`）

Access JWT検証のため、[`C-Ai-Map/wrangler.jsonc`](../C-Ai-Map/wrangler.jsonc)に`vars`を追加し再デプロイした。

| 変数名 | 値 |
| --- | --- |
| `CF_ACCESS_AUD` | `b204fefa1ddd1f78ad153aa9dc99e1c63e5da188f69ae27dd6780c42924e0179` |
| `CF_ACCESS_CERTS_URL` | `https://young-frost-5d7d.cloudflareaccess.com/cdn-cgi/access/certs` |
| `INTERNAL_REVIEW_ALLOWED_EMAILS` | `canae.tokyo@gmail.com` |

## 暫定確認結果

| 確認項目 | 結果 |
| --- | --- |
| `/` | HTTP 200 |
| `/internal/review-candidates`（未認証） | HTTP 302、`young-frost-5d7d.cloudflareaccess.com`のログイン画面へリダイレクト |
| Allow Policy対象外ユーザーのアクセス | 未検証（`canae.tokyo@gmail.com`本人によるログイン確認が必要） |

## 重要な差異

[`09_本番運用開始報告書.md`](09_本番運用開始報告書.md)および[`10_現行ステータス.md`](10_現行ステータス.md)には、Production URLとして`https://canae-ai-intelligence.canae-tokyo.workers.dev`、Cloudflareアカウントとして`canae.tokyo@gmail.com`が正本記載されている。

しかし本作業は以下の暫定環境で実施された。

- Wranglerログインアカウント: `s365963w@gmail.com`（Account ID `f29a58baffefac22bd7d0cde6a79b05d`）
- 希望していた`canae-tokyo`サブドメインは他アカウントが既に使用中のため登録不可
- 実際に確定した暫定URL: `https://canae-ai-intelligence.canae-ai-intelligence.workers.dev`
- Zero Trust Team: `young-frost-5d7d`

既存正本文書のProduction URL・Cloudflare所有アカウントは正しいため、暫定環境の値へ更新しない。必要な対応は、CANAE正本環境でCloudflare Accessを設定し直すことである。

## CANAE正本環境で完了したタスク

| タスク | 状態 |
| --- | --- |
| `canae.tokyo@gmail.com`側CloudflareアカウントでZero Trust / Access設定を確認 | 完了 |
| `https://canae-ai-intelligence.canae-tokyo.workers.dev/internal/*`をAccess Application対象に設定 | 完了 |
| Allow Policyに`canae.tokyo@gmail.com`を設定 | 完了 |
| 正本Worker環境変数にAccess AUD / Certs URL / 許可メールを設定 | 完了 |
| 正本URLで未認可Access誘導、認可あり200、候補情報非混入を確認 | 完了 |
| 正本Worker Version IDを記録 | 完了 |

## 判定

暫定環境では依頼された5ステップが完了し、`/internal/*`はCloudflare Access（Allow Policy: `canae.tokyo@gmail.com`）とWorker側Fail-closedガードの二重制御下にあることを確認した。

ただし、この結果は`canae-ai-intelligence.canae-ai-intelligence.workers.dev`および`s365963w@gmail.com`側Cloudflareアカウントでの暫定導入結果であり、CANAE正本環境の本番導入完了を意味しない。

その後、CANAE正本環境でもCloudflare Access設定、Worker環境変数設定、再デプロイ、本番確認を完了した。正本URL`https://canae-ai-intelligence.canae-tokyo.workers.dev/internal/review-candidates`で認可あり200、Review UI表示、候補一覧、絞り込み、候補詳細、読み取り専用維持を確認済みである。

以上により、Internal Review Access Control Foundationは正式完了とする。次フェーズはReview Action API Foundationとし、UI操作や書き込み処理は別PRで扱う。
