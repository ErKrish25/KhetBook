import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LedgerGroup } from '../types';
import { buildLedgerTotals, getChildren as getChildrenFromMap } from './ledger';
import { registerGujaratiFonts, UNICODE_FONT } from './fonts/registerFonts';

// ============================================================================
// Types
// ============================================================================

interface FarmProfile {
  name: string;
  owner_name: string;
  address: string;
  phone: string;
}

interface VoucherRow {
  id: string;
  type: string;
  amount: number;
  date: string;
  notes?: string;
  ledger_group_id: string | null;
}

export type ReportScope = 'full' | 'expense' | 'income' | 'ledger';

interface ReportOptions {
  scope: ReportScope;
  dateRangeLabel: string;
  dateFrom: string;
  dateTo: string;
  farmProfile: FarmProfile;
  groups: LedgerGroup[];
  vouchers: VoucherRow[];
  filteredGroupId?: string;
}

// ============================================================================
// Tally-style monochrome palette
// ============================================================================

const BLACK: [number, number, number] = [0, 0, 0];
const DARK: [number, number, number] = [40, 40, 40];
const MID: [number, number, number] = [100, 100, 100];
const BORDER: [number, number, number] = [180, 180, 180];
const LIGHT_BORDER: [number, number, number] = [210, 210, 210];
const HEADER_BG: [number, number, number] = [240, 240, 240];
const WHITE: [number, number, number] = [255, 255, 255];

const M = 15; // margin

// The font family to use throughout the PDF.
// After registerGujaratiFonts(), this supports Latin + Gujarati + Devanagari glyphs.
const FONT = UNICODE_FONT;

// ============================================================================
// Helpers
// ============================================================================

function fmt(amount: number): string {
  const abs = Math.abs(amount);
  return abs.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtWhole(amount: number): string {
  return Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

// ============================================================================
// Main generator — Tally-style professional report
// Now async to support dynamic font loading for Gujarati/Unicode text
// ============================================================================

export async function generateReport(options: ReportOptions) {
  const {
    scope, dateRangeLabel, dateFrom, dateTo,
    farmProfile, groups, vouchers, filteredGroupId,
  } = options;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Register Unicode font (Noto Sans Gujarati) that handles Latin + Gujarati glyphs.
  // This is dynamically imported so the ~400KB font data only loads when generating PDFs.
  await registerGujaratiFonts(doc);

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const contentW = W - M * 2;

  let y = M;
  let currentPage = 1;

  // ——————————————————————————————————————————
  // PAGE FOOTER
  // ——————————————————————————————————————————
  const drawFooter = () => {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFontSize(7);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...MID);
    doc.text(`${farmProfile.name || 'Khetbook'}`, M, H - 9);
    doc.text(`Page ${currentPage}`, W - M, H - 9, { align: 'right' });
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > H - 20) {
      drawFooter();
      doc.addPage();
      currentPage++;
      y = M;
    }
  };

  // ——————————————————————————————————————————
  // COMPANY HEADER (Tally-style centered)
  // ——————————————————————————————————————————

  // Company name — large, bold, centered
  doc.setTextColor(...BLACK);
  doc.setFontSize(16);
  doc.setFont(FONT, 'bold');
  doc.text(farmProfile.name || 'Khetbook', W / 2, y + 6, { align: 'center' });
  y += 9;

  // Contact info — centered, smaller
  const infoParts: string[] = [];
  if (farmProfile.address) infoParts.push(farmProfile.address);
  if (farmProfile.phone) infoParts.push(`Ph: ${farmProfile.phone}`);
  if (farmProfile.owner_name) infoParts.push(`Prop: ${farmProfile.owner_name}`);

  if (infoParts.length > 0) {
    doc.setFontSize(8);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...MID);
    doc.text(infoParts.join('  |  '), W / 2, y + 2, { align: 'center' });
    y += 5;
  }

  // Separator
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  doc.line(M, y + 1, W - M, y + 1);
  y += 4;

  // Report title — centered
  const reportTitle =
    scope === 'full' ? 'Profit & Loss Account'
    : scope === 'expense' ? 'Expense Statement'
    : scope === 'income' ? 'Income Statement'
    : 'Ledger Statement';

  doc.setFontSize(11);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...BLACK);
  doc.text(reportTitle, W / 2, y + 4, { align: 'center' });
  y += 7;

  // Period
  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...MID);
  doc.text(`${fmtDate(dateFrom)} to ${fmtDate(dateTo)}  (${dateRangeLabel})`, W / 2, y + 2, { align: 'center' });
  y += 5;

  // Double line separator
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  doc.line(M, y + 0.8, W - M, y + 0.8);
  y += 4;

  // ——————————————————————————————————————————
  // BUILD DATA
  // ——————————————————————————————————————————
  const { childrenMap, totalsByGroupId } = buildLedgerTotals(groups, vouchers);
  const getChildren = (pid: string | null) => getChildrenFromMap(childrenMap, pid);
  const getTotal = (gid: string) => totalsByGroupId.get(gid) ?? 0;

  const totalIncome = groups
    .filter(g => g.type === 'income' && !g.parent_id)
    .reduce((s, g) => s + getTotal(g.id), 0);
  const totalExpense = groups
    .filter(g => g.type === 'expense' && !g.parent_id)
    .reduce((s, g) => s + getTotal(g.id), 0);
  const netProfit = totalIncome - totalExpense;

  // ——————————————————————————————————————————
  // SUMMARY (for non-ledger scope)
  // ——————————————————————————————————————————
  if (scope !== 'ledger') {
    ensureSpace(35);

    // Summary rows using manual drawing for Tally-like look
    const drawSummaryRow = (label: string, value: string, opts?: { bold?: boolean; topBorder?: boolean; doubleBorder?: boolean }) => {
      ensureSpace(8);

      if (opts?.topBorder) {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.2);
        doc.line(M, y, W - M, y);
        y += 1;
      }

      if (opts?.doubleBorder) {
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.3);
        doc.line(M, y, W - M, y);
        doc.line(M, y + 0.8, W - M, y + 0.8);
        y += 2;
      }

      doc.setFontSize(9);
      doc.setFont(FONT, opts?.bold ? 'bold' : 'normal');
      doc.setTextColor(...DARK);
      doc.text(label, M + 2, y + 4);
      doc.text(value, W - M - 2, y + 4, { align: 'right' });
      y += 7;
    };

    if (scope === 'full' || scope === 'income') {
      drawSummaryRow('Total Income', fmt(totalIncome));
    }
    if (scope === 'full' || scope === 'expense') {
      drawSummaryRow('Total Expense', fmt(totalExpense));
    }
    if (scope === 'full') {
      const label = netProfit >= 0 ? 'Net Profit' : 'Net Loss';
      drawSummaryRow(label, fmt(netProfit), { topBorder: true, bold: true });

      // Double underline after net profit (accounting style)
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.3);
      doc.line(M, y, W - M, y);
      doc.line(M, y + 0.8, W - M, y + 0.8);
      y += 4;
    }

    y += 4;
  }

  // ——————————————————————————————————————————
  // DETERMINE SECTIONS
  // ——————————————————————————————————————————
  type Section = { title: string; type: 'expense' | 'income'; ledgers: LedgerGroup[] };
  const sections: Section[] = [];

  if (scope === 'ledger' && filteredGroupId) {
    const g = groups.find(x => x.id === filteredGroupId);
    if (g) {
      sections.push({
        title: `${g.name} (${g.type === 'income' ? 'Income' : 'Expense'})`,
        type: g.type as 'expense' | 'income',
        ledgers: [g],
      });
    }
  } else {
    if (scope === 'full' || scope === 'expense') {
      sections.push({
        title: 'Expense Details',
        type: 'expense',
        ledgers: groups
          .filter(g => g.type === 'expense' && !g.parent_id)
          .sort((a, b) => getTotal(b.id) - getTotal(a.id)),
      });
    }
    if (scope === 'full' || scope === 'income') {
      sections.push({
        title: 'Income Details',
        type: 'income',
        ledgers: groups
          .filter(g => g.type === 'income' && !g.parent_id)
          .sort((a, b) => getTotal(b.id) - getTotal(a.id)),
      });
    }
  }

  // ——————————————————————————————————————————
  // RENDER SECTIONS (Tally-style table)
  // ——————————————————————————————————————————
  for (const section of sections) {
    ensureSpace(20);

    // Section title
    doc.setFontSize(10);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...BLACK);
    doc.text(section.title, M, y + 3);
    y += 6;

    // Build rows
    type RowMeta = { rowType: 'group' | 'sub' | 'total'; };
    const body: string[][] = [];
    const rowMeta: RowMeta[] = [];
    let sectionTotal = 0;

    for (const grp of section.ledgers) {
      const grpTotal = getTotal(grp.id);
      sectionTotal += grpTotal;
      const children = getChildren(grp.id);

      const grpEntryCount = vouchers.filter(v => {
        if (v.ledger_group_id === grp.id) return true;
        return children.some(c => c.id === v.ledger_group_id);
      }).length;

      // Group row
      body.push([grp.name, String(grpEntryCount), fmt(grpTotal)]);
      rowMeta.push({ rowType: 'group' });

      if (children.length > 0) {
        for (const child of children) {
          const cTotal = getTotal(child.id);
          const cCount = vouchers.filter(v => v.ledger_group_id === child.id).length;

          body.push([`    ${child.name}`, String(cCount), fmt(cTotal)]);
          rowMeta.push({ rowType: 'sub' });
        }

        const directCount = vouchers.filter(v => v.ledger_group_id === grp.id).length;
        if (directCount > 0) {
          const directTotal = vouchers
            .filter(v => v.ledger_group_id === grp.id)
            .reduce((s, v) => s + Number(v.amount), 0);
          body.push([`    (Direct)`, String(directCount), fmt(directTotal)]);
          rowMeta.push({ rowType: 'sub' });
        }
      }
    }

    // Total row
    const totalEntryCount = vouchers.filter(v => {
      return section.ledgers.some(l => {
        if (v.ledger_group_id === l.id) return true;
        return getChildren(l.id).some(c => c.id === v.ledger_group_id);
      });
    }).length;
    body.push([`Total`, String(totalEntryCount), fmt(sectionTotal)]);
    rowMeta.push({ rowType: 'total' });

    // Render table
    autoTable(doc, {
      startY: y,
      head: [['Particulars', 'Entries', 'Amount']],
      body,
      theme: 'plain',
      margin: { left: M, right: M },

      headStyles: {
        fillColor: HEADER_BG,
        textColor: BLACK,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        lineWidth: { bottom: 0.3, top: 0.3, left: 0, right: 0 } as any,
        lineColor: BLACK,
        font: FONT,
      },

      columnStyles: {
        0: { cellWidth: contentW - 55, halign: 'left' },
        1: { cellWidth: 18, halign: 'center', fontSize: 7, textColor: MID },
        2: { cellWidth: 37, halign: 'right' },
      },

      styles: {
        fontSize: 8,
        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        overflow: 'linebreak',
        lineWidth: 0,
        textColor: DARK,
        font: FONT,
      },

      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const meta = rowMeta[data.row.index];
        if (!meta) return;

        if (meta.rowType === 'group') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 8.5;
          data.cell.styles.textColor = BLACK;
          // Bottom border under group
          data.cell.styles.lineWidth = { bottom: 0.15, top: 0, left: 0, right: 0 } as any;
          data.cell.styles.lineColor = LIGHT_BORDER;
        }

        if (meta.rowType === 'sub') {
          data.cell.styles.textColor = DARK;
          data.cell.styles.fontSize = 7.5;
          data.cell.styles.lineWidth = { bottom: 0.1, top: 0, left: 0, right: 0 } as any;
          data.cell.styles.lineColor = [230, 230, 230];
        }

        if (meta.rowType === 'total') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 9;
          data.cell.styles.textColor = BLACK;
          data.cell.styles.cellPadding = { top: 3, bottom: 3, left: 3, right: 3 };
          // Top border (single line) + bold
          data.cell.styles.lineWidth = { bottom: 0, top: 0.4, left: 0, right: 0 } as any;
          data.cell.styles.lineColor = BLACK;
        }
      },

      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const meta = rowMeta[data.row.index];
        if (!meta) return;

        // Double underline after total row
        if (meta.rowType === 'total') {
          const cellBottom = data.cell.y + data.cell.height;
          doc.setDrawColor(...BLACK);
          doc.setLineWidth(0.3);
          doc.line(data.cell.x, cellBottom + 0.3, data.cell.x + data.cell.width, cellBottom + 0.3);
          doc.line(data.cell.x, cellBottom + 1.1, data.cell.x + data.cell.width, cellBottom + 1.1);
        }
      },

      didDrawPage: () => {
        drawFooter();
        currentPage++;
      },
    });

    y = (doc as any).lastAutoTable.finalY + 14;

    if (y > H - 40) {
      doc.addPage();
      currentPage++;
      y = M;
    }
  }

  // ——————————————————————————————————————————
  // TRANSACTION DETAILS (ledger scope only)
  // ——————————————————————————————————————————
  if (scope === 'ledger' && filteredGroupId) {
    const targetGroup = groups.find(g => g.id === filteredGroupId);
    if (targetGroup) {
      const children = getChildren(targetGroup.id);
      const allIds = [targetGroup.id, ...children.map(c => c.id)];
      const relatedTxs = vouchers
        .filter(v => v.ledger_group_id && allIds.includes(v.ledger_group_id))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (relatedTxs.length > 0) {
        ensureSpace(20);

        doc.setFontSize(10);
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...BLACK);
        doc.text('Transaction Details', M, y + 3);
        y += 7;

        const txBody: string[][] = [];
        let runningTotal = 0;

        for (const tx of relatedTxs) {
          runningTotal += tx.amount;
          const ledger = groups.find(g => g.id === tx.ledger_group_id);
          txBody.push([
            fmtDateShort(tx.date),
            tx.notes || ledger?.name || '-',
            ledger?.name || '-',
            fmt(tx.amount),
          ]);
        }

        autoTable(doc, {
          startY: y,
          head: [['Date', 'Description', 'Ledger', 'Amount']],
          body: txBody,
          theme: 'plain',
          margin: { left: M, right: M },
          headStyles: {
            fillColor: HEADER_BG,
            textColor: BLACK,
            fontStyle: 'bold',
            fontSize: 7.5,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
            lineWidth: { bottom: 0.3, top: 0.3, left: 0, right: 0 } as any,
            lineColor: BLACK,
            font: FONT,
          },
          columnStyles: {
            0: { cellWidth: 22, halign: 'left' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 35 },
            3: { cellWidth: 32, halign: 'right' },
          },
          styles: {
            fontSize: 7.5,
            cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 },
            textColor: DARK,
            lineColor: [230, 230, 230],
            lineWidth: { bottom: 0.1, top: 0, left: 0, right: 0 } as any,
            font: FONT,
          },
          didDrawPage: () => {
            drawFooter();
            currentPage++;
          },
        });

        y = (doc as any).lastAutoTable.finalY + 8;
      }
    }
  }

  // ——————————————————————————————————————————
  // NOTES
  // ——————————————————————————————————————————
  ensureSpace(15);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  y += 5;

  doc.setTextColor(...MID);
  doc.setFontSize(6.5);
  doc.setFont(FONT, 'normal');
  doc.text('All amounts are in Indian Rupees (INR).', M, y);
  y += 3;
  doc.text(`Report period: ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}.`, M, y);
  y += 3;

  const genStr = `Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  doc.text(genStr, M, y);

  // Final footer
  drawFooter();

  // ——————————————————————————————————————————
  // SAVE
  // ——————————————————————————————————————————
  const dateStr = new Date().toISOString().split('T')[0];
  const scopeLabel = scope === 'ledger' ? 'ledger' : scope;
  doc.save(`khetbook-${scopeLabel}-report-${dateStr}.pdf`);
}
