import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import { toISODate } from '../src/lib/date-utils';
import { NO_AREA, NO_BRANCH } from '../src/lib/constants';
import { normalizeKey } from '../src/lib/excel-parser';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Seed Process ---');

  // Clear existing data
  await prisma.areaCount.deleteMany({});
  await prisma.dcnRecord.deleteMany({});
  await prisma.snapshot.deleteMany({});

  const samplePath = path.resolve(__dirname, '..', '..', 'referensi', '1.Dealer DCN Detailed Cross Tab 01102026.xlsx');
  console.log('Loading Excel from:', samplePath);
  const wb = XLSX.readFile(samplePath);

  // 1. Process "Daily Progress" for Summary Snapshots
  const sDP = wb.Sheets['Daily Progress'];
  if (sDP) {
    const dpData: any[][] = XLSX.utils.sheet_to_json(sDP, { header: 1 });
    // Header is row 1 (0-indexed)
    const headerRow = dpData[1];
    if (headerRow && headerRow.length > 1) {
      const dates: string[] = [];
      for (let c = 1; c < 18; c++) {
        const rawDate = headerRow[c];
        if (rawDate) {
          const iso = toISODate(String(rawDate));
          if (iso) dates.push(iso);
        }
      }

      console.log(`Found ${dates.length} dates in Daily Progress:`, dates);

      // Areas are rows 2 to 9
      const areaData: Record<string, number[]> = {};
      for (let r = 2; r <= 9; r++) {
        const row = dpData[r];
        if (row && row[0]) {
          const areaName = String(row[0]).trim();
          const counts: number[] = [];
          for (let c = 1; c <= dates.length; c++) {
            counts.push(Number(row[c]) || 0);
          }
          areaData[areaName] = counts;
        }
      }

      // Insert Summary Snapshots for dates EXCEPT the last one (2026-10-01)
      // Because 2026-10-01 will be inserted as DETAILED snapshot
      for (let i = 0; i < dates.length - 1; i++) {
        const dateIso = dates[i];
        const snapshot = await prisma.snapshot.create({
          data: {
            date: dateIso,
            fileName: 'Sheet "Daily Progress"',
            type: 'RINGKASAN',
            uploadedBy: 'System Seed',
          },
        });

        const areaCountsToCreate = Object.entries(areaData).map(([area, counts]) => ({
          snapshotId: snapshot.id,
          area,
          count: counts[i] || 0,
        }));

        await prisma.areaCount.createMany({
          data: areaCountsToCreate,
        });

        console.log(`Created SUMMARY snapshot: ${dateIso}`);
      }
    }
  }

  // 2. Process sheet "01102026" for Detailed Snapshot (2026-10-01)
  const s1 = wb.Sheets['01102026'];
  if (s1) {
    const aoa: any[][] = XLSX.utils.sheet_to_json(s1, { header: 1 });
    const heads = aoa[0].map(normalizeKey);
    const iD = heads.indexOf('dcn');
    const iA = heads.indexOf('areaname') >= 0 ? heads.indexOf('areaname') : heads.indexOf('area');
    const iB = heads.indexOf('branchname') >= 0 ? heads.indexOf('branchname') : heads.indexOf('branch');
    const iName = heads.indexOf('dealercustomername') >= 0 ? heads.indexOf('dealercustomername') : heads.indexOf('dealername');
    const iV = heads.indexOf('productvertical') >= 0 ? heads.indexOf('productvertical') : heads.indexOf('vertical');
    const iDate = heads.indexOf('createddate') >= 0 ? heads.indexOf('createddate') : heads.indexOf('created');
    const iValid = heads.indexOf('validtrifectadcncontact') >= 0 ? heads.indexOf('validtrifectadcncontact') : heads.indexOf('validtrifecta');

    const detailedSnapshot = await prisma.snapshot.create({
      data: {
        date: '2026-10-01',
        fileName: 'Dealer_DCN_Detailed_Cross_Tab_01102026.xlsx',
        type: 'RINCI',
        uploadedBy: 'System Seed',
      },
    });

    const dcnRecords = [];
    const areaCountsMap: Record<string, number> = {};
    const seen = new Set<string>();

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const dcn = String(row[iD] ?? '').trim();
      if (!dcn) continue;

      if (iValid >= 0) {
        const validVal = String(row[iValid] ?? '').trim().toLowerCase();
        if (validVal !== 'no') continue;
      }

      if (seen.has(dcn)) continue;
      seen.add(dcn);

      let area = String(row[iA] ?? '').trim();
      if (!area) area = NO_AREA;
      let branch = iB >= 0 ? String(row[iB] ?? '').trim() : '';
      if (!branch) branch = NO_BRANCH;

      const dealerName = iName >= 0 ? String(row[iName] ?? '').trim() : '';
      const productVertical = iV >= 0 ? String(row[iV] ?? '').trim() : '';
      const createdDate = iDate >= 0 ? toISODate(row[iDate]) : '';

      dcnRecords.push({
        snapshotId: detailedSnapshot.id,
        dcn,
        dealerName,
        area,
        branch,
        productVertical,
        createdDate: createdDate || null,
      });

      areaCountsMap[area] = (areaCountsMap[area] || 0) + 1;
    }

    await prisma.dcnRecord.createMany({
      data: dcnRecords,
    });

    // Also populate AreaCount for the detailed snapshot to allow fast summary queries
    await prisma.areaCount.createMany({
      data: Object.entries(areaCountsMap).map(([area, count]) => ({
        snapshotId: detailedSnapshot.id,
        area,
        count,
      })),
    });

    console.log(`Created DETAILED snapshot 2026-10-01 with ${dcnRecords.length} records:`, areaCountsMap);
  }

  console.log('--- Seed Finished Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
