# CHANGELOG

## v1.1.2 - 2026-07-21

- PR #7をSquash Mergeし、v1.1.2 Automated Collection & Update Assistance DesignをProductionへ反映。
- Merge Commit `8331e291f15d62f92001408cef64d3fcbc846d3d` を確認。
- GitHub Actions CIとGitHub Pages deploymentの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `noindex`と`X-Robots-Tag: noindex, nofollow`の維持を確認。
- v1.1.2 Automated Collection & Update Assistance Designを開始。
- `16_v1.1.2_自動収集更新補助設計.md`を追加し、自動化対象と人手必須範囲を固定。
- `collection-sources.json`を追加し、公式一次情報の収集対象を管理する構造を追加。
- `update-candidates.json`を追加し、収集・差分検知候補を`draft`前段階で管理する構造を追加。
- 自動収集は候補作成までとし、`verified`昇格とProduction反映は人手確認を必須とするルールを明記。
- `npm run validate:collection`を追加し、source ID、candidate ID、URL、日付、候補ステータス、参照整合性を検証。
- Google AI Blogの収集元URLを正規URLへ更新。
- 設計リリース時点の`update-candidates.json`は空配列とし、本番表示経路へ候補データを混入させない。
- Collection Helper Foundationとして、外部通信なしの`npm run collection:dry-run`を追加。
- `collection-sources.json`から`enabled`、`priority`、`cadence`で対象を選び、`reports/collection-dry-run-report.local.json`へ実行予定を保存する構造を追加。
- dry-run引数の妥当性検証、Asia/Tokyo基準の実行日、固定サンプルレポートを追加。
- PR #9をSquash Mergeし、Collection Helper FoundationをProductionへ反映。
- Merge Commit `51486ac796b7f634b73827a729353f3b5c4c5132` を確認。
- GitHub Actions CIとGitHub Pages deploymentの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `noindex`と`X-Robots-Tag: noindex, nofollow`の維持を確認。
- External Fetch Foundationとして、`npm run external-fetch:dry-run`を追加。
- `source-openai-news`と`source-github-changelog`の2件に限定し、外部取得結果を`reports/external-fetch-report.local.json`へ保存する構造を追加。
- 実在日付検証、重複`sourceId`拒否、最終URL・ホスト・クロスドメインリダイレクト記録、Content-Type許可判定を追加。
- HTTPエラーは取得結果として記録し、レポート生成成功とは分離する`executionStatus`と`exitPolicy`を追加。
- `update-candidates.json`、`news.json`、`tools.json`、`benchmarks.json`、`canae-evaluations.json`への書き込みは行わない。
- PR #11をSquash Mergeし、External Fetch FoundationをProductionへ反映。
- Merge Commit `400aab96a1fdbfe95f4c03b3fafd19aa92ee4b3f` を確認。
- GitHub Actions CIとGitHub Pages deploymentの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `noindex`と`X-Robots-Tag: noindex, nofollow`の維持を確認。
- Candidate Generation Foundationとして、`npm run candidate:generate`と`npm run validate:candidates`を追加。
- `source-github-changelog`の200取得結果のみを対象に、HTMLから候補ニュースを抽出し、`reports/candidate-generation-report.local.json`へ保存する構造を追加。
- 候補生成はレポート出力までとし、`update-candidates.json`や正本データへの書き込みは行わない。
- 要約未生成を`summary: null`、`summarySource: none`、`summaryGenerated: false`として記録し、fixtureとregex抽出の前提を文書化。
- PR #13をSquash Mergeし、Candidate Generation FoundationをProductionへ反映。
- Merge Commit `ff32f9929602d180f0d1714337146707210c2a96` を確認。
- GitHub Actions CIとGitHub Pages deploymentの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `noindex`と`X-Robots-Tag: noindex, nofollow`の維持を確認。
- Duplicate & Diff Detection Foundationとして、`npm run duplicate-diff:detect`と`npm run validate:duplicate-diff`を追加。
- Candidate Generationレポートを入力に、`canonicalUrl`完全一致、正規化URL一致、タイトル類似、Content Fingerprint、差分項目一覧をレポート化する構造を追加。
- 固定fixtureで完全一致、正規化URLのみ一致、タイトル差分、新規候補のケースを検証するサンプルレポートを追加。
- この段階では`update-candidates.json`、`news.json`、`tools.json`、`benchmarks.json`、`canae-evaluations.json`への書き込みは行わない。
- PR #15をSquash Mergeし、Duplicate & Diff Detection FoundationをProductionへ反映。
- Merge Commit `04e3647442f80bbf7e80b92a3a847727b8635b80` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `X-Robots-Tag: noindex, nofollow`の維持と、ビルド成果物HTMLの`robots` / `googlebot` `noindex`を確認。
- Candidate Registration Foundationとして、`npm run candidate:register`と`npm run validate:registration`を追加。
- Duplicate & Diff Detectionレポートの`new`候補だけを`update-candidates.json`へ`pending` / `draft`として登録する構造を追加。
- 通常実行はdry-runとし、`--apply`指定時だけ`data/update-candidates.json`へ原子的に反映する境界を追加。
- 登録時に`registeredAt`を付与し、同一候補ID、同一`canonicalUrl`、正規化`canonicalUrl`、pending以外の候補、`verified`昇格を拒否する境界を追加。
- `reports/candidate-registration-report.example.json`を追加し、登録件数、スキップ件数、重複・拒否理由を記録。
- この段階では`news.json`、`tools.json`、`benchmarks.json`、`canae-evaluations.json`への書き込み、レビューUI、自動公開、`verified`昇格は行わない。
- PR #17をSquash Mergeし、Candidate Registration FoundationをProductionへ反映。
- Merge Commit `bb90cdc50b47d8633190c3fc6a43605cfa53f58d` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `X-Robots-Tag: noindex, nofollow`の維持と、ビルド成果物HTMLの`robots` / `googlebot` `noindex`を確認。
- Manual Review Foundationとして、`npm run candidate:review`と`npm run validate:manual-review`を追加。
- `reviewDecision`を追加し、既存`reviewStatus` enumを維持したまま`approved` / `rejected` / `on-hold`を記録する構造を追加。
- `reviewing`からの保留解除は`--resolve-hold`必須とし、`accepted` / `rejected`は終端状態として再変更を拒否。
- `--apply`時の原子的更新と書込み直前入力ハッシュ再確認を追加。
- PR #19をSquash Mergeし、Manual Review FoundationをProductionへ反映。
- Merge Commit `701a22e605eec3e1a0b80562cdf21dd3d664a369` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `X-Robots-Tag: noindex, nofollow`の維持を確認。
- Verified Promotion Foundationとして、`npm run candidate:promote`と`npm run validate:promotion`を追加。
- 承認済みnews候補を`news.json`へ昇格するCLI基盤を追加し、dry-run既定、`--apply`必須、2ファイル原子的更新、入力ハッシュ再確認、バックアップ、ロールバック境界を実装。
- `news.json`側のID、完全`sourceUrl`、正規化`sourceUrl`重複拒否と必須メタ情報検証を追加。
- 昇格後のnewsは`status: verified`、`dataQuality: verified`に固定し、候補側へ`promotedRecordType`、`promotedRecordId`、`promotedAt`を記録。
- PR #21をSquash Mergeし、Verified Promotion FoundationをProductionへ反映。
- Merge Commit `e5bdce2e81f99ec5812333678438362bee9da854` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `X-Robots-Tag: noindex, nofollow`の維持を確認。
- Review UI Foundationとして、`/internal/review-candidates`に読み取り専用の候補確認画面を追加。
- `update-candidates.json`の候補一覧、`pending` / `reviewing` / `accepted` / `rejected`絞り込み、候補詳細、外部リンク、`duplicateCheck`、`diffSummary`、レビュー履歴を表示。
- 公開ナビ導線、書き込み処理、API route、UI操作による承認・却下・昇格は追加しない。
- PR #23をSquash Mergeし、Review UI FoundationをProductionへ反映。
- Merge Commit `261bdf8eb253e3d0964330aa03a8376a1106b9e9` を確認。
- Cloudflare Workers Build Version `106a4297-e231-476e-b4be-8ac5a56478bc` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、`/internal/review-candidates`、404応答を確認。
- `X-Robots-Tag: noindex, nofollow`とHTML `robots` / `googlebot` `noindex`の維持を確認。
- Internal Review Access Control Foundationとして、Cloudflare Worker境界で`/internal/*`を保護する構造を追加。
- Cloudflare Access JWT検証、許可メール照合、Fail-closed、ローカル限定バイパスを実装。
- `wrangler.jsonc`を追加し、Worker entrypointとStatic Assets bindingを定義。
- `npm run validate:access-control`を追加し、未認可404、ASSETS未到達、候補情報非混入、許可メール、ローカル限定バイパスを検証。
- PR #25をSquash Mergeし、Internal Review Access Control FoundationをProductionへ反映。
- Merge Commit `f526bade681894b47c620dcd348cf6e4ec4bc9f7` を確認。
- PR #25反映直後の本番確認で、Cloudflare Workers Static Assetsの既定動作により`/internal/review-candidates`がWorkerより先に配信される問題を確認。
- PR #26で`assets.run_worker_first`を`/internal`と`/internal/*`へ追加し、WorkerをStatic Assets配信前に実行する境界へ修正。
- Merge Commit `63b3c4cc3ad857d8e39f6a34220a3ae2e6e6b672` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`は200、未認可`/internal/review-candidates`は404、通常404応答は404であることを確認。
- 未認可`/internal/review-candidates`レスポンスに候補タイトルや候補データが含まれないことを確認。
- `X-Robots-Tag: noindex, nofollow`とHTML `robots` / `googlebot` `noindex`の維持を確認。

## v1.1.1 - 2026-07-21

- PR #5をSquash Mergeし、v1.1.1 Benchmark & Evaluation SeparationをProductionへ反映。
- Merge Commit `8f1e94821fe7577d8f761256b74a9319c9d1fb41` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/genre/coding`、404応答を確認。
- 本番HTMLで`SWE-bench Verified`の新データ参照、旧`tools.json`フォールバック表示、`noindex`維持を確認。
- v1.1.1 Benchmark & Evaluation Separationを開始。
- `benchmarks.json`を追加し、公開ベンチマークを結果単位で管理する構造を追加。
- `canae-evaluations.json`を追加し、CANAE実務評価を独立管理する構造を追加。
- `tools.json`既存フィールドは削除・名称変更・型変更せず、v1.1.x互換性を維持。
- ランキング、ツールカード、詳細パネルで新データ優先・旧`tools.json`フォールバックの参照へ変更。
- `npm run validate:data`を追加し、ID、toolId、日付、重複、CANAE評価混在禁止を検証。
- `15_v1.1.1_ベンチマーク評価分離.md`を追加。

## v1.1.0 - 2026-07-21

- PR #3をSquash Mergeし、v1.1 Data Quality & Operationsの初期成果をProductionへ反映。
- Merge Commit `b9e1d2279fe4fc43e3d91106864f385381ec329b` を確認。
- GitHub Actions CI、GitHub Pages deployment、Cloudflare Workers Buildsの成功を確認。
- 本番URL `/`、`/news`、`/genre/coding`、404応答を確認。
- `noindex`と`X-Robots-Tag: noindex, nofollow`の維持を確認。
- `tools.json`主要24件に公式メタ情報、確認日、データ品質区分、更新履歴を追加。
- 未確認22件を`draft` / `sample`として主要画面から隔離。
- 相関図もverifiedツールのみ表示するよう整理。
- `news.json`を公式一次情報18件へ置換し、会社、カテゴリ、公開日、確認日、データ品質、CANAE影響メモ、更新履歴を追加。
- ニュース一覧で公式情報とCANAE側の影響評価を分離表示。
- データ品質バッジとスコア未検証表示を追加。

## v1.0.1相当 - 2026-07-21

- PR #2をSquash Mergeし、スマホUI改善をProductionへ反映。
- Cloudflare Production Version `21523a1e` を確認。
- 360 / 375 / 390 / 430pxで横スクロールなしを確認。
- スマホナビをハンバーガーメニュー化。
- ランキングをスマホ用カード表示へ切替。
- `noindex`と`X-Robots-Tag: noindex, nofollow`の維持を確認。
- 運用開始時の正本文書として、リリースノート、本番運用開始報告書、現行ステータス、v1.1ロードマップ、リリース一覧を追加。
- 既知課題として、v1.1以降へ送る意図的な未実装項目を整理。
- Phase 1 / v1.0.1相当を凍結版として扱うFreezeルールを追加。
- v1.1の初期作業として、実データ投入前のデータモデル確定文書を追加。
- v1.1.xのスキーマ互換性ルールを追加。

## v1.0 - 2026-07-20

- Phase 1正式リリース。
- PR #1をSquash Mergeし、Cloudflare Productionへ反映。
- AI Intelligence公開基盤、ガバナンス文書、Verifiedデータ管理、ランキング、相関図、ニュース管理、CI、404、セキュリティヘッダー、`noindex`を整備。

## 2026-07-21

- `docs/`正本構成を追加。
- 全文書の冒頭にDesign Principlesを固定。
- プロジェクト概要、システム仕様、Codex実装指示、運用ルール、データモデル、ブランド、評価基準をv1.0として整理。
- Cloudflare Workers Static Assets向けのBuild/Deploy設定を仕様へ反映。
