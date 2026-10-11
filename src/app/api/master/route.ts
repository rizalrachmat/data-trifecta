import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;

const s = (v: unknown) => String(v ?? '').trim();

export async function GET() {
  const [soldTo, contact] = await Promise.all([db.soldTo.count(), db.contact.count()]);
  return NextResponse.json({ success: true, soldTo, contact });
}

export async function POST(req: NextRequest) {
  try {
    const { kind, reset, rows } = await req.json();
    if (!Array.isArray(rows)) {
      return NextResponse.json({ success: false, error: 'Data tidak valid' }, { status: 400 });
    }

    if (kind === 'soldto') {
      if (reset) await db.soldTo.deleteMany();
      const r = await db.soldTo.createMany({
        data: rows.map((x: any) => ({
          accountNo: s(x.accountNo),
          branchName: s(x.branchName),
          areaName: s(x.areaName),
        })),
        skipDuplicates: true,
      });
      return NextResponse.json({ success: true, inserted: r.count });
    }

    if (kind === 'contact') {
      if (reset) await db.contact.deleteMany();
      const r = await db.contact.createMany({
        data: rows.map((x: any) => ({
          contactPersonId: s(x.contactPersonId),
          soldTo: s(x.soldTo),
          name: s(x.name),
          email: s(x.email),
          phone: s(x.phone),
          jobFunction: s(x.jobFunction),
        })),
        skipDuplicates: true,
      });
      return NextResponse.json({ success: true, inserted: r.count });
    }

    return NextResponse.json({ success: false, error: 'Jenis data tidak dikenal' }, { status: 400 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e.message || 'Gagal menyimpan' }, { status: 500 });
  }
}
