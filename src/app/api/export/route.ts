import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exportPivotWorkbook, exportCombinedWorkbook } from '@/lib/excel-export';
import { PivotResponse, ProgressResponse } from '@/lib/types';
import { getPeriodKey, getPeriodLabel } from '@/lib/date-utils';

async function computePivot(records: any[], rowDim: string, colDim: string): Promise<PivotResponse> {
  const getDimValue = (r: any, dim: string): string => {
    if (dim === 'area') return r.area || 'Tanpa Area';
    if (dim === 'branch') return r.branch || 'Tanpa Cabang';
    if (dim === 'vertical') return r.productVertical || '(kosong)';
    if (dim === 'year') {
      return r.createdDate && r.createdDate.length >= 4
        ? r.createdDate.slice(0, 4)
        : '(kosong)';
    }
    return 'none';
  };

  const cells: Record<string, number> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;

  for (const r of records) {
    const rKey = getDimValue(r, rowDim);
    const cKey = colDim === 'none' ? 'none' : getDimValue(r, colDim);
    const cellKey = `${rKey}\t${cKey}`;

    cells[cellKey] = (cells[cellKey] || 0) + 1;
    rowTotals[rKey] = (rowTotals[rKey] || 0) + 1;
    if (colDim !== 'none') {
      colTotals[cKey] = (colTotals[cKey] || 0) + 1;
    }
    grandTotal++;
  }

  const rowKeys = Object.keys(rowTotals).sort(
    (a, b) => rowTotals[b] - rowTotals[a] || a.localeCompare(b)
  );

  let colKeys: string[] = [];
  if (colDim !== 'none') {
    colKeys = Object.keys(colTotals);
    if (colDim === 'year') {
      colKeys.sort((a, b) => {
        if (a === '(kosong)') return 1;
        if (b === '(kosong)') return -1;
        return b.localeCompare(a);
      });
    } else {
      colKeys.sort((a, b) => colTotals[b] - colTotals[a] || a.localeCompare(b));
    }
  }

  return {
    rowDim: rowDim as any,
    colDim: colDim as any,
    rowKeys,
    colKeys,
    cells,
    rowTotals,
    colTotals,
    grandTotal,
  };
}

async function computeProgress(allSnapshots: any[], level: 'harian' | 'mingguan' | 'bulanan' | 'tahunan'): Promise<ProgressResponse> {
  const periodMap = new Map<
    string,
    {
      key: string;
      date: string;
      counts: Record<string, number>;
    }
  >();

  for (const snap of allSnapshots) {
    const pKey = getPeriodKey(snap.date, level);
    const counts: Record<string, number> = {};

    if (snap.areaCounts && snap.areaCounts.length > 0) {
      snap.areaCounts.forEach((ac: any) => {
        counts[ac.area] = ac.count;
      });
    }

    periodMap.set(pKey, {
      key: pKey,
      date: snap.date,
      counts,
    });
  }

  const periods = Array.from(periodMap.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((p) => ({
      key: p.key,
      date: p.date,
      label: getPeriodLabel(p.key, level),
      counts: p.counts,
    }));

  const allNamesSet = new Set<string>();
  periods.forEach((p) => {
    Object.keys(p.counts).forEach((name) => allNamesSet.add(name));
  });

  const labels = periods.map((p) => p.label);

  const rows = Array.from(allNamesSet).map((name) => {
    const vals = periods.map((p) => p.counts[name] || 0);
    let diff = null;
    if (vals.length >= 2) {
      const prev = vals[vals.length - 2];
      const curr = vals[vals.length - 1];
      diff = {
        abs: curr - prev,
        pct: prev > 0 ? (curr - prev) / prev : null,
      };
    }
    return { name, vals, diff };
  });

  rows.sort((a, b) => {
    const lastA = a.vals[a.vals.length - 1] ?? 0;
    const lastB = b.vals[b.vals.length - 1] ?? 0;
    return lastB - lastA || a.name.localeCompare(b.name);
  });

  const totals = periods.map((_, i) =>
    rows.reduce((sum, r) => sum + (r.vals[i] || 0), 0)
  );

  let totalDiff = null;
  if (totals.length >= 2) {
    const prev = totals[totals.length - 2];
    const curr = totals[totals.length - 1];
    totalDiff = {
      abs: curr - prev,
      pct: prev > 0 ? (curr - prev) / prev : null,
    };
  }

  return {
    level,
    dimension: 'area',
    periods,
    labels,
    rows,
    totals,
    totalDiff,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'pivot'; // 'pivot' | 'all'
    const dateParam = searchParams.get('date');

    // Find snapshot
    let snapshot;
    if (dateParam) {
      snapshot = await db.snapshot.findFirst({
        where: { date: dateParam, type: 'RINCI' },
        include: { dcnRecords: true },
      });
    }

    if (!snapshot) {
      snapshot = await db.snapshot.findFirst({
        where: { type: 'RINCI' },
        orderBy: { date: 'desc' },
        include: { dcnRecords: true },
      });
    }

    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'Snapshot tidak ditemukan' },
        { status: 404 }
      );
    }

    if (mode === 'pivot') {
      const rowDim = searchParams.get('row') || 'area';
      const colDim = searchParams.get('col') || 'year';
      const pivotData = await computePivot(snapshot.dcnRecords, rowDim, colDim);

      const dimLabels: Record<string, string> = {
        area: 'Area',
        branch: 'Cabang',
        vertical: 'Product Vertical',
        year: 'Tahun Created Date',
      };
      const rowLabel = dimLabels[rowDim] || 'Area';

      const buffer = exportPivotWorkbook(pivotData, rowLabel);

      return new Response(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Trifecta_Pivot_${snapshot.date}.xlsx"`,
        },
      });
    } else {
      // mode === 'all'
      const allSnapshots = await db.snapshot.findMany({
        orderBy: { date: 'asc' },
        include: { areaCounts: true },
      });

      const pivotAreaBranch = await computePivot(snapshot.dcnRecords, 'area', 'branch');
      const pivotAreaYear = await computePivot(snapshot.dcnRecords, 'area', 'year');

      const dailyProg = await computeProgress(allSnapshots, 'harian');
      const weeklyProg = await computeProgress(allSnapshots, 'mingguan');
      const monthlyProg = await computeProgress(allSnapshots, 'bulanan');
      const yearlyProg = await computeProgress(allSnapshots, 'tahunan');

      const buffer = exportCombinedWorkbook({
        date: snapshot.date,
        dataRows: snapshot.dcnRecords,
        pivotAreaBranch,
        pivotAreaYear,
        dailyProg,
        weeklyProg,
        monthlyProg,
        yearlyProg,
      });

      return new Response(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Trifecta_Gabungan_${snapshot.date}.xlsx"`,
        },
      });
    }
  } catch (error: any) {
    console.error('Error generating Excel export:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal membuat file export' },
      { status: 500 }
    );
  }
}
