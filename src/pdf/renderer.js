import { LABEL_HEIGHT_PT, LABEL_WIDTH_PT } from '../core/constants.js';
import { getSlicesForPage } from './slicer.js';

const OUTPUT_PAGE = [LABEL_WIDTH_PT, LABEL_HEIGHT_PT];

function getPdfLib() {
  const lib = window.PDFLib;
  if (!lib || !lib.PDFDocument) {
    throw new Error('PDFLib não carregou.');
  }
  return lib;
}

function fitInsideBox(srcW, srcH, boxW, boxH) {
  const safeW = Math.max(1, srcW);
  const safeH = Math.max(1, srcH);
  const scale = Math.min(boxW / safeW, boxH / safeH);
  return {
    scale,
    width: safeW * scale,
    height: safeH * scale,
  };
}

function toBoundingBox(slice) {
  return {
    left: slice.x,
    bottom: slice.y,
    right: slice.x + slice.w,
    top: slice.y + slice.h,
  };
}

async function embedSlice(outDoc, sourceDoc, pageIndex, slice) {
  const srcPage = sourceDoc.getPages()[pageIndex];
  const box = toBoundingBox(slice);

  try {
    return await outDoc.embedPage(srcPage, box);
  } catch (err) {
    const [copiedPage] = await outDoc.copyPages(sourceDoc, [pageIndex]);
    return outDoc.embedPage(copiedPage, box);
  }
}

function yieldToUI() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(() => resolve(), 0);
  });
}

export async function renderOutputPdf({ sourceDoc, modeId, onProgress }) {
  const { PDFDocument } = getPdfLib();
  const outDoc = await PDFDocument.create();
  const pages = sourceDoc.getPages();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const { width, height } = pages[pageIndex].getSize();
    const slices = getSlicesForPage({ width, height }, modeId);

    for (const slice of slices) {
      const embedded = await embedSlice(outDoc, sourceDoc, pageIndex, slice);
      const outPage = outDoc.addPage(OUTPUT_PAGE);
      const fit = fitInsideBox(slice.w, slice.h, LABEL_WIDTH_PT, LABEL_HEIGHT_PT);
      const x = (LABEL_WIDTH_PT - fit.width) / 2;
      const y = (LABEL_HEIGHT_PT - fit.height) / 2;

      outPage.drawPage(embedded, {
        x,
        y,
        xScale: fit.scale,
        yScale: fit.scale,
      });
    }

    if (typeof onProgress === 'function') {
      onProgress({ phase: 'page', current: pageIndex + 1, total: pages.length });
    }

    await yieldToUI();
  }

  if (typeof onProgress === 'function') {
    onProgress({ phase: 'finalize' });
  }

  const pdfBytes = await outDoc.save();
  return { pdfBytes, pageCount: outDoc.getPageCount() };
}

