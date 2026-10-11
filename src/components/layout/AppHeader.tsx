'use client';

import React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { formatDateID, formatNumberID } from '@/lib/date-utils';
import { SnapshotMeta } from '@/lib/types';
import { Sun, Moon, Upload, Download, FileSpreadsheet } from 'lucide-react';

interface AppHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  latestSnapshot: SnapshotMeta | null;
  onOpenUpload: () => void;
  onExportPivot: () => void;
  onExportAll: () => void;
  isExporting: boolean;
}

const TABS = [
  { id: 'outstanding', label: 'Status Outstanding' },
  { id: 'progress', label: 'Progres' },
  { id: 'pivot', label: 'Pivot Result' },
  { id: 'upload', label: 'Upload & Riwayat' },
];

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  onTabChange,
  latestSnapshot,
  onOpenUpload,
  onExportPivot,
  onExportAll,
  isExporting,
}) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <header className="bar">
      <div className="bar-in">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Image
            src="/logo.png"
            alt="Trakindo CAT"
            width={146}
            height={38}
            className="logo"
            priority
            style={{ height: '38px', width: 'auto', objectFit: 'contain' }}
          />
        </div>

        <div className="brand">
          <h1>Data Trifecta</h1>
          <span id="sub">
            {latestSnapshot
              ? `Snapshot terakhir ${formatDateID(latestSnapshot.date)} · ${formatNumberID(
                  latestSnapshot.totalDcn
                )} DCN outstanding`
              : 'Memuat data snapshot...'}
          </span>
        </div>

        <div className="actions">
          <button
            className="btn"
            id="b-theme"
            onClick={toggleTheme}
            title={isDark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
          >
            {mounted ? (
              isDark ? (
                <>
                  <Sun size={14} /> Terang
                </>
              ) : (
                <>
                  <Moon size={14} /> Gelap
                </>
              )
            ) : (
              'Tema'
            )}
          </button>

          <button className="btn" id="b-up" onClick={onOpenUpload}>
            <Upload size={14} /> Upload Data
          </button>

          <button
            className="btn"
            id="b-exp-pivot"
            onClick={onExportPivot}
            disabled={isExporting}
            title="Export tampilan pivot saat ini ke file Excel"
          >
            <FileSpreadsheet size={14} /> Export Pivot
          </button>

          <button
            className="btn primary"
            id="b-exp-all"
            onClick={onExportAll}
            disabled={isExporting}
            title="Export gabungan semua sheet data dan progres ke file Excel"
          >
            <Download size={14} /> Export Gabungan
          </button>
        </div>

        <nav className="tabs" role="tablist" id="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="tab"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
