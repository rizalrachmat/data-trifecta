import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PivotResponse } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const rowDim = (searchParams.get('row') || 'area') as
      | 'area'
      | 'branch'
      | 'vertical'
      | 'year';
    const colDim = (searchParams.get('col') || 'year') as
      | 'area'
      | 'branch'
      | 'vertical'
      | 'year'
      | 'none';

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
        { success: false, error: 'Snapshot rinci tidak ditemukan' },
        { status: 404 }
      );
    }

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

    for (const r of snapshot.dcnRecords) {
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

    // Sort row keys by total desc
    const rowKeys = Object.keys(rowTotals).sort(
      (a, b) => rowTotals[b] - rowTotals[a] || a.localeCompare(b)
    );

    // Sort col keys: if year, sort chronologically desc, else by total desc
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

    const responseData: PivotResponse = {
      rowDim,
      colDim,
      rowKeys,
      colKeys,
      cells,
      rowTotals,
      colTotals,
      grandTotal,
    };

    return NextResponse.json({ success: true, data: responseData, date: snapshot.date });
  } catch (error: any) {
    console.error('Error generating pivot:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menghitung pivot' },
      { status: 500 }
    );
  }
}
