'use client';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const acc = (v: unknown) => String(v ?? '').trim().replace(/^0+/, '');
const str = (v: unknown) => String(v ?? '').trim();
const CHUNK = 2000;

async function readRows(file: File): Promise<any[][]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][];
}

function toSoldTo(aoa: any[][]) {
  const h = aoa[0].map(norm);
  const iA = h.indexOf('accountno');
  const iB = h.indexOf('branchname');
  const iR = h.indexOf('areaname');
  if (iA < 0) throw new Error('Kolom Account_No tidak ditemukan. Ini bukan file Sold To.');
  return aoa
    .slice(1)
    .filter((r) => acc(r[iA]))
    .map((r) => ({ accountNo: acc(r[iA]), branchName: str(r[iB]), areaName: str(r[iR]) }));
}

function toContacts(aoa: any[][]) {
  const h = aoa[0].map(norm);
  const g = (n: string) => h.indexOf(n);
  const iS = g('soldto');
  const iId = g('contactpersonid');
  if (iS < 0 || iId < 0) {
    throw new Error('Kolom SOLD TO / CONTACT PERSON ID tidak ditemukan. Ini bukan file Data Contact.');
  }
  return aoa
    .slice(1)
    .filter((r) => acc(r[iS]) && str(r[iId]))
    .map((r) => {
      const email = str(r[g('email')]);
      return {
        contactPersonId: str(r[iId]),
        soldTo: acc(r[iS]),
        name: [str(r[g('firstname')]), str(r[g('lastname')])].filter(Boolean).join(' '),
        email: /^[^@\s-][^@\s]*@[^@\s]+\.[^@\s]+$/.test(email) ? email : '',
        phone: str(r[g('mobile')]) || str(r[g('officephone')]),
        jobFunction: str(r[g('function')]),
      };
    });
}

export default function MasterDataUpload() {
  const [counts, setCounts] = useState<{ soldTo: number; contact: number } | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const loadCounts = () =>
    fetch('/api/master')
      .then((r) => r.json())
      .then((j) => j.success && setCounts(j))
      .catch(() => {});
  useEffect(() => {
    loadCounts();
  }, []);

  async function handle(kind: 'soldto' | 'contact', file: File | undefined) {
    if (!file) return;
    const set = (t: string) => setMsg((m) => ({ ...m, [kind]: t }));
    try {
      set('Membaca file...');
      const aoa = await readRows(file);
      const rows: any[] = kind === 'soldto' ? toSoldTo(aoa) : toContacts(aoa);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const res = await fetch('/api/master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, reset: i === 0, rows: rows.slice(i, i + CHUNK) }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error || 'Gagal menyimpan');
        set(
          `Menyimpan ${Math.min(i + CHUNK, rows.length).toLocaleString('id-ID')} / ${rows.length.toLocaleString('id-ID')} baris...`
        );
      }
      set(`Selesai: ${rows.length.toLocaleString('id-ID')} baris tersimpan.`);
      loadCounts();
    } catch (e: any) {
      set('Gagal: ' + (e.message || e));
    }
  }

  const box = (kind: 'soldto' | 'contact', title: string, count?: number) => (
    <section className="panel">
      <div className="panel-h">
        <h2>{title}</h2>
        <span className="hint">
          Tersimpan: {count !== undefined ? count.toLocaleString('id-ID') : '-'} baris. Upload baru
          menggantikan data lama.
        </span>
      </div>
      <div className="panel-b">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handle(kind, e.target.files?.[0])}
        />
        {msg[kind] && <div className="hint" style={{ marginTop: 8 }}>{msg[kind]}</div>}
      </div>
    </section>
  );

  return (
    <>
      {box('soldto', 'Data Master: Sold To (Account_No, Branch_Name, Area_Name)', counts?.soldTo)}
      {box('contact', 'Data Master: Data Contact (SOLD TO, nama, email, HP)', counts?.contact)}
    </>
  );
}
