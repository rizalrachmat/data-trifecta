import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { NO_AREA } from '@/lib/constants';
import { OutstandingResponse } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    // Find the snapshot
    let snapshot;
    if (dateParam) {
      snapshot = await db.snapshot.findFirst({
        where: { date: dateParam, type: 'RINCI' },
        include: {
          dcnRecords: true,
          _count: { select: { dcnRecords: true } },
        },
      });
    }

    if (!snapshot) {
      // Find latest detailed snapshot
      snapshot = await db.snapshot.findFirst({
        where: { type: 'RINCI' },
        orderBy: { date: 'desc' },
        include: {
          dcnRecords: true,
          _count: { select: { dcnRecords: true } },
        },
      });
    }

    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'Belum ada snapshot rinci yang tersedia' },
        { status: 404 }
      );
    }

    // Find previous snapshot
    const prevSnapshot = await db.snapshot.findFirst({
      where: { date: { lt: snapshot.date } },
      orderBy: { date: 'desc' },
      include: {
        _count: { select: { dcnRecords: true } },
        areaCounts: true,
      },
    });

    let prevTotal: number | null = null;
    if (prevSnapshot) {
      if (prevSnapshot.type === 'RINCI') {
        prevTotal = prevSnapshot._count.dcnRecords;
      } else {
        prevTotal = prevSnapshot.areaCounts.reduce((acc, ac) => acc + ac.count, 0);
      }
    }

    const snapDateObj = new Date(snapshot.date + 'T00:00:00Z');
    let totalAgeDays = 0;
    let recordsWithAge = 0;
    let noAreaCount = 0;
    let noContactCount = 0;
    const areaCounts: Record<string, number> = {};

    const records = snapshot.dcnRecords.map((r) => {
      let ageDays: number | undefined = undefined;
      if (r.createdDate) {
        const cDate = new Date(r.createdDate + 'T00:00:00Z');
        if (!isNaN(cDate.getTime())) {
          ageDays = Math.max(0, Math.round((snapDateObj.getTime() - cDate.getTime()) / 86400000));
          totalAgeDays += ageDays;
          recordsWithAge++;
        }
      }

      if (r.area === NO_AREA) {
        noAreaCount++;
      }

      if (!r.contactCount) {
        noContactCount++;
      }

      areaCounts[r.area] = (areaCounts[r.area] || 0) + 1;

      return {
        id: r.id,
        dcn: r.dcn,
        dealerName: r.dealerName,
        area: r.area,
        branch: r.branch,
        productVertical: r.productVertical,
        createdDate: r.createdDate,
        ageDays,
        accountNo: r.accountNo,
        contactCount: r.contactCount,
        contactInfo: r.contactInfo,
      };
    });

    // Top area
    const sortedAreas = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]);
    const topArea = sortedAreas.length > 0 ? { name: sortedAreas[0][0], count: sortedAreas[0][1] } : null;

    const avgAgeDays = recordsWithAge > 0 ? Math.round(totalAgeDays / recordsWithAge) : 0;
    const totalOutstanding = records.length;
    const diff = prevTotal !== null ? totalOutstanding - prevTotal : null;

    const responseData: OutstandingResponse = {
      snapshot: {
        id: snapshot.id,
        date: snapshot.date,
        fileName: snapshot.fileName,
        type: 'RINCI',
        uploadedAt: snapshot.uploadedAt.toISOString(),
        uploadedBy: snapshot.uploadedBy,
        totalDcn: totalOutstanding,
      },
      prevSnapshot: prevSnapshot
        ? {
            id: prevSnapshot.id,
            date: prevSnapshot.date,
            fileName: prevSnapshot.fileName,
            type: prevSnapshot.type as 'RINCI' | 'RINGKASAN',
            uploadedAt: prevSnapshot.uploadedAt.toISOString(),
            uploadedBy: prevSnapshot.uploadedBy,
            totalDcn: prevTotal || 0,
          }
        : null,
      totalOutstanding,
      prevOutstanding: prevTotal,
      diff,
      topArea,
      avgAgeDays,
      noAreaCount,
      noContactCount,
      records,
    };

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: any) {
    console.error('Error fetching outstanding data:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat status outstanding' },
      { status: 500 }
    );
  }
}
