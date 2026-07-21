export type GenreId =
  | "model"
  | "coding"
  | "image"
  | "video"
  | "audio"
  | "agent";

export type DataStatus = "draft" | "verified" | "archived";
export type DataQuality = "sample" | "partial" | "verified";

export interface DataChange {
  date: string;
  type: "created" | "updated" | "verified" | "archived";
  summary: string;
  actor?: string;
}

export interface BenchmarkMetadata {
  name: string;
  score?: number;
  rank?: number | null;
  source: string;
  sourceUrl: string;
  checkedAt: string;
  version?: string;
  scope?: string;
  notes?: string;
}

export type BenchmarkSourceType = "official" | "third-party" | "legacy";
export type ScoreUnit = "percent" | "score" | "rank" | "points";

export interface BenchmarkRecord {
  id: string;
  toolId: string;
  benchmarkName: string;
  benchmarkVersion: string;
  score?: number | null;
  scoreUnit?: ScoreUnit;
  rank?: number | null;
  scope: string;
  sourceUrl: string;
  sourceType: BenchmarkSourceType;
  verifiedAt: string;
  comparability: string;
  dataStatus: DataStatus;
  dataQuality?: DataQuality;
  notes?: string;
  changeLog: DataChange[];
}

export interface BenchmarkSummary {
  source: "benchmarks" | "tools-fallback" | "unset";
  benchmarkName: string;
  score?: number | null;
  scoreUnit?: ScoreUnit;
  rank?: number | null;
  sourceUrl?: string;
  sourceType?: BenchmarkSourceType;
  checkedAt?: string;
  comparability?: string;
  notes?: string;
}

export type CanaeReviewStatus = "draft" | "review" | "approved" | "archived";

export interface CanaeEvaluationRecord {
  id: string;
  toolId: string;
  evaluationVersion: string;
  overallGrade: "S" | "A" | "B" | "C";
  scores: {
    quality: number;
    speed: number;
    usability: number;
    costEfficiency: number;
    businessFit: number;
  };
  useCase: string;
  evidence: string;
  evaluatedAt: string;
  evaluatedBy: string;
  reviewStatus: CanaeReviewStatus;
  notes?: string;
  changeLog: DataChange[];
}

export interface CanaeEvaluationSummary {
  source: "canae-evaluations" | "tools-fallback" | "unset";
  overallGrade: "S" | "A" | "B" | "C";
  evaluatedAt?: string;
  evaluatedBy?: string;
  reviewStatus?: CanaeReviewStatus;
  useCase?: string;
  evidence?: string;
  notes?: string;
}

export interface Genre {
  id: GenreId;
  label: string;
  description: string;
}

export interface Tool {
  id: string;
  name: string;
  company: string;
  category: GenreId;
  description: string;
  scores: {
    performance: number; // 公開ベンチマーク基準 0-100
    japanese: number; // 自社検証 0-100
    usability: number; // 自社評価 0-100
    speed: number; // 公開値・体感 0-100
    automation: number; // API・MCP・外部連携 0-100
    overall: number; // 自社用途を基準
  };
  benchmarkRank: number | null; // 公開ベンチマーク順位（同カテゴリ内）
  benchmarkSource?: string; // 公開ベンチマークまたはサンプル値の出典
  benchmarkCheckedAt?: string; // YYYY-MM-DD
  benchmarkDetails?: BenchmarkMetadata[];
  internalGrade: "S" | "A" | "B" | "C"; // 自社実務評価
  price: string; // 例: "月額$20〜" / "無料枠あり"
  apiAvailable: boolean;
  commercialUse: "可" | "要確認" | "不可";
  lastUpdated: string; // ISO date
  officialUrl: string;
  tags: string[];
  dataStatus?: DataStatus;
  dataQuality?: DataQuality;
  sourceUrl?: string;
  pricingUrl?: string;
  apiUrl?: string;
  japaneseSupport?: "native" | "supported" | "limited" | "unknown";
  primaryUseCases?: string[];
  limitations?: string[];
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  changeLog?: DataChange[];
}

export type NewsStatus = DataStatus;

export interface NewsItem {
  id: string;
  title: string;
  company: string;
  category: GenreId;
  importance: "high" | "medium" | "low";
  publishedAt: string; // ISO date
  summary: string;
  impact: string;
  sourceType: "official" | "media" | "sns";
  sourceUrl: string;
  sourceCheckedAt: string;
  status: NewsStatus;
  dataQuality?: DataQuality;
  verifiedAt?: string;
  verifiedBy?: string;
  note?: string;
  changeLog?: DataChange[];
}

export interface CompanyNode {
  id: string;
  name: string;
  category: GenreId;
  children?: ModelNode[];
}

export interface ModelNode {
  id: string;
  name: string;
  children?: ProductNode[];
}

export interface ProductNode {
  id: string;
  name: string;
  toolId?: string; // data/tools.json の id と対応（詳細パネル表示用）
}
