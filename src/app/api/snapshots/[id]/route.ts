import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID tidak valid' }, { status: 400 });
    }

    const snapshot = await db.snapshot.findUnique({
      where: { id },
    });

    if (!snapshot) {
      return NextResponse.json({ success: false, error: 'Snapshot tidak ditemukan' }, { status: 404 });
    }

    // Cascade delete snapshot
    await db.snapshot.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Snapshot berhasil dihapus' });
  } catch (error: any) {
    console.error('Error deleting snapshot:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menghapus snapshot' },
      { status: 500 }
    );
  }
}
