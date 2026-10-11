'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { StatusOutstandingTab } from '@/components/tabs/StatusOutstandingTab';
import { ProgressTab } from '@/components/tabs/ProgressTab';
import { PivotResultTab } from '@/components/tabs/PivotResultTab';
import { UploadHistoryTab } from '@/components/tabs/UploadHistoryTab';
import { Toast } from '@/components/ui/Toast';
import {
  SnapshotMeta,
  OutstandingResponse,
  ProgressResponse,
  PivotResponse,
  UploadPreviewData,
} from '@/lib/types';

export default function Home() {
  const [activeTab, setActiveTab] = useState('outstanding');
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Tab 1 state
  const [outstandingData, setOutstandingData] =
    useState<OutstandingResponse | null>(null);
  const [loadingOutstanding, setLoadingOutstanding] = useState(false);

  // Tab 2 state
  const [progressData, setProgressData] = useState<ProgressResponse | null>(
    null
  );
  const [progressLevel, setProgressLevel] = useState<
    'harian' | 'mingguan' | 'bulanan' | 'tahunan'
  >('harian');
  const [progressDim, setProgressDim] = useState<'area' | 'branch'>('area');
  const [loadingProgress, setLoadingProgress] = useState(false);

  // Tab 3 state
  const [pivotData, setPivotData] = useState<PivotResponse | null>(null);
  const [pivotRow, setPivotRow] = useState<
    'area' | 'branch' | 'vertical' | 'year'
  >('area');
  const [pivotCol, setPivotCol] = useState<
    'area' | 'branch' | 'vertical' | 'year' | 'none'
  >('year');
  const [loadingPivot, setLoadingPivot] = useState(false);

  // Tab 4 state
  const [pendingPreview, setPendingPreview] =
    useState<UploadPreviewData | null>(null);

  // Export & Toast state
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  // 1. Fetch snapshots list
  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch('/api/snapshots');
      const data = await res.json();
      if (data.success && data.snapshots) {
        setSnapshots(data.snapshots);
        // Default selectedDate to the latest detailed snapshot
        const detailed = data.snapshots.filter(
          (s: SnapshotMeta) => s.type === 'RINCI'
        );
        if (detailed.length > 0) {
          const latestDetailed = detailed[detailed.length - 1];
          setSelectedDate((prev) => (prev ? prev : latestDetailed.date));
        }
      }
    } catch (err) {
      console.error('Error loading snapshots:', err);
      showToast('Gagal memuat daftar snapshot');
    }
  }, [showToast]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  // 2. Fetch Tab 1 data
  const fetchOutstanding = useCallback(
    async (date?: string) => {
      setLoadingOutstanding(true);
      try {
        const queryDate = date || selectedDate;
        const url = queryDate
          ? `/api/outstanding?date=${encodeURIComponent(queryDate)}`
          : '/api/outstanding';
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          setOutstandingData(data.data);
          if (data.data?.snapshot?.date) {
            setSelectedDate(data.data.snapshot.date);
          }
        }
      } catch (err) {
        console.error('Error loading outstanding data:', err);
      } finally {
        setLoadingOutstanding(false);
      }
    },
    [selectedDate]
  );

  useEffect(() => {
    if (activeTab === 'outstanding') {
      fetchOutstanding(selectedDate);
    }
  }, [activeTab, selectedDate, fetchOutstanding]);

  // 3. Fetch Tab 2 data
  const fetchProgress = useCallback(async () => {
    setLoadingProgress(true);
    try {
      const res = await fetch(
        `/api/progress?level=${progressLevel}&dimension=${progressDim}`
      );
      const data = await res.json();
      if (data.success) {
        setProgressData(data.data);
      }
    } catch (err) {
      console.error('Error loading progress data:', err);
    } finally {
      setLoadingProgress(false);
    }
  }, [progressLevel, progressDim]);

  useEffect(() => {
    if (activeTab === 'progress') {
      fetchProgress();
    }
  }, [activeTab, fetchProgress]);

  // 4. Fetch Tab 3 data
  const fetchPivot = useCallback(async () => {
    setLoadingPivot(true);
    try {
      const url = `/api/pivot?date=${encodeURIComponent(
        selectedDate
      )}&row=${pivotRow}&col=${pivotCol}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setPivotData(data.data);
      }
    } catch (err) {
      console.error('Error loading pivot data:', err);
    } finally {
      setLoadingPivot(false);
    }
  }, [selectedDate, pivotRow, pivotCol]);

  useEffect(() => {
    if (activeTab === 'pivot') {
      fetchPivot();
    }
  }, [activeTab, fetchPivot]);

  // Export Pivot
  const handleExportPivot = async () => {
    setIsExporting(true);
    showToast('Menyiapkan export Pivot...');
    try {
      const url = `/api/export?mode=pivot&date=${encodeURIComponent(
        selectedDate
      )}&row=${pivotRow}&col=${pivotCol}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal mendownload');

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Trifecta_Pivot_${selectedDate || 'Data'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast('Export Pivot berhasil');
    } catch (err) {
      showToast('Export Pivot gagal');
    } finally {
      setIsExporting(false);
    }
  };

  // Export Combined (All)
  const handleExportAll = async () => {
    setIsExporting(true);
    showToast('Menyiapkan export Gabungan...');
    try {
      const url = `/api/export?mode=all&date=${encodeURIComponent(
        selectedDate
      )}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal mendownload');

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Trifecta_Gabungan_${selectedDate || 'Data'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast('Export Gabungan berhasil');
    } catch (err) {
      showToast('Export Gabungan gagal');
    } finally {
      setIsExporting(false);
    }
  };

  const latestSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null;
    return snapshots[snapshots.length - 1];
  }, [snapshots]);

  return (
    <>
      <AppHeader
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        latestSnapshot={latestSnapshot}
        onOpenUpload={() => {
          setActiveTab('upload');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onExportPivot={handleExportPivot}
        onExportAll={handleExportAll}
        isExporting={isExporting}
      />

      <main id="app">
        {activeTab === 'outstanding' && (
          <StatusOutstandingTab
            data={outstandingData}
            snapshots={snapshots}
            selectedDate={selectedDate}
            onSelectDate={(dt) => {
              setSelectedDate(dt);
              fetchOutstanding(dt);
            }}
            isLoading={loadingOutstanding}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressTab
            data={progressData}
            level={progressLevel}
            dimension={progressDim}
            onLevelChange={setProgressLevel}
            onDimensionChange={setProgressDim}
            isLoading={loadingProgress}
          />
        )}

        {activeTab === 'pivot' && (
          <PivotResultTab
            data={pivotData}
            snapshots={snapshots}
            selectedDate={selectedDate}
            rowDim={pivotRow}
            colDim={pivotCol}
            onDateChange={(dt) => {
              setSelectedDate(dt);
            }}
            onRowDimChange={setPivotRow}
            onColDimChange={setPivotCol}
            isLoading={loadingPivot}
          />
        )}

        {activeTab === 'upload' && (
          <UploadHistoryTab
            snapshots={snapshots}
            pendingPreview={pendingPreview}
            onPreviewReceived={setPendingPreview}
            onSnapshotSaved={async (savedDate) => {
              setPendingPreview(null);
              setSelectedDate(savedDate);
              await fetchSnapshots();
              setActiveTab('outstanding');
            }}
            onSnapshotDeleted={async () => {
              await fetchSnapshots();
              fetchOutstanding();
            }}
            showToast={showToast}
          />
        )}
      </main>

      <Toast message={toastMessage} />
    </>
  );
}
