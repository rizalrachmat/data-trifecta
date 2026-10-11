import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPeriodKey, getPeriodLabel } from '@/lib/date-utils';
import { ProgressResponse, ProgressPeriod, ProgressRow } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const level = (searchParams.get('level') || 'harian') as
      | 'harian'
      | 'mingguan'
      | 'bulanan'
      | 'tahunan';
    const dimension = (searchParams.get('dimension') || 'area') as
      | 'area'
      | 'branch';

    // Fetch snapshots
    const snapshots = await db.snapshot.findMany({
      orderBy: { date: 'asc' },
      include: {
        areaCounts: true,
        dcnRecords: dimension === 'branch' ? true : false,
      },
    });

    // If dimension is branch, filter to only RINCI snapshots
    const validSnaps =
      dimension === 'branch'
        ? snapshots.filter((s) => s.type === 'RINCI')
        : snapshots;

    let fewDataNotice: string | undefined = undefined;
    if (dimension === 'branch' && validSnaps.length < 2) {
      fewDataNotice = `Progres per cabang butuh minimal 2 snapshot yang diupload dengan data rinci. Saat ini baru ada ${validSnaps.length}. Upload file baru di tab Upload & Riwayat.`;
    }

    // Group snapshots by period key, taking the LAST snapshot in each period
    const periodMap = new Map<
      string,
      {
        key: string;
        date: string;
        counts: Record<string, number>;
      }
    >();

    for (const snap of validSnaps) {
      const pKey = getPeriodKey(snap.date, level);
      const counts: Record<string, number> = {};

      if (dimension === 'area') {
        if (snap.areaCounts && snap.areaCounts.length > 0) {
          snap.areaCounts.forEach((ac) => {
            counts[ac.area] = ac.count;
          });
        }
      } else {
        // dimension === 'branch'
        if (snap.dcnRecords) {
          snap.dcnRecords.forEach((r) => {
            const b = r.branch || 'Tanpa Cabang';
            counts[b] = (counts[b] || 0) + 1;
          });
        }
      }

      // By iterating date ascending, set will naturally overwrite with the latest snapshot of each period
      periodMap.set(pKey, {
        key: pKey,
        date: snap.date,
        counts,
      });
    }

    const periods: ProgressPeriod[] = Array.from(periodMap.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((p) => ({
        key: p.key,
        date: p.date,
        label: getPeriodLabel(p.key, level),
        counts: p.counts,
      }));

    if (periods.length < 2 && !fewDataNotice) {
      fewDataNotice = `Periode ini baru punya ${periods.length} titik data. Tambahkan snapshot baru agar tren terlihat.`;
    }

    // Collect all unique names (Area or Branch)
    const allNamesSet = new Set<string>();
    periods.forEach((p) => {
      Object.keys(p.counts).forEach((name) => allNamesSet.add(name));
    });

    const labels = periods.map((p) => p.label);

    const rows: ProgressRow[] = Array.from(allNamesSet).map((name) => {
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
      return {
        name,
        vals,
        diff,
      };
    });

    // Sort rows by latest value descending
    rows.sort((a, b) => {
      const lastA = a.vals[a.vals.length - 1] ?? 0;
      const lastB = b.vals[b.vals.length - 1] ?? 0;
      return lastB - lastA || a.name.localeCompare(b.name);
    });

    // Totals per period
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

    const responseData: ProgressResponse = {
      level,
      dimension,
      periods,
      labels,
      rows,
      totals,
      totalDiff,
      fewDataNotice,
    };

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: any) {
    console.error('Error fetching progress data:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat data progres' },
      { status: 500 }
    );
  }
}
