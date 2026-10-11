import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseExcelBuffer } from '@/lib/excel-parser';
import { OFFICIAL_AREAS, NO_AREA, NO_BRANCH } from '@/lib/constants';
import { UploadPreviewData } from '@/lib/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File tidak ditemukan' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseExcelBuffer(buffer, file.name);

    // Lengkapi Area, Branch, dan Kontak dari data master
    const accNos = Array.from(new Set(parsed.rows.map((r) => r.accountNo).filter(Boolean)));
    const soldMap = new Map<string, { areaName: string; branchName: string }>();
    const contactMap = new Map<string, Array<{ name: string; email: string; phone: string }>>();

    const BATCH = 5000;
    for (let i = 0; i < accNos.length; i += BATCH) {
      const part = accNos.slice(i, i + BATCH);
      const [soldTos, contacts] = await Promise.all([
        db.soldTo.findMany({ where: { accountNo: { in: part } } }),
        db.contact.findMany({ where: { soldTo: { in: part } } }),
      ]);
      for (const s of soldTos) {
        soldMap.set(s.accountNo, { areaName: s.areaName, branchName: s.branchName });
      }
      for (const c of contacts) {
        const list = contactMap.get(c.soldTo) ?? [];
        list.push({ name: c.name, email: c.email, phone: c.phone });
        contactMap.set(c.soldTo, list);
      }
    }

    for (const r of parsed.rows) {
      const s = soldMap.get(r.accountNo);
      if (s) {
        if (!r.area || r.area === NO_AREA) r.area = s.areaName || NO_AREA;
        if (!r.branch || r.branch === NO_BRANCH) r.branch = s.branchName || NO_BRANCH;
      }
      const list = contactMap.get(r.accountNo) ?? [];
      r.contactCount = list.length;
      const best = list.find((c) => c.email || c.phone) ?? list[0];
      r.contactInfo = best
        ? [best.name, best.email || best.phone].filter(Boolean).join(' · ')
        : '';
    }
    parsed.noAreaCount = parsed.rows.filter((r) => r.area === NO_AREA).length;

    // Check if snapshot with detected date already exists
    const existing = await db.snapshot.findUnique({
      where: { date: parsed.date },
    });

    // Find the latest snapshot strictly before this date to compare
    const prevSnapshot = await db.snapshot.findFirst({
      where: { date: { lt: parsed.date } },
      orderBy: { date: 'desc' },
      include: {
        areaCounts: true,
        dcnRecords: true,
      },
    });

    const prevAreaCounts: Record<string, number> = {};
    if (prevSnapshot) {
      if (prevSnapshot.areaCounts && prevSnapshot.areaCounts.length > 0) {
        prevSnapshot.areaCounts.forEach((ac) => {
          prevAreaCounts[ac.area] = ac.count;
        });
      } else if (prevSnapshot.dcnRecords) {
        prevSnapshot.dcnRecords.forEach((r) => {
          prevAreaCounts[r.area] = (prevAreaCounts[r.area] || 0) + 1;
        });
      }
    }

    // Current area counts
    const currentAreaCounts: Record<string, number> = {};
    parsed.rows.forEach((r) => {
      const a = r.area || NO_AREA;
      currentAreaCounts[a] = (currentAreaCounts[a] || 0) + 1;
    });

    // Merge all area names
    const allAreasSet = new Set<string>([
      ...Object.keys(currentAreaCounts),
      ...Object.keys(prevAreaCounts),
    ]);

    const areaComparison = Array.from(allAreasSet)
      .map((area) => {
        const currentCount = currentAreaCounts[area] || 0;
        const prevCount = prevSnapshot ? prevAreaCounts[area] ?? 0 : null;
        const diff = prevCount !== null ? currentCount - prevCount : null;
        const diffPct =
          prevCount !== null && prevCount > 0 ? (currentCount - prevCount) / prevCount : null;

        const isUnrecognized =
          area !== NO_AREA &&
          !OFFICIAL_AREAS.includes(area as any);

        return {
          area,
          isUnrecognized,
          currentCount,
          prevCount,
          diff,
          diffPct,
        };
      })
      .sort((a, b) => b.currentCount - a.currentCount || a.area.localeCompare(b.area));

    const previewData: UploadPreviewData = {
      file: parsed.fileName,
      sheet: parsed.sheetName,
      totalRows: parsed.totalRead,
      outstandingRows: parsed.outstandingCount,
      validSkipped: parsed.validSkipped,
      dupSkipped: parsed.duplicatesSkipped,
      noAreaCount: parsed.noAreaCount,
      detectedDate: parsed.date,
      dateIsAuto: parsed.dateIsAuto,
      dateExists: !!existing,
      areaComparison,
      rows: parsed.rows,
    };

    return NextResponse.json({ success: true, preview: previewData });
  } catch (error: any) {
    console.error('Error previewing upload:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memproses file Excel' },
      { status: 500 }
    );
  }
}
