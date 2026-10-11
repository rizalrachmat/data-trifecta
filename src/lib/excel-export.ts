import * as XLSX from 'xlsx';
import { PivotResponse, ProgressResponse } from './types';

export function createSheetFromAoa(aoa: any[][], customWidths?: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  if (customWidths) {
    ws['!cols'] = customWidths.map((w) => ({ wch: w }));
  } else if (aoa.length > 0) {
    const colCount = Math.max(...aoa.map((r) => (r ? r.length : 0)));
    const colWidths: number[] = [];
    for (let c = 0; c < colCount; c++) {
      let maxLen = 10;
      for (let r = 0; r < aoa.length; r++) {
        const val = aoa[r]?.[c];
        if (val !== undefined && val !== null) {
          const len = String(val).length;
          if (len > maxLen) maxLen = len;
        }
      }
      colWidths.push(Math.min(maxLen + 3, 50));
    }
    ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  }

  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

export function pivotToAoa(p: PivotResponse, rowLabel: string): any[][] {
  const isNoCols = p.colDim === 'none';
  const head = [
    rowLabel,
    ...(isNoCols ? ['Jumlah DCN'] : p.colKeys),
    ...(isNoCols ? [] : ['Grand Total']),
  ];

  const body = p.rowKeys.map((rk) => {
    const row: any[] = [rk];
    if (isNoCols) {
      row.push(p.cells[`${rk}\tnone`] ?? p.rowTotals[rk] ?? 0);
    } else {
      for (const ck of p.colKeys) {
        row.push(p.cells[`${rk}\t${ck}`] ?? 0);
      }
      row.push(p.rowTotals[rk] ?? 0);
    }
    return row;
  });

  const foot: any[] = ['Grand Total'];
  if (isNoCols) {
    foot.push(p.grandTotal);
  } else {
    for (const ck of p.colKeys) {
      foot.push(p.colTotals[ck] ?? 0);
    }
    foot.push(p.grandTotal);
  }

  return [head, ...body, foot];
}

export function progressToAoa(pr: ProgressResponse, dimLabel: string): any[][] {
  const head = [dimLabel, ...pr.labels, 'Selisih', '% Selisih'];

  const body = pr.rows.map((row) => {
    const diffStr = row.diff ? row.diff.abs : '';
    const pctStr =
      row.diff && row.diff.pct !== null
        ? `${(row.diff.pct * 100).toFixed(1)}%`
        : '';
    return [row.name, ...row.vals, diffStr, pctStr];
  });

  const totalDiffStr = pr.totalDiff ? pr.totalDiff.abs : '';
  const totalPctStr =
    pr.totalDiff && pr.totalDiff.pct !== null
      ? `${(pr.totalDiff.pct * 100).toFixed(1)}%`
      : '';
  const foot = ['Grand Total', ...pr.totals, totalDiffStr, totalPctStr];

  return [head, ...body, foot];
}

export function exportPivotWorkbook(
  p: PivotResponse,
  rowLabel: string
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const aoa = pivotToAoa(p, rowLabel);
  const ws = createSheetFromAoa(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Pivot');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function exportCombinedWorkbook(params: {
  date: string;
  dataRows: Array<{
    dcn: string;
    dealerName: string;
    area: string;
    branch: string;
    productVertical: string;
    createdDate: string | null;
  }>;
  pivotAreaBranch: PivotResponse;
  pivotAreaYear: PivotResponse;
  dailyProg: ProgressResponse;
  weeklyProg: ProgressResponse;
  monthlyProg: ProgressResponse;
  yearlyProg: ProgressResponse;
}): Uint8Array {
  const wb = XLSX.utils.book_new();

  // 1. Sheet Data
  const dataAoa = [
    [
      'DCN',
      'Dealer Customer Name',
      'Area',
      'Cabang',
      'Product Vertical',
      'Created Date',
    ],
    ...params.dataRows.map((r) => [
      r.dcn,
      r.dealerName,
      r.area,
      r.branch,
      r.productVertical,
      r.createdDate || '',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, createSheetFromAoa(dataAoa), 'Data');

  // 2. Sheet Pivot Area x Cabang
  const aoaAreaBranch = pivotToAoa(params.pivotAreaBranch, 'Area');
  XLSX.utils.book_append_sheet(
    wb,
    createSheetFromAoa(aoaAreaBranch),
    'Pivot Area x Cabang'
  );

  // 3. Sheet Pivot Area x Tahun
  const aoaAreaYear = pivotToAoa(params.pivotAreaYear, 'Area');
  XLSX.utils.book_append_sheet(
    wb,
    createSheetFromAoa(aoaAreaYear),
    'Pivot Area x Tahun'
  );

  // 4. Progress sheets
  XLSX.utils.book_append_sheet(
    wb,
    createSheetFromAoa(progressToAoa(params.dailyProg, 'Area')),
    'Daily Progress'
  );
  XLSX.utils.book_append_sheet(
    wb,
    createSheetFromAoa(progressToAoa(params.weeklyProg, 'Area')),
    'Weekly Progress'
  );
  XLSX.utils.book_append_sheet(
    wb,
    createSheetFromAoa(progressToAoa(params.monthlyProg, 'Area')),
    'Monthly Progress'
  );
  XLSX.utils.book_append_sheet(
    wb,
    createSheetFromAoa(progressToAoa(params.yearlyProg, 'Area')),
    'Yearly Progress'
  );

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
