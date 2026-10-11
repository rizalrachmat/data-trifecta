'use client';

import React, { useState, useMemo } from 'react';
import { OutstandingResponse, SnapshotMeta, DcnItem } from '@/lib/types';
import { formatDateID, formatShortDateID, formatNumberID } from '@/lib/date-utils';
import { NO_AREA, NO_BRANCH } from '@/lib/constants';
import { Search } from 'lucide-react';

interface StatusOutstandingTabProps {
  data: OutstandingResponse | null;
  snapshots: SnapshotMeta[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isLoading: boolean;
}

// Tabel daftar DCN (dipakai di tampilan Per Area dan Per Cabang)
const DcnSubTable: React.FC<{ records: DcnItem[] }> = ({ records }) => (
  <div className="tw">
    <table>
      <thead>
        <tr>
          <th>DCN</th>
          <th>Dealer Customer Name</th>
          <th>Created Date</th>
          <th className="n">Umur (hari)</th>
          <th>Kontak</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {records
          .slice()
          .sort((a, b) => (a.createdDate || '').localeCompare(b.createdDate || ''))
          .map((rec) => {
            const noContact = !rec.contactCount;
            const noArea = rec.area === NO_AREA;
            const extra = (rec.contactCount ?? 0) > 1 ? ` (+${(rec.contactCount ?? 1) - 1})` : '';
            return (
              <tr key={rec.id}>
                <td className="mono">{rec.dcn}</td>
                <td>{rec.dealerName}</td>
                <td>{rec.createdDate ? formatShortDateID(rec.createdDate) : '-'}</td>
                <td className="n">
                  {rec.ageDays !== undefined ? formatNumberID(rec.ageDays) : '-'}
                </td>
                <td>
                  {rec.contactInfo ? `${rec.contactInfo}${extra}` : '-'}
                </td>
                <td>
                  {noArea && (
                    <span className="pill bad" style={{ marginRight: 4 }}>
                      Area tidak ditemukan
                    </span>
                  )}
                  {noContact ? (
                    <span className="pill bad">Kontak belum ada</span>
                  ) : (
                    <span className="pill good">Ada kontak</span>
                  )}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  </div>
);

export const StatusOutstandingTab: React.FC<StatusOutstandingTabProps> = ({
  data,
  snapshots,
  selectedDate,
  onSelectDate,
  isLoading,
}) => {
  const [view, setView] = useState<'area' | 'cabang'>('area');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyNoContact, setOnlyNoContact] = useState(false);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  // Filter detailed snapshots for the dropdown
  const detailedSnapshots = useMemo(() => {
    return snapshots.filter((s) => s.type === 'RINCI');
  }, [snapshots]);

  const toggleKey = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const q = searchQuery.trim().toLowerCase();

  // Filter records based on search query and contact filter
  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    let list = data.records;
    if (onlyNoContact) list = list.filter((r) => !r.contactCount);
    if (!q) return list;
    return list.filter((r) =>
      [r.dcn, r.dealerName, r.area, r.branch, r.productVertical, r.contactInfo || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data?.records, q, onlyNoContact]);

  // Group records by Area and Branch
  const areaGroups = useMemo(() => {
    const map = new Map<
      string,
      { count: number; branches: Map<string, typeof filteredRecords> }
    >();

    filteredRecords.forEach((r) => {
      const a = r.area || NO_AREA;
      const b = r.branch || NO_BRANCH;

      if (!map.has(a)) {
        map.set(a, { count: 0, branches: new Map() });
      }
      const g = map.get(a)!;
      g.count++;

      if (!g.branches.has(b)) {
        g.branches.set(b, []);
      }
      g.branches.get(b)!.push(r);
    });

    return map;
  }, [filteredRecords]);

  // Max count for progress bar width
  const maxAreaCount = useMemo(() => {
    if (areaGroups.size === 0) return 1;
    return Math.max(1, ...Array.from(areaGroups.values()).map((g) => g.count));
  }, [areaGroups]);

  // Flat branches for 'cabang' view
  const flatBranches = useMemo(() => {
    const list: Array<{
      area: string;
      branch: string;
      records: typeof filteredRecords;
    }> = [];

    areaGroups.forEach((g, area) => {
      g.branches.forEach((records, branch) => {
        list.push({ area, branch, records });
      });
    });

    list.sort(
      (a, b) =>
        b.records.length - a.records.length || a.branch.localeCompare(b.branch)
    );
    return list;
  }, [areaGroups]);

  const maxBranchCount = useMemo(() => {
    if (flatBranches.length === 0) return 1;
    return Math.max(1, ...flatBranches.map((b) => b.records.length));
  }, [flatBranches]);

  if (isLoading && !data) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }} className="hint">
        Memuat data Status Outstanding...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="notice">
        Belum ada data snapshot rinci yang dapat ditampilkan. Silakan upload file
        Excel pada tab Upload & Riwayat.
      </div>
    );
  }

  const {
    snapshot,
    prevSnapshot,
    totalOutstanding,
    diff,
    topArea,
    avgAgeDays,
    noAreaCount,
    noContactCount,
  } = data;

  const totalFiltered = filteredRecords.length;
  const grandTotalAll = data.records.length;

  return (
    <>
      {/* Snapshot selector row */}
      <div className="row">
        <label className="fld">
          Snapshot
          <select
            id="f-snap"
            value={snapshot.date}
            onChange={(e) => onSelectDate(e.target.value)}
          >
            {detailedSnapshots.map((s) => (
              <option key={s.id} value={s.date}>
                {formatDateID(s.date)}
              </option>
            ))}
          </select>
        </label>
        <span className="hint" style={{ paddingBottom: '7px' }}>
          Sumber: {snapshot.fileName || '-'}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="kpis">
        <div className="kpi">
          <div className="l">Total outstanding</div>
          <div className="v">{formatNumberID(totalOutstanding)}</div>
          <div className="s">DCN dengan Valid Trifecta DCN Contact = No</div>
        </div>

        <div className="kpi">
          <div className="l">Perubahan vs snapshot sebelumnya</div>
          <div className="v">
            {diff === null
              ? '-'
              : (diff > 0 ? '+' : '') + formatNumberID(diff)}
          </div>
          <div className="s">
            {prevSnapshot
              ? `dari ${formatNumberID(prevSnapshot.totalDcn)} pada ${formatDateID(
                  prevSnapshot.date
                )}`
              : 'Belum ada pembanding'}
          </div>
        </div>

        <div className="kpi">
          <div className="l">Area terbanyak</div>
          <div className="v">{topArea ? topArea.name : '-'}</div>
          <div className="s">
            {topArea ? `${formatNumberID(topArea.count)} DCN` : ''}
          </div>
        </div>

        <div className="kpi">
          <div className="l">Umur rata-rata DCN</div>
          <div className="v">{formatNumberID(avgAgeDays)}</div>
          <div className="s">
            hari sejak Created Date ({(avgAgeDays / 365).toFixed(1)} tahun)
          </div>
        </div>

        <div className="kpi">
          <div className="l">Belum ada kontak</div>
          <div className="v">{formatNumberID(noContactCount ?? 0)}</div>
          <div className="s">
            dari {formatNumberID(grandTotalAll)} DCN tidak ada di Data Contact
          </div>
        </div>
      </div>

      {/* Warning Notice if any DCN has no area/branch */}
      {noAreaCount > 0 && (
        <div className="notice">
          <b>{noAreaCount} DCN belum punya Area dan Cabang</b> karena nomor
          akunnya tidak ditemukan di data Sold To, jadi dikelompokkan sebagai
          &quot;{NO_AREA}&quot;. Perbarui data Sold To di bagian Data Master,
          lalu upload ulang file Cross Tab.
        </div>
      )}

      {(noContactCount ?? 0) > 0 && (
        <div className="notice">
          <b>
            {formatNumberID(noContactCount ?? 0)} dari {formatNumberID(grandTotalAll)} DCN
            belum punya kontak
          </b>{' '}
          di Data Contact. Centang &quot;Hanya yang belum ada kontak&quot; untuk
          melihat daftarnya.
        </div>
      )}

      {/* Table Section */}
      <section className="panel">
        <div className="panel-h">
          <h2>Outstanding per {view === 'area' ? 'Area' : 'Cabang'}</h2>

          <div className="seg" role="group" aria-label="Tampilan">
            <button
              data-view="area"
              aria-pressed={view === 'area'}
              onClick={() => {
                setView('area');
                setOpenKeys(new Set());
              }}
            >
              Per Area
            </button>
            <button
              data-view="cabang"
              aria-pressed={view === 'cabang'}
              onClick={() => {
                setView('cabang');
                setOpenKeys(new Set());
              }}
            >
              Per Cabang
            </button>
          </div>

          <label
            className="fld"
            style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}
          >
            <Search size={14} style={{ color: 'var(--muted)' }} />
            <input
              id="f-q"
              type="search"
              placeholder="Cari DCN, dealer, area, cabang, kontak"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '240px', maxWidth: '100%' }}
            />
          </label>

          <label
            className="fld"
            style={{ flexDirection: 'row', alignItems: 'center', gap: '6px' }}
          >
            <input
              type="checkbox"
              checked={onlyNoContact}
              onChange={(e) => setOnlyNoContact(e.target.checked)}
            />
            Hanya yang belum ada kontak
          </label>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>
                  {view === 'area' ? 'Area' : 'Cabang'}{' '}
                  <span
                    className="hint"
                    style={{ textTransform: 'none', letterSpacing: 0 }}
                  >
                    (klik untuk buka)
                  </span>
                </th>
                <th className="n">DCN</th>
                <th className="n">Porsi</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {view === 'area' ? (
                // View per Area
                Array.from(areaGroups.entries())
                  .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
                  .map(([areaName, group]) => {
                    const areaKey = `a:${areaName}`;
                    const isAreaOpen = openKeys.has(areaKey);
                    const portion =
                      grandTotalAll > 0
                        ? ((group.count / grandTotalAll) * 100).toFixed(0)
                        : '0';
                    const barWidth = Math.max(
                      2,
                      (group.count / maxAreaCount) * 140
                    );

                    return (
                      <React.Fragment key={areaKey}>
                        {/* Area Row */}
                        <tr
                          className={`grp ${isAreaOpen ? 'open' : ''}`}
                          onClick={() => toggleKey(areaKey)}
                        >
                          <td>
                            <span className="caret">▸</span>
                            <b>{areaName}</b>
                          </td>
                          <td className="n">
                            <b>{group.count}</b>
                          </td>
                          <td className="n">{portion}%</td>
                          <td>
                            <span
                              className="share"
                              style={{ width: `${barWidth}px` }}
                            />
                          </td>
                        </tr>

                        {/* Branch rows under this area if open */}
                        {isAreaOpen &&
                          Array.from(group.branches.entries())
                            .sort(
                              (x, y) =>
                                y[1].length - x[1].length || x[0].localeCompare(y[0])
                            )
                            .map(([branchName, branchRecords]) => {
                              const branchKey = `b:${areaName}|${branchName}`;
                              const isBranchOpen = openKeys.has(branchKey);
                              const brPortion =
                                grandTotalAll > 0
                                  ? (
                                      (branchRecords.length / grandTotalAll) *
                                      100
                                    ).toFixed(0)
                                  : '0';
                              const brBarWidth = Math.max(
                                2,
                                (branchRecords.length / maxAreaCount) * 140
                              );

                              return (
                                <React.Fragment key={branchKey}>
                                  <tr
                                    className={`grp ${isBranchOpen ? 'open' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleKey(branchKey);
                                    }}
                                  >
                                    <td style={{ paddingLeft: '32px' }}>
                                      <span className="caret">▸</span>
                                      {branchName}
                                    </td>
                                    <td className="n">{branchRecords.length}</td>
                                    <td className="n">{brPortion}%</td>
                                    <td>
                                      <span
                                        className="share"
                                        style={{ width: `${brBarWidth}px` }}
                                      />
                                    </td>
                                  </tr>

                                  {/* DCN sub-table if branch is open */}
                                  {isBranchOpen && (
                                    <tr className="sub">
                                      <td colSpan={4} style={{ padding: 0 }}>
                                        <DcnSubTable records={branchRecords} />
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                      </React.Fragment>
                    );
                  })
              ) : (
                // View per Cabang
                flatBranches.map(({ area, branch, records: branchRecords }) => {
                  const branchKey = `b:${area}|${branch}`;
                  const isBranchOpen = openKeys.has(branchKey);
                  const portion =
                    grandTotalAll > 0
                      ? ((branchRecords.length / grandTotalAll) * 100).toFixed(0)
                      : '0';
                  const barWidth = Math.max(
                    2,
                    (branchRecords.length / maxBranchCount) * 140
                  );

                  return (
                    <React.Fragment key={branchKey}>
                      <tr
                        className={`grp ${isBranchOpen ? 'open' : ''}`}
                        onClick={() => toggleKey(branchKey)}
                      >
                        <td>
                          <span className="caret">▸</span>
                          {branch} <span className="hint">· {area}</span>
                        </td>
                        <td className="n">{branchRecords.length}</td>
                        <td className="n">{portion}%</td>
                        <td>
                          <span
                            className="share"
                            style={{ width: `${barWidth}px` }}
                          />
                        </td>
                      </tr>

                      {/* DCN sub-table if branch is open */}
                      {isBranchOpen && (
                        <tr className="sub">
                          <td colSpan={4} style={{ padding: 0 }}>
                            <DcnSubTable records={branchRecords} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}

              {totalFiltered === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="hint"
                    style={{ padding: '24px', textAlign: 'center' }}
                  >
                    Tidak ada DCN yang cocok dengan pencarian atau filter.
                  </td>
                </tr>
              )}

              {/* Grand Total row */}
              <tr className="tot">
                <td>Total {q || onlyNoContact ? '(hasil filter)' : ''}</td>
                <td className="n">{formatNumberID(totalFiltered)}</td>
                <td className="n">
                  {grandTotalAll > 0
                    ? `${((totalFiltered / grandTotalAll) * 100).toFixed(0)}%`
                    : '100%'}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
