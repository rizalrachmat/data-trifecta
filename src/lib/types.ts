export interface SnapshotMeta {
  id: string;
  date: string;
  fileName: string | null;
  type: 'RINCI' | 'RINGKASAN';
  uploadedAt: string;
  uploadedBy: string | null;
  totalDcn: number;
}

export interface DcnItem {
  id: string;
  dcn: string;
  dealerName: string;
  area: string;
  branch: string;
  productVertical: string;
  createdDate: string | null;
  ageDays?: number;
  accountNo?: string;
  contactCount?: number;
  contactInfo?: string;
}

export interface OutstandingResponse {
  snapshot: SnapshotMeta;
  prevSnapshot: SnapshotMeta | null;
  totalOutstanding: number;
  prevOutstanding: number | null;
  diff: number | null;
  topArea: { name: string; count: number } | null;
  avgAgeDays: number;
  noAreaCount: number;
  records: DcnItem[];
  noContactCount?: number;
}

export interface ProgressPeriod {
  key: string;
  date: string;
  label: string;
  counts: Record<string, number>;
}

export interface ProgressRow {
  name: string;
  vals: number[];
  diff: {
    abs: number;
    pct: number | null;
  } | null;
}

export interface ProgressResponse {
  level: 'harian' | 'mingguan' | 'bulanan' | 'tahunan';
  dimension: 'area' | 'branch';
  periods: ProgressPeriod[];
  labels: string[];
  rows: ProgressRow[];
  totals: number[];
  totalDiff: {
    abs: number;
    pct: number | null;
  } | null;
  fewDataNotice?: string;
}

export interface PivotResponse {
  rowDim: 'area' | 'branch' | 'vertical' | 'year';
  colDim: 'area' | 'branch' | 'vertical' | 'year' | 'none';
  rowKeys: string[];
  colKeys: string[];
  cells: Record<string, number>; // key: `${rowKey}\t${colKey}`
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export interface UploadPreviewData {
  file: string;
  sheet: string;
  totalRows: number;
  outstandingRows: number;
  validSkipped: number;
  dupSkipped: number;
  noAreaCount: number;
  detectedDate: string;
  dateIsAuto: boolean;
  dateExists: boolean;
  areaComparison: Array<{
    area: string;
    isUnrecognized?: boolean;
    currentCount: number;
    prevCount: number | null;
    diff: number | null;
    diffPct: number | null;
  }>;
  rows: Array<{
    dcn: string;
    dealerName: string;
    area: string;
    branch: string;
    productVertical: string;
    createdDate: string;
    accountNo?: string;
    contactCount?: number;
    contactInfo?: string;
  }>;
}

