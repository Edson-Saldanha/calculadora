import { ERROR_MESSAGES } from '../core/constants.js';

function getPdfLib() {
  const lib = window.PDFLib;
  if (!lib || !lib.PDFDocument) {
    throw new Error('PDFLib não carregou.');
  }
  return lib;
}

export async function loadPdfDocument(file) {
  const { PDFDocument } = getPdfLib();
  const bytes = await file.arrayBuffer();

  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const pages = pdfDoc.getPages();
    const sizes = pages.map((page) => page.getSize());
    return { pdfDoc, pages, sizes, pageCount: pages.length };
  } catch (err) {
    const message = String(err?.message || err || '').toLowerCase();
    if (message.includes('encrypted') || message.includes('password')) {
      const error = new Error(ERROR_MESSAGES.encrypted);
      error.code = 'encrypted';
      throw error;
    }
    throw err;
  }
}

