'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ProgressResponse } from '@/lib/types';
import { SERIES_COLORS } from '@/lib/constants';

interface ProgressTabProps {
  data: ProgressResponse | null;
  level: 'harian' | 'mingguan' | 'bulanan' | 'tahunan';
  dimension: 'area' | 'branch';
  onLevelChange: (level: 'harian' | 'mingguan' | 'bulanan' | 'tahunan') => void;
  onDimensionChange: (dim: 'area' | 'branch') => void;
  isLoading: boolean;
}

export const ProgressTab: React.FC<ProgressTabProps> = ({
  data,
  level,
  dimension,
  onLevelChange,
  onDimensionChange,
  isLoading,
}) => {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(700);

  // Measure chart container width on resize
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        setChartWidth(chartRef.current.clientWidth || 700);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // When data rows change, hide series with max <= 2 by default
  useEffect(() => {
    if (data?.rows) {
      const initHidden = new Set<string>();
      data.rows.forEach((r) => {
        const mx = Math.max(...r.vals);
        if (mx <= 2) {
          initHidden.add(r.name);
        }
      });
      setHiddenSeries(initHidden);
    }
  }, [data?.dimension]);

  const toggleSeries = (name: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const levels: Array<{ id: 'harian' | 'mingguan' | 'bulanan' | 'tahunan'; label: string }> = [
    { id: 'harian', label: 'Harian' },
    { id: 'mingguan', label: 'Mingguan' },
    { id: 'bulanan', label: 'Bulanan' },
    { id: 'tahunan', label: 'Tahunan' },
  ];

  const maxVal = useMemo(() => {
    if (!data?.rows || data.rows.length === 0) return 1;
    return Math.max(1, ...data.rows.flatMap((r) => r.vals));
  }, [data?.rows]);

  // Color mapping
  const colorsMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (data?.rows) {
      data.rows.forEach((r, i) => {
        map[r.name] = SERIES_COLORS[i % SERIES_COLORS.length];
      });
    }
    return map;
  }, [data?.rows]);

  const renderDiffPill = (
    diff: { abs: number; pct: number | null } | null
  ) => {
    if (!diff) return <span className="hint">-</span>;
    if (diff.abs === 0) return <span className="pill flat">0</span>;
    const isGood = diff.abs < 0; // Turun = bagus (outstanding berkurang)
    const cls = isGood ? 'good' : 'bad';
    const arrow = isGood ? '▼' : '▲';
    const pctStr =
      diff.pct !== null ? ` (${Math.abs(diff.pct * 100).toFixed(0)}%)` : '';
    return (
      <span className={`pill ${cls}`}>
        {arrow} {Math.abs(diff.abs)}
        {pctStr}
      </span>
    );
  };

  if (isLoading && !data) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }} className="hint">
        Memuat data progres...
      </div>
    );
  }

  if (!data) return null;

  const { periods, labels, rows, totals, totalDiff, fewDataNotice } = data;

  const visibleSeries = rows.filter((r) => !hiddenSeries.has(r.name));

  // Render SVG Line Chart
  const renderChart = () => {
    const W = Math.max(320, chartWidth);
    const H = W < 520 ? 240 : 300;
    const L = 38;
    const R = 14;
    const T = 16;
    const B = 34;

    let chartMax = Math.max(
      1,
      ...visibleSeries.flatMap((s) => s.vals)
    );
    const step =
      chartMax > 100 ? 50 : chartMax > 50 ? 20 : chartMax > 20 ? 10 : 5;
    chartMax = Math.ceil(chartMax / step) * step;

    const n = labels.length;
    const getX = (i: number) =>
      L + (n < 2 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
    const getY = (v: number) => T + (H - T - B) * (1 - v / chartMax);

    const gridLines = [];
    for (let v = 0; v <= chartMax; v += step) {
      gridLines.push(
        <g key={`grid-${v}`}>
          <line
            x1={L}
            x2={W - R}
            y1={getY(v)}
            y2={getY(v)}
            stroke="var(--line)"
          />
          <text
            x={L - 6}
            y={getY(v) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--muted)"
          >
            {v}
          </text>
        </g>
      );
    }

    const every = Math.ceil(n / (W < 520 ? 4 : 8));
    const labelElements = labels.map((l, i) => {
      const show =
        (i % every === 0 && (n - 1 - i >= every / 2 || i === 0)) ||
        i === n - 1;
      if (!show) return null;
      return (
        <text
          key={`lbl-${i}`}
          x={getX(i)}
          y={H - 12}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          fontSize="11"
          fill="var(--muted)"
        >
          {l}
        </text>
      );
    });

    const seriesPaths = visibleSeries.map((s) => {
      const color = colorsMap[s.name] || '#1D5FC4';
      const pts = s.vals
        .map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`)
        .join(' ');
      const lastIdx = n - 1;
      return (
        <g key={`s-${s.name}`}>
          <polyline
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {lastIdx >= 0 && (
            <circle
              cx={getX(lastIdx)}
              cy={getY(s.vals[lastIdx] ?? 0)}
              r="3.5"
              fill={color}
            />
          )}
        </g>
      );
    });

    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Grafik tren DCN outstanding per ${level}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {gridLines}
        {labelElements}
        {seriesPaths}
      </svg>
    );
  };

  const periodRangeStr =
    labels.length > 0
      ? `${labels[0]} sampai ${labels[labels.length - 1]}`
      : '';

  return (
    <>
      {/* Controls row */}
      <div className="row">
        <div className="fld">
          Periode
          <div className="seg" role="group">
            {levels.map((lv) => (
              <button
                key={lv.id}
                data-level={lv.id}
                aria-pressed={level === lv.id}
                onClick={() => onLevelChange(lv.id)}
              >
                {lv.label}
              </button>
            ))}
          </div>
        </div>

        <div className="fld">
          Dimensi
          <div className="seg" role="group">
            <button
              data-pdim="area"
              aria-pressed={dimension === 'area'}
              onClick={() => onDimensionChange('area')}
            >
              Per Area
            </button>
            <button
              data-pdim="branch"
              aria-pressed={dimension === 'branch'}
              onClick={() => onDimensionChange('branch')}
            >
              Per Cabang
            </button>
          </div>
        </div>

        <span className="hint" style={{ paddingBottom: '7px' }}>
          Mingguan, bulanan, dan tahunan memakai snapshot terakhir di tiap periode.
        </span>
      </div>

      {/* Notice if few data points or branches */}
      {fewDataNotice && <div className="notice">{fewDataNotice}</div>}

      {/* Trend Line Chart Panel */}
      <section className="panel">
        <div className="panel-h">
          <h2>Tren DCN outstanding</h2>
          <span className="hint">{periodRangeStr}</span>
        </div>
        <div className="panel-b">
          {/* Legend Chips with dot color */}
          <div className="legend" id="legend" style={{ marginBottom: '10px' }}>
            {rows.map((r) => {
              const isVisible = !hiddenSeries.has(r.name);
              const color = colorsMap[r.name] || '#1D5FC4';
              return (
                <button
                  key={r.name}
                  className="chip"
                  data-series={r.name}
                  aria-pressed={isVisible}
                  onClick={() => toggleSeries(r.name)}
                  title={isVisible ? 'Klik untuk sembunyikan' : 'Klik untuk tampilkan'}
                >
                  <i style={{ background: color }} />
                  {r.name}
                </button>
              );
            })}
          </div>

          <div className="chart" id="chart" ref={chartRef}>
            {renderChart()}
          </div>
        </div>
      </section>

      {/* Matrix Table Panel */}
      <section className="panel">
        <div className="panel-h">
          <h2>
            Matriks {dimension === 'area' ? 'Area' : 'Cabang'} x {level}
          </h2>
          <span className="hint">
            Selisih = periode terakhir dibanding sebelumnya. Hijau turun (bagus),
            merah naik.
          </span>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th className="stick">
                  {dimension === 'area' ? 'Area' : 'Cabang'}
                </th>
                {labels.map((l, i) => (
                  <th key={i} className="n">
                    {l}
                  </th>
                ))}
                <th className="n">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="stick">
                    <b>{r.name}</b>
                  </td>
                  {r.vals.map((v, i) => {
                    const opacityPct = Math.round((v / maxVal) * 34);
                    const bgStyle =
                      v > 0
                        ? {
                            background: `color-mix(in srgb, var(--accent) ${opacityPct}%, transparent)`,
                          }
                        : undefined;
                    return (
                      <td key={i} className="n" style={bgStyle}>
                        {v}
                      </td>
                    );
                  })}
                  <td className="n">{renderDiffPill(r.diff)}</td>
                </tr>
              ))}

              {/* Grand Total Row */}
              <tr className="tot">
                <td className="stick">Grand Total</td>
                {totals.map((v, i) => (
                  <td key={i} className="n">
                    {v}
                  </td>
                ))}
                <td className="n">{renderDiffPill(totalDiff)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
