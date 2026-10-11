import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SnapshotMeta } from '@/lib/types';

export async function GET() {
  try {
    const snapshots = await db.snapshot.findMany({
      orderBy: { date: 'asc' },
      include: {
        _count: {
          select: {
            dcnRecords: true,
          },
        },
        areaCounts: true,
      },
    });

    const result: SnapshotMeta[] = snapshots.map((s) => {
      let totalDcn = 0;
      if (s.type === 'RINCI') {
        totalDcn = s._count.dcnRecords;
      } else {
        totalDcn = s.areaCounts.reduce((acc, ac) => acc + ac.count, 0);
      }

      return {
        id: s.id,
        date: s.date,
        fileName: s.fileName,
        type: s.type as 'RINCI' | 'RINGKASAN',
        uploadedAt: s.uploadedAt.toISOString(),
        uploadedBy: s.uploadedBy,
        totalDcn,
      };
    });

    return NextResponse.json({ success: true, snapshots: result });
  } catch (error: any) {
    console.error('Error fetching snapshots:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat snapshot' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, fileName, rows, uploadedBy } = body;

    if (!date || !Array.isArray(rows)) {
      return NextResponse.json(
        { success: false, error: 'Data upload tidak lengkap' },
        { status: 400 }
      );
    }

    // Check if snapshot with this date already exists
    const existing = await db.snapshot.findUnique({
      where: { date },
    });

    if (existing) {
      // Cascade delete existing snapshot so it gets replaced
      await db.snapshot.delete({
        where: { id: existing.id },
      });
    }

    // Create new detailed snapshot
    const snapshot = await db.snapshot.create({
      data: {
        date,
        fileName: fileName || 'Uploaded File',
        type: 'RINCI',
        uploadedBy: uploadedBy || 'User Upload',
      },
    });

    // Bulk insert DCN records
    const areaCountsMap: Record<string, number> = {};
    const dcnRecords = rows.map((r: any) => {
      const area = r.area || 'Tanpa Area';
      const branch = r.branch || 'Tanpa Cabang';
      areaCountsMap[area] = (areaCountsMap[area] || 0) + 1;

      return {
        snapshotId: snapshot.id,
        dcn: String(r.dcn).trim(),
        dealerName: String(r.dealerName || '').trim(),
        area,
        branch,
        productVertical: String(r.productVertical || '').trim(),
        createdDate: r.createdDate ? String(r.createdDate).trim() : null,
        accountNo: String(r.accountNo || '').trim(),
        contactCount: Number(r.contactCount) || 0,
        contactInfo: String(r.contactInfo || '').trim(),
      };
    });

    // Chunk insert to avoid SQLite parameter limit (max 999 or 32766 parameters)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < dcnRecords.length; i += CHUNK_SIZE) {
      const chunk = dcnRecords.slice(i, i + CHUNK_SIZE);
      await db.dcnRecord.createMany({
        data: chunk,
      });
    }

    // Also populate AreaCount
    const areaCountsToCreate = Object.entries(areaCountsMap).map(([area, count]) => ({
      snapshotId: snapshot.id,
      area,
      count,
    }));
    await db.areaCount.createMany({
      data: areaCountsToCreate,
    });

    return NextResponse.json({
      success: true,
      snapshotId: snapshot.id,
      date,
      count: dcnRecords.length,
    });
  } catch (error: any) {
    console.error('Error saving snapshot:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menyimpan snapshot' },
      { status: 500 }
    );
  }
}
