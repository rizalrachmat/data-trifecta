import { MONTH_NAMES_ID, MONTH_NAMES_FULL_ID } from './constants';

export function formatDateID(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const monthIdx = parseInt(m, 10) - 1;
  const monthName = MONTH_NAMES_FULL_ID[monthIdx] || m;
  return `${parseInt(d, 10)} ${monthName} ${y}`;
}

export function formatShortDateID(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const monthIdx = parseInt(m, 10) - 1;
  const monthName = MONTH_NAMES_ID[monthIdx] || m;
  return `${d}-${monthName}-${y.slice(2)}`;
}

export function formatNumberID(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return Number(num).toLocaleString('id-ID');
}

// Convert Excel date or date string to ISO YYYY-MM-DD
export function toISODate(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    // Excel serial date to JS Date
    const utcDays = Math.round(val - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';
    // Check if format like "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Check if format like "DD-MMM-YY" or "DD-MMM-YYYY"
    const m = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
    if (m) {
      const day = m[1].padStart(2, '0');
      const monStr = m[2].toLowerCase();
      let year = m[3];
      if (year.length === 2) {
        year = '20' + year;
      } else if (year.length === 3) {
        // typo like "262" -> "2026"
        year = '20' + year.slice(0, 2);
      }
      const monthsMap: Record<string, string> = {
        jan: '01',
        feb: '02',
        mar: '03',
        apr: '04',
        may: '05',
        mei: '05',
        jun: '06',
        jul: '07',
        aug: '08',
        agu: '08',
        sep: '09',
        oct: '10',
        okt: '10',
        nov: '11',
        dec: '12',
        des: '12',
      };
      const monthNum = monthsMap[monStr];
      if (monthNum) {
        return `${year}-${monthNum}-${day}`;
      }
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }
  }
  return '';
}

export function getIsoWeekStart(dateStr: string): string {
  const t = new Date(dateStr + 'T00:00:00Z');
  const day = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - day);
  return t.toISOString().slice(0, 10);
}

export function getPeriodKey(dateStr: string, level: 'harian' | 'mingguan' | 'bulanan' | 'tahunan'): string {
  if (level === 'harian') return dateStr;
  if (level === 'mingguan') return getIsoWeekStart(dateStr);
  if (level === 'bulanan') return dateStr.slice(0, 7);
  return dateStr.slice(0, 4);
}

export function getPeriodLabel(key: string, level: 'harian' | 'mingguan' | 'bulanan' | 'tahunan'): string {
  if (level === 'harian') return formatShortDateID(key);
  if (level === 'mingguan') {
    const [y, m, d] = key.split('-');
    const mIdx = parseInt(m, 10) - 1;
    return `Mgg ${parseInt(d, 10)} ${MONTH_NAMES_ID[mIdx] || m}`;
  }
  if (level === 'bulanan') {
    const [y, m] = key.split('-');
    const mIdx = parseInt(m, 10) - 1;
    return `${MONTH_NAMES_ID[mIdx] || m} ${y}`;
  }
  return key;
}
