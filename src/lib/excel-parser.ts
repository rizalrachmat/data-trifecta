import * as XLSX from 'xlsx';
import { OFFICIAL_AREAS, NO_AREA, NO_BRANCH } from './constants';
import { toISODate } from './date-utils';
import { UploadPreviewData } from './types';

// Normalize header text for fuzzy matching
export const normalizeKey = (s: unknown): string =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const normAcc = (v: unknown): string =>
  String(v ?? '').trim().replace(/^0+/, '');

export interface ParsedExcelResult {
  fileName: string;
  sheetName: string;
  totalRead: number;
  outstandingCount: number;
  validSkipped: number;
  duplicatesSkipped: number;
  noAreaCount: number;
  date: string;
  dateIsAuto: boolean;
  rows: Array<{
    dcn: string;
    accountNo: string;
    dealerName: string;
    area: string;
    branch: string;
    productVertical: string;
    createdDate: string;
    contactCount?: number;
    contactInfo?: string;
  }>;
}



export function parseExcelBuffer(buffer: Buffer | ArrayBuffer, fileName: string): ParsedExcelResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!aoa || aoa.length === 0) continue;

    // Search header within first 15 rows
    const maxSearch = Math.min(15, aoa.length);
    for (let h = 0; h < maxSearch; h++) {
      const headerRow = aoa[h];
      if (!Array.isArray(headerRow)) continue;
      const heads = headerRow.map(normalizeKey);

      const iD = heads.indexOf('dcn');
      const iA = heads.indexOf('areaname') >= 0 ? heads.indexOf('areaname') : heads.indexOf('area');

      // Both DCN and Area_Name are required
      if (iD < 0) continue;

      const iB = heads.indexOf('branchname') >= 0 ? heads.indexOf('branchname') : heads.indexOf('branch');
      const iName = heads.indexOf('dealercustomername') >= 0
        ? heads.indexOf('dealercustomername')
        : (heads.indexOf('dealername') >= 0 ? heads.indexOf('dealername') : heads.indexOf('contactname'));
      const iV = heads.indexOf('productvertical') >= 0 ? heads.indexOf('productvertical') : heads.indexOf('vertical');
      const iDate = heads.indexOf('createddate') >= 0 ? heads.indexOf('createddate') : heads.indexOf('created');
      const iValid = heads.indexOf('validtrifectadcncontact') >= 0
        ? heads.indexOf('validtrifectadcncontact')
        : heads.indexOf('validtrifecta');

      const seenDcns = new Set<string>();
      const rows: ParsedExcelResult['rows'] = [];
      let totalRead = 0;
      let validSkipped = 0;
      let duplicatesSkipped = 0;
      let noAreaCount = 0;

      for (let r = h + 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row) continue;
        const dcn = String(row[iD] ?? '').trim();
        if (!dcn) continue;

        totalRead++;

        if (iValid >= 0) {
          const validVal = String(row[iValid] ?? '').trim().toLowerCase();
          if (validVal !== 'no') {
            validSkipped++;
            continue;
          }
        }

        if (seenDcns.has(dcn)) {
          duplicatesSkipped++;
          continue;
        }
        seenDcns.add(dcn);

        let area = iA >= 0 ? String(row[iA] ?? '').trim() : '';
        if (!area) {
          area = NO_AREA;
          noAreaCount++;
        }

        let branch = iB >= 0 ? String(row[iB] ?? '').trim() : '';
        if (!branch) {
          branch = NO_BRANCH;
        }

        const dealerName = iName >= 0 ? String(row[iName] ?? '').trim() : '';
        const productVertical = iV >= 0 ? String(row[iV] ?? '').trim() : '';
        const createdDate = iDate >= 0 ? toISODate(row[iDate]) : '';

        rows.push({
          dcn,
          dealerName,
          area,
          branch,
          productVertical,
          createdDate,
          accountNo: normAcc(dcn.split('|')[1] ?? ''),
        });
      }

      // Detect snapshot date from file name (ddmmyyyy)
      let date = '';
      let dateIsAuto = false;
      const baseName = fileName.replace(/\.[^.]+$/, '');
      const dateMatch = baseName.match(/(\d{2})(\d{2})(\d{4})\D*$/);
      if (dateMatch) {
        const day = dateMatch[1];
        const month = dateMatch[2];
        const year = dateMatch[3];
        const iso = `${year}-${month}-${day}`;
        const parsed = new Date(iso + 'T00:00:00Z');
        if (!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso && parseInt(year, 10) > 2000) {
          date = iso;
          dateIsAuto = true;
        }
      }

      if (!date) {
        date = new Date().toISOString().slice(0, 10);
      }

      return {
        fileName,
        sheetName,
        totalRead,
        outstandingCount: rows.length,
        validSkipped,
        duplicatesSkipped,
        noAreaCount,
        date,
        dateIsAuto,
        rows,
      };
    }
  }

  throw new Error('Kolom DCN tidak ditemukan. Untuk file Sold To atau Data Contact,gunakan bagian "Data Master".');
}
