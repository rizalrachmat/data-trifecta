'use client';

import React, { useMemo } from 'react';
import { PivotResponse, SnapshotMeta } from '@/lib/types';
import { formatDateID, formatNumberID } from '@/lib/date-utils';

interface PivotResultTabProps {
  data: PivotResponse | null;
  snapshots: SnapshotMeta[];
  selectedDate: string;
  rowDim: 'area' | 'branch' | 'vertical' | 'year';
  colDim: 'area' | 'branch' | 'vertical' | 'year' | 'none';
  onDateChange: (date: string) => void;
  onRowDimChange: (dim: 'area' | 'branch' | 'vertical' | 'year') => void;
  onColDimChange: (dim: 'area' | 'branch' | 'vertical' | 'year' | 'none') => void;
  isLoading: boolean;
}

const DIM_LABELS: Record<string, string> = {
  area: 'Area',
  branch: 'Cabang',
  vertical: 'Product Vertical',
  year: 'Tahun Created Date',
  none: '(tanpa kolom)',
};

const PRESETS: Array<{
  label: string;
  row: 'area' | 'branch' | 'vertical' | 'year';
  col: 'area' | 'branch' | 'vertical' | 'year' | 'none';
}> = [
  { label: 'Area x Cabang', row: 'area', col: 'branch' },
  { label: 'Area x Tahun Created Date', row: 'area', col: 'year' },
  { label: 'Area x Product Vertical', row: 'area', col: 'vertical' },
  { label: 'Cabang x Tahun Created Date', row: 'branch', col: 'year' },
];

export const PivotResultTab: React.FC<PivotResultTabProps> = ({
  data,
  snapshots,
  selectedDate,
  rowDim,
  colDim,
  onDateChange,
  onRowDimChange,
  onColDimChange,
  isLoading,
}) => {
  const detailedSnapshots = useMemo(() => {
    return snapshots.filter((s) => s.type === 'RINCI');
  }, [snapshots]);

  const isNoCols = colDim === 'none';

  const applyPreset = (preset: typeof PRESETS[0]) => {
    onRowDimChange(preset.row);
    onColDimChange(preset.col);
  };

  if (isLoading && !data) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }} className="hint">
        Menghitung data pivot...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="notice">
        Tidak ada data snapshot rinci untuk pivot.
      </div>
    );
  }

  const { rowKeys, colKeys, cells, rowTotals, colTotals, grandTotal } = data;

  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Pivot Result</h2>
        <span className="hint">Nilai: jumlah DCN outstanding</span>
      </div>

      <div
        className="panel-b"
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        {/* Dropdowns Row */}
        <div className="row">
          <label className="fld">
            Snapshot
            <select
              id="p-snap"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
            >
              {detailedSnapshots.map((s) => (
                <option key={s.id} value={s.date}>
                  {formatDateID(s.date)}
                </option>
              ))}
            </select>
          </label>

          <label className="fld">
            Baris
            <select
              id="p-rows"
              value={rowDim}
              onChange={(e) =>
                onRowDimChange(
                  e.target.value as 'area' | 'branch' | 'vertical' | 'year'
                )
              }
            >
              <option value="area">Area</option>
              <option value="branch">Cabang</option>
              <option value="vertical">Product Vertical</option>
              <option value="year">Tahun Created Date</option>
            </select>
          </label>

          <label className="fld">
            Kolom
            <select
              id="p-cols"
              value={colDim}
              onChange={(e) =>
                onColDimChange(
                  e.target.value as
                    | 'area'
                    | 'branch'
                    | 'vertical'
                    | 'year'
                    | 'none'
                )
              }
            >
              <option value="none">(tanpa kolom)</option>
              <option value="area">Area</option>
              <option value="branch">Cabang</option>
              <option value="vertical">Product Vertical</option>
              <option value="year">Tahun Created Date</option>
            </select>
          </label>
        </div>

        {/* Quick Presets */}
        <div className="legend">
          {PRESETS.map((p) => {
            const isCurrent = rowDim === p.row && colDim === p.col;
            return (
              <button
                key={p.label}
                className="chip"
                data-preset={`${p.row}|${p.col}`}
                aria-pressed={isCurrent}
                onClick={() => applyPreset(p)}
                style={{
                  fontWeight: isCurrent ? 600 : 400,
                  borderColor: isCurrent ? 'var(--accent)' : 'var(--line)',
                }}
              >
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Pivot Table */}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{DIM_LABELS[rowDim]}</th>
                {isNoCols ? (
                  <th className="n">Jumlah DCN</th>
                ) : (
                  <>
                    {colKeys.map((c) => (
                      <th key={c} className="n">
                        {c}
                      </th>
                    ))}
                    <th className="n">Grand Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rowKeys.map((rk) => {
                return (
                  <tr key={rk}>
                    <td>{rk}</td>
                    {isNoCols ? (
                      <td className="n">
                        <b>{formatNumberID(rowTotals[rk] || 0)}</b>
                      </td>
                    ) : (
                      <>
                        {colKeys.map((ck) => {
                          const val = cells[`${rk}\t${ck}`] || 0;
                          const opacityPct = Math.min(34, val * 8);
                          const cellStyle =
                            val > 0
                              ? {
                                  background: `color-mix(in srgb, var(--accent) ${opacityPct}%, transparent)`,
                                }
                              : { color: 'var(--muted)' };
                          return (
                            <td key={ck} className="n" style={cellStyle}>
                              {val > 0 ? val : ''}
                            </td>
                          );
                        })}
                        <td className="n">
                          <b>{formatNumberID(rowTotals[rk] || 0)}</b>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}

              {/* Grand Total Row */}
              <tr className="tot">
                <td>Grand Total</td>
                {isNoCols ? (
                  <td className="n">{formatNumberID(grandTotal)}</td>
                ) : (
                  <>
                    {colKeys.map((ck) => (
                      <td key={ck} className="n">
                        {formatNumberID(colTotals[ck] || 0)}
                      </td>
                    ))}
                    <td className="n">{formatNumberID(grandTotal)}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
