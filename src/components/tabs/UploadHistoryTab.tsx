'use client';

import React, { useState, useRef } from 'react';
import { SnapshotMeta, UploadPreviewData } from '@/lib/types';
import { formatDateID, formatNumberID } from '@/lib/date-utils';
import { Upload, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';

interface UploadHistoryTabProps {
  snapshots: SnapshotMeta[];
  pendingPreview: UploadPreviewData | null;
  onPreviewReceived: (preview: UploadPreviewData | null) => void;
  onSnapshotSaved: (date: string) => void;
  onSnapshotDeleted: (id: string) => void;
  showToast: (msg: string) => void;
}

export const UploadHistoryTab: React.FC<UploadHistoryTabProps> = ({
  snapshots,
  pendingPreview,
  onPreviewReceived,
  onSnapshotSaved,
  onSnapshotDeleted,
  showToast,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload to /api/upload/preview
  const handleFile = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/preview', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal membaca file');
      }

      onPreviewReceived(data.preview);
      showToast(`File terbaca: ${data.preview.outstandingRows} DCN outstanding`);
    } catch (err: any) {
      console.error('Upload error:', err);
      showToast(err.message || 'File tidak bisa dibaca');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!pendingPreview) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: pendingPreview.detectedDate,
          fileName: pendingPreview.file,
          rows: pendingPreview.rows,
          uploadedBy: 'User Upload',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal menyimpan snapshot');
      }

      showToast(`Snapshot ${formatDateID(pendingPreview.detectedDate)} berhasil disimpan`);
      onSnapshotSaved(pendingPreview.detectedDate);
    } catch (err: any) {
      console.error('Save error:', err);
      showToast(err.message || 'Gagal menyimpan snapshot');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSnapshot = async (s: SnapshotMeta) => {
    if (
      !confirm(
        `Yakin ingin menghapus snapshot tanggal ${formatDateID(s.date)} (${s.fileName || ''})?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/snapshots/${s.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal menghapus');
      }
      showToast(`Snapshot ${formatDateID(s.date)} berhasil dihapus`);
      onSnapshotDeleted(s.id);
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus snapshot');
    }
  };

  const renderDiffPill = (diff: number | null, diffPct: number | null) => {
    if (diff === null) return <span className="hint">-</span>;
    if (diff === 0) return <span className="pill flat">0</span>;
    const isGood = diff < 0;
    const cls = isGood ? 'good' : 'bad';
    const arrow = isGood ? '▼' : '▲';
    const pctStr = diffPct !== null ? ` (${Math.abs(diffPct * 100).toFixed(0)}%)` : '';
    return (
      <span className={`pill ${cls}`}>
        {arrow} {Math.abs(diff)}
        {pctStr}
      </span>
    );
  };

  // Reversed snapshots for history table (newest first)
  const reversedSnapshots = [...snapshots].reverse();

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
        }}
      />

      {/* Upload Drop Zone Panel */}
      <section className="panel">
        <div className="panel-h">
          <h2>Upload Data</h2>
          <span className="hint">
            Format file: Dealer DCN Detailed Cross Tab (.xlsx, .xls, .csv)
          </span>
        </div>

        <div className="panel-b">
          <div
            className={`drop ${isDragOver ? 'over' : ''}`}
            id="drop"
            tabIndex={0}
            role="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload
              size={32}
              style={{
                margin: '0 auto 8px',
                color: 'var(--accent)',
                display: 'block',
              }}
            />
            <b>
              {isUploading
                ? 'Sedang membaca dan menganalisis file...'
                : 'Tarik file Excel ke sini atau klik untuk memilih'}
            </b>
            <span className="hint">
              Sheet, baris header, dan tanggal snapshot dideteksi otomatis.
            </span>
          </div>

          <ul className="hint" style={{ margin: '14px 0 0', paddingLeft: '18px' }}>
            <li>
              Kolom wajib: <b>DCN</b> dan <b>Area_Name</b>. Kolom lain dipakai bila
              ada: <i>Branch_Name, Dealer Customer Name, Product Vertical, Created Date, Valid Trifecta DCN Contact</i>.
            </li>
            <li>
              Hanya baris dengan <b>Valid Trifecta DCN Contact = No</b> yang dihitung
              outstanding. DCN dobel digabung.
            </li>
          </ul>
        </div>
      </section>

      {/* Upload Preview Panel (if file parsed) */}
      {pendingPreview && (
        <section className="panel">
          <div className="panel-h">
            <h2>Pratinjau upload</h2>
            <span className="hint">
              {pendingPreview.file} · sheet &quot;{pendingPreview.sheet}&quot;
            </span>
          </div>

          <div
            className="panel-b"
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* KPI Summary */}
            <div className="kpis">
              <div className="kpi">
                <div className="l">Baris terbaca</div>
                <div className="v">{formatNumberID(pendingPreview.totalRows)}</div>
              </div>
              <div className="kpi">
                <div className="l">Outstanding</div>
                <div className="v">
                  {formatNumberID(pendingPreview.outstandingRows)}
                </div>
                <div className="s">
                  {formatNumberID(pendingPreview.validSkipped)} baris sudah valid
                  dan dilewati
                </div>
              </div>
              <div className="kpi">
                <div className="l">DCN dobel dibuang</div>
                <div className="v">{formatNumberID(pendingPreview.dupSkipped)}</div>
              </div>
              <div className="kpi">
                <div className="l">Tanpa Area</div>
                <div className="v">{formatNumberID(pendingPreview.noAreaCount)}</div>
              </div>
            </div>

            {/* Date selection & status */}
            <div className="row">
              <label className="fld">
                Tanggal snapshot
                <input
                  type="date"
                  id="up-date"
                  value={pendingPreview.detectedDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    const exists = snapshots.some((s) => s.date === newDate);
                    onPreviewReceived({
                      ...pendingPreview,
                      detectedDate: newDate,
                      dateIsAuto: false,
                      dateExists: exists,
                    });
                  }}
                />
              </label>
              <span className="hint" style={{ paddingBottom: '7px' }}>
                {pendingPreview.dateIsAuto
                  ? 'Terdeteksi otomatis dari nama file.'
                  : 'Pilih tanggal snapshot secara manual.'}
              </span>
            </div>

            {pendingPreview.dateExists && (
              <div className="notice">
                <AlertTriangle
                  size={14}
                  style={{ display: 'inline', marginRight: '6px' }}
                />
                Snapshot tanggal ini sudah ada. Menyimpan akan menimpa data yang
                sudah ada.
              </div>
            )}

            {/* Comparison Table */}
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th className="n">Upload ini</th>
                    <th className="n">Snapshot sebelumnya</th>
                    <th className="n">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPreview.areaComparison.map((comp) => (
                    <tr key={comp.area}>
                      <td>
                        {comp.area}
                        {comp.isUnrecognized && (
                          <span
                            className="pill flat"
                            style={{
                              marginLeft: '8px',
                              fontSize: '11px',
                              background: 'var(--warn-soft)',
                              color: 'var(--warn)',
                            }}
                          >
                            area tidak dikenal
                          </span>
                        )}
                      </td>
                      <td className="n">
                        <b>{formatNumberID(comp.currentCount)}</b>
                      </td>
                      <td className="n">
                        {comp.prevCount !== null
                          ? formatNumberID(comp.prevCount)
                          : '-'}
                      </td>
                      <td className="n">
                        {renderDiffPill(comp.diff, comp.diffPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Buttons */}
            <div className="row">
              <button
                className="btn primary"
                id="up-save"
                onClick={handleSaveSnapshot}
                disabled={isSaving}
              >
                <CheckCircle size={14} />
                {isSaving ? 'Menyimpan...' : 'Simpan snapshot'}
              </button>
              <button
                className="btn"
                id="up-cancel"
                onClick={() => onPreviewReceived(null)}
                disabled={isSaving}
              >
                Batal
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Snapshot History Panel */}
      <section className="panel">
        <div className="panel-h">
          <h2>Riwayat snapshot</h2>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th className="n">DCN outstanding</th>
                <th>Jenis data</th>
                <th>Sumber</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reversedSnapshots.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{formatDateID(s.date)}</b>
                  </td>
                  <td className="n">
                    <b>{formatNumberID(s.totalDcn)}</b>
                  </td>
                  <td>
                    {s.type === 'RINCI'
                      ? 'Rinci (per DCN)'
                      : 'Ringkasan per Area'}
                  </td>
                  <td>{s.fileName || '-'}</td>
                  <td className="n">
                    <button
                      className="btn sm"
                      onClick={() => handleDeleteSnapshot(s)}
                      title="Hapus snapshot ini"
                    >
                      <Trash2 size={12} /> Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {reversedSnapshots.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="hint"
                    style={{ textAlign: 'center', padding: '24px' }}
                  >
                    Belum ada snapshot yang tersimpan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
