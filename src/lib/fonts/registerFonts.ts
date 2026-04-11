import type jsPDF from 'jspdf';

/**
 * Register Noto Sans Gujarati (Regular + Bold) into a jsPDF instance.
 * This font supports both Latin and Gujarati glyphs, so user-typed
 * Gujarati ledger names, notes, etc. will render correctly in PDFs.
 *
 * Fonts are dynamically imported to avoid bloating the main bundle —
 * they only load when a PDF is actually being generated.
 */
export async function registerGujaratiFonts(doc: jsPDF): Promise<void> {
  const [{ NotoSansGujaratiRegular }, { NotoSansGujaratiBold }] = await Promise.all([
    import('./NotoSansGujarati-Regular'),
    import('./NotoSansGujarati-Bold'),
  ]);

  // Register Regular weight
  doc.addFileToVFS('NotoSansGujarati-Regular.ttf', NotoSansGujaratiRegular);
  doc.addFont('NotoSansGujarati-Regular.ttf', 'NotoSansGujarati', 'normal');

  // Register Bold weight
  doc.addFileToVFS('NotoSansGujarati-Bold.ttf', NotoSansGujaratiBold);
  doc.addFont('NotoSansGujarati-Bold.ttf', 'NotoSansGujarati', 'bold');
}

/** The font family name to use in doc.setFont() after registration */
export const UNICODE_FONT = 'NotoSansGujarati';
