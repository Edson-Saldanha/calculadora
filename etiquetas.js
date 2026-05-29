(() => {
  'use strict';

  const MM_TO_PT = 2.834645669;
  const LABEL_WIDTH_MM = 100;
  const LABEL_HEIGHT_MM = 150;
  const LABEL_WIDTH_PT = LABEL_WIDTH_MM * MM_TO_PT;
  const LABEL_HEIGHT_PT = LABEL_HEIGHT_MM * MM_TO_PT;
  const PDFJS_VERSION = '2.14.305';
  const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  const PDF_LIB_URL = './vendor/pdf-lib.min.js';
  const MAX_THUMBS = 6;

  const MODES = [
    { id: 'checklist',          label: 'Etiqueta + Checklist (compacto)',  perPage: 2 },
    { id: 'checklist-expanded', label: 'Etiqueta + Checklist (expandido)', perPage: 1 },
    { id: 'standard',           label: 'Etiqueta padrão',                   perPage: 4 },
  ];

  const A4_WIDTH_PT  = 595;
  const A4_HEIGHT_PT = 842;

  const DEFAULT_MODE_ID = MODES[0].id;

  const ERROR_MESSAGES = {
    invalidFile: 'Arquivo inválido',
    encrypted: 'PDF protegido por senha',
    generic: 'Falha ao gerar, tente novamente',
  };

  const OUTPUT_FILE_PREFIX = 'etiquetas_100x150';

  const state = {
    file: null,
    modeId: DEFAULT_MODE_ID,
    modeTouched: false,
    suggestedModeId: '',
    processing: false,
    cancelRequested: false,
    inputPages: 0,
    outputPages: 0,
    outputBytes: null,
    outputBlobUrl: '',
    previewPdf: null,
    viewerPage: 1,
    viewerScale: 1,
    processStart: 0,
  };

  function resetOutput() {
    state.inputPages = 0;
    state.outputPages = 0;
    state.outputBytes = null;
    state.outputBlobUrl = '';
  }

  const dom = {
    modeSelect: document.getElementById('modeSelect'),
    modeHint: document.getElementById('modeHint'),
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    btnPick: document.getElementById('btnPick'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    autoPrint: document.getElementById('autoPrint'),
    btnGenerate: document.getElementById('btnGenerate'),
    btnCancel: document.getElementById('btnCancel'),
    btnDownload: document.getElementById('btnDownload'),
    btnOpenPreview: document.getElementById('btnOpenPreview'),
    btnTestPage: document.getElementById('btnTestPage'),
    statusText: document.getElementById('statusText'),
    progressText: document.getElementById('progressText'),
    progressFill: document.getElementById('progressFill'),
    elapsedTime: document.getElementById('elapsedTime'),
    etaText: document.getElementById('etaText'),
    previewFrame: document.getElementById('previewFrame'),
    previewEmpty: document.getElementById('previewEmpty'),
    previewThumbs: document.getElementById('previewThumbs'),
    summary: document.getElementById('summary'),
    summaryMode: document.getElementById('summaryMode'),
    summaryInput: document.getElementById('summaryInput'),
    summaryOutput: document.getElementById('summaryOutput'),
    toasts: document.getElementById('toastStack'),

    viewerModal: document.getElementById('viewerModal'),
    viewerCanvas: document.getElementById('viewerCanvas'),
    viewerClose: document.getElementById('viewerClose'),
    viewerPrev: document.getElementById('viewerPrev'),
    viewerNext: document.getElementById('viewerNext'),
    viewerZoomIn: document.getElementById('viewerZoomIn'),
    viewerZoomOut: document.getElementById('viewerZoomOut'),
    viewerScale: document.getElementById('viewerScale'),
  };

  let pdfjsLib = null;
  let pdfWorker = null;

  function validatePdfFile(file) {
    if (!file) {
      return { ok: false, message: ERROR_MESSAGES.invalidFile };
    }

    const name = String(file.name || '');
    const hasPdfType = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
    const hasSize = Number.isFinite(file.size) && file.size > 0;

    if (!hasPdfType || !hasSize) {
      return { ok: false, message: ERROR_MESSAGES.invalidFile };
    }

    return { ok: true, message: '' };
  }

  function getPdfLib() {
    const lib = window.PDFLib;
    if (!lib || !lib.PDFDocument) {
      throw new Error('PDFLib não carregou.');
    }
    return lib;
  }

  async function loadPdfDocument(file) {
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

  function getSlicesForPage(size) {
    const width  = Number(size?.width)  || 0;
    const height = Number(size?.height) || 0;
    if (width <= 0 || height <= 0) return [];
    const halfW = width  / 2;
    const halfH = height / 2;
    return [
      { x: 0,     y: halfH, w: halfW, h: halfH },
      { x: halfW, y: halfH, w: halfW, h: halfH },
      { x: 0,     y: 0,     w: halfW, h: halfH },
      { x: halfW, y: 0,     w: halfW, h: halfH },
    ];
  }

  function normalizeRotation(angle) {
    const value = Number(angle) || 0;
    const normalized = ((value % 360) + 360) % 360;
    if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
    return 0;
  }

  function getDisplaySize({ width, height }, rotation) {
    if (rotation === 90 || rotation === 270) {
      return { width: height, height: width };
    }
    return { width, height };
  }

  function mapSliceToUnrotated(slice, pageW, pageH, rotation) {
    if (rotation === 90) {
      return {
        x: pageW - (slice.y + slice.h),
        y: slice.x,
        w: slice.h,
        h: slice.w,
      };
    }
    if (rotation === 180) {
      return {
        x: pageW - (slice.x + slice.w),
        y: pageH - (slice.y + slice.h),
        w: slice.w,
        h: slice.h,
      };
    }
    if (rotation === 270) {
      return {
        x: slice.y,
        y: pageH - (slice.x + slice.w),
        w: slice.h,
        h: slice.w,
      };
    }
    return slice;
  }

  function getRotationPlacement(rotation, scaledW, scaledH, x0, y0) {
    if (rotation === 90) {
      return { x: x0 + scaledH, y: y0 };
    }
    if (rotation === 180) {
      return { x: x0 + scaledW, y: y0 + scaledH };
    }
    if (rotation === 270) {
      return { x: x0, y: y0 + scaledW };
    }
    return { x: x0, y: y0 };
  }

  const OUTPUT_PAGE = [LABEL_WIDTH_PT, LABEL_HEIGHT_PT];

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

  // ─── Checklist rendering ────────────────────────────────────────────────────
  //
  // Geometria: quadrante ≈ 297.5×421 pt tem razão de aspecto idêntica ao A4
  // (≈ 0.707), portanto escala 2× preenche A4 inteiro — etiqueta e checklist
  // nunca cabem ambos em largura total na mesma página sem recortar.
  //
  // Compacto (checklist):
  //   • Etiqueta: 70 % da altura A4, fitInsideBox → ~70 % da largura.
  //   • Checklist: apenas o topo CHECKLIST_CONTENT_FRAC do quadrante fonte
  //     (onde fica o conteúdo real — produtos + cabeçalho), escalado para
  //     preencher a largura A4 → ~86 % da largura, sem rotação.
  //   Elimina o espaço em branco interno do checklist.
  //
  // Expandido (checklist-expanded):
  //   • Duas páginas A4 por pedido, escala 2× cada.
  //   • Etiqueta e checklist preenchem A4 inteiro individualmente.

  // Fração do quadrante checklist com conteúdo real (cabeçalho + produtos).
  // Aumente se o checklist tiver muitos produtos; reduza para maior escala.
  const CHECKLIST_CONTENT_FRAC = 0.35;

  async function renderOutputPdfChecklistCombined({ sourceDoc, modeId, onProgress, shouldCancel }) {
    const { PDFDocument } = getPdfLib();
    const outDoc    = await PDFDocument.create();
    const pages     = sourceDoc.getPages();
    const halfPages = Math.floor(pages.length / 2);
    const isExpanded = modeId === 'checklist-expanded';

    const OUT_W = A4_WIDTH_PT;   // 595 pt  = 210 mm
    const OUT_H = A4_HEIGHT_PT;  // 842 pt  = 297 mm

    // Compacto: 70 % etiqueta / 30 % checklist (conteúdo cropado)
    const LABEL_ZONE = OUT_H * 0.70;       // ≈ 589 pt
    const CHECK_ZONE = OUT_H - LABEL_ZONE; // ≈ 253 pt

    const totalItems = halfPages * 4;
    let done = 0;

    for (let i = 0; i < halfPages; i += 1) {
      if (typeof shouldCancel === 'function' && shouldCancel()) {
        const err = new Error('cancelled');
        err.code = 'cancelled';
        throw err;
      }

      const { width, height } = pages[i].getSize();
      const qW = width  / 2;
      const qH = height / 2;

      const quads = [
        { x: 0,   y: qH, w: qW, h: qH },
        { x: qW,  y: qH, w: qW, h: qH },
        { x: 0,   y: 0,  w: qW, h: qH },
        { x: qW,  y: 0,  w: qW, h: qH },
      ];

      for (const q of quads) {
        const labelEmbed = await embedSlice(outDoc, sourceDoc, i, q);

        if (isExpanded) {
          // ── Expandido: página 1 = etiqueta ─────────────────────────────
          const p1   = outDoc.addPage([OUT_W, OUT_H]);
          const lFit = fitInsideBox(q.w, q.h, OUT_W, OUT_H);
          p1.drawPage(labelEmbed, {
            x: (OUT_W - lFit.width)  / 2,
            y: (OUT_H - lFit.height) / 2,
            xScale: lFit.scale,
            yScale: lFit.scale,
          });

          // ── Expandido: página 2 = checklist (quadrante inteiro) ─────────
          const checkFull  = await embedSlice(outDoc, sourceDoc, i + halfPages, q);
          const p2   = outDoc.addPage([OUT_W, OUT_H]);
          const cFit = fitInsideBox(q.w, q.h, OUT_W, OUT_H);
          p2.drawPage(checkFull, {
            x: (OUT_W - cFit.width)  / 2,
            y: (OUT_H - cFit.height) / 2,
            xScale: cFit.scale,
            yScale: cFit.scale,
          });

        } else {
          // ── Compacto: etiqueta + checklist em uma A4 ────────────────────
          const pg = outDoc.addPage([OUT_W, OUT_H]);

          // Etiqueta: zona superior (70 %), centralizada
          const lFit = fitInsideBox(q.w, q.h, OUT_W, LABEL_ZONE);
          pg.drawPage(labelEmbed, {
            x: (OUT_W - lFit.width)  / 2,
            y: CHECK_ZONE + (LABEL_ZONE - lFit.height) / 2,
            xScale: lFit.scale,
            yScale: lFit.scale,
          });

          // Checklist: zona inferior (30 %).
          // Cropado ao topo CHECKLIST_CONTENT_FRAC do quadrante fonte para
          // eliminar o espaço em branco interno e maximizar a escala.
          // Em PDF (y sobe de baixo), o topo do quadrante = y mais alto.
          const cropH  = q.h * CHECKLIST_CONTENT_FRAC;
          const cropQ  = { x: q.x, y: q.y + q.h - cropH, w: q.w, h: cropH };
          const checkCrop = await embedSlice(outDoc, sourceDoc, i + halfPages, cropQ);
          const cFit   = fitInsideBox(cropQ.w, cropQ.h, OUT_W, CHECK_ZONE);
          pg.drawPage(checkCrop, {
            x: (OUT_W - cFit.width)  / 2,
            y: (CHECK_ZONE - cFit.height) / 2,
            xScale: cFit.scale,
            yScale: cFit.scale,
          });
        }

        done += 1;
        if (typeof onProgress === 'function') {
          onProgress({ phase: 'page', current: done, total: totalItems });
        }
        await yieldToUI();
      }
    }

    if (typeof onProgress === 'function') {
      onProgress({ phase: 'finalize' });
    }

    const pdfBytes = await outDoc.save();
    return { pdfBytes, pageCount: outDoc.getPageCount() };
  }

  async function renderOutputPdf({ sourceDoc, modeId, onProgress, shouldCancel }) {
    if (modeId === 'checklist' || modeId === 'checklist-expanded') {
      return renderOutputPdfChecklistCombined({ sourceDoc, modeId, onProgress, shouldCancel });
    }

    const { PDFDocument, degrees } = getPdfLib();
    const outDoc = await PDFDocument.create();
    const pages = sourceDoc.getPages();

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      if (typeof shouldCancel === 'function' && shouldCancel()) {
        const error = new Error('cancelled');
        error.code = 'cancelled';
        throw error;
      }

      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const rotation = normalizeRotation(page.getRotation()?.angle);
      const displaySize = getDisplaySize({ width, height }, rotation);
      const slices = getSlicesForPage(displaySize);

      for (const slice of slices) {
        const mappedSlice = mapSliceToUnrotated(slice, width, height, rotation);
        const embedded = await embedSlice(outDoc, sourceDoc, pageIndex, mappedSlice);
        const outPage = outDoc.addPage(OUTPUT_PAGE);
        const fit = fitInsideBox(slice.w, slice.h, LABEL_WIDTH_PT, LABEL_HEIGHT_PT);
        const x0 = (LABEL_WIDTH_PT - fit.width) / 2;
        const y0 = (LABEL_HEIGHT_PT - fit.height) / 2;
        const scaledW = mappedSlice.w * fit.scale;
        const scaledH = mappedSlice.h * fit.scale;
        const placement = getRotationPlacement(rotation, scaledW, scaledH, x0, y0);

        outPage.drawPage(embedded, {
          x: placement.x,
          y: placement.y,
          xScale: fit.scale,
          yScale: fit.scale,
          rotate: rotation ? degrees(rotation) : undefined,
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

  function createPdfBlobUrl(bytes) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }

  function revokePdfBlobUrl(url) {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  function downloadPdfFromUrl(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  let timerId = null;
  let startTime = 0;

  function formatSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const rem = Math.round(seconds % 60);
    return `${minutes}m ${rem}s`;
  }

  function resetTimer() {
    if (dom.elapsedTime) dom.elapsedTime.textContent = '0s';
    if (dom.etaText) dom.etaText.textContent = '—';
    startTime = 0;
    state.processStart = 0;
  }

  function startTimer() {
    startTime = Date.now();
    state.processStart = startTime;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (dom.elapsedTime) dom.elapsedTime.textContent = formatSeconds(elapsed);
    }, 500);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateEta(current, total) {
    if (!dom.etaText) return;
    if (!state.processStart || !current || !total) {
      dom.etaText.textContent = '—';
      return;
    }
    const elapsed = (Date.now() - state.processStart) / 1000;
    const perPage = elapsed / Math.max(1, current);
    const remaining = Math.max(0, (total - current) * perPage);
    dom.etaText.textContent = formatSeconds(remaining);
  }

  function setStatus(text, kind = 'idle') {
    if (!dom.statusText) return;
    dom.statusText.textContent = text;
    dom.statusText.classList.remove('status-text--idle', 'status-text--ok', 'status-text--warn', 'status-text--err');
    dom.statusText.classList.add(`status-text--${kind}`);
  }

  function setProgress({ text = '', current = 0, total = 0 } = {}) {
    if (dom.progressText && text) {
      dom.progressText.textContent = text;
    }
    if (!dom.progressFill) return;
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeCurrent = Math.min(safeTotal, Math.max(0, Number(current) || 0));
    const pct = Math.round((safeCurrent / safeTotal) * 100);
    dom.progressFill.style.width = `${pct}%`;
  }

  function resetProgress(text = '—') {
    if (dom.progressText) dom.progressText.textContent = text;
    if (dom.progressFill) dom.progressFill.style.width = '0%';
  }

  function toast(message, type = 'info') {
    if (!dom.toasts || !message) return;
    const item = document.createElement('div');
    const safeType = ['info', 'ok', 'warn', 'err'].includes(type) ? type : 'info';
    item.className = `toast toast--${safeType}`;
    item.textContent = message;

    dom.toasts.appendChild(item);
    requestAnimationFrame(() => item.classList.add('toast--show'));

    const ttl = safeType === 'err' ? 4200 : 2800;
    window.setTimeout(() => {
      item.classList.remove('toast--show');
      item.addEventListener('transitionend', () => item.remove(), { once: true });
    }, ttl);
  }

  function initPdfJs() {
    const lib = window.pdfjsLib || window['pdfjsLib'];
    if (!lib) {
      if (dom.previewThumbs) dom.previewThumbs.hidden = true;
      return;
    }
    pdfjsLib = lib;
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
  }

  function setBodyModal(open) {
    document.body.classList.toggle('is-modal-open', open);
  }

  function setPreview(url) {
    if (dom.previewFrame) {
      dom.previewFrame.hidden = !url;
      dom.previewFrame.src = url || 'about:blank';
    }
    if (dom.previewEmpty) {
      dom.previewEmpty.hidden = !!url;
    }
    if (dom.previewThumbs) {
      dom.previewThumbs.hidden = !url;
    }
    if (dom.btnOpenPreview) {
      dom.btnOpenPreview.disabled = !url || state.processing;
    }
  }

  function clearPreviewThumbs() {
    if (dom.previewThumbs) dom.previewThumbs.innerHTML = '';
    state.previewPdf = null;
  }

  async function renderThumbsFromBytes(bytes) {
    if (!pdfjsLib || !dom.previewThumbs || !bytes) return;
    clearPreviewThumbs();

    try {
      const loading = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loading.promise;
      state.previewPdf = pdf;
      const total = Math.min(MAX_THUMBS, pdf.numPages);

      for (let pageIndex = 1; pageIndex <= total; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        await page.render({ canvasContext: ctx, viewport }).promise;

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'thumb';
        item.dataset.page = String(pageIndex);

        const badge = document.createElement('span');
        badge.className = 'thumb-badge';
        badge.textContent = `#${pageIndex}`;

        item.appendChild(canvas);
        item.appendChild(badge);
        dom.previewThumbs.appendChild(item);
      }
    } catch (err) {
      clearPreviewThumbs();
    }
  }

  function openPreview() {
    if (!state.outputBlobUrl) return;
    const win = window.open(state.outputBlobUrl, '_blank');
    if (!win) {
      toast('Popup bloqueado. Use o botão baixar.', 'warn');
    }
  }

  async function renderViewerPage() {
    if (!dom.viewerCanvas || !pdfjsLib || !state.outputBytes) return;
    try {
      if (!state.previewPdf) {
        const loading = pdfjsLib.getDocument({ data: state.outputBytes });
        state.previewPdf = await loading.promise;
      }
      const total = state.previewPdf.numPages || 1;
      state.viewerPage = Math.max(1, Math.min(total, state.viewerPage));

      const page = await state.previewPdf.getPage(state.viewerPage);
      const viewport = page.getViewport({ scale: state.viewerScale });
      const canvas = dom.viewerCanvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      await page.render({ canvasContext: ctx, viewport }).promise;

      if (dom.viewerScale) {
        dom.viewerScale.textContent = `${Math.round(state.viewerScale * 100)}%`;
      }
      if (dom.viewerPrev) dom.viewerPrev.disabled = state.viewerPage <= 1;
      if (dom.viewerNext) dom.viewerNext.disabled = state.viewerPage >= total;
    } catch (err) {
      toast('Falha ao renderizar a pré-visualização. Abrindo PDF...', 'warn');
      closeViewer();
      openPreview();
    }
  }

  function openViewer(pageIndex) {
    if (!dom.viewerModal) return;
    if (!state.outputBytes) {
      openPreview();
      return;
    }
    if (!pdfjsLib) {
      openPreview();
      return;
    }
    state.viewerPage = pageIndex || 1;
    state.viewerScale = 1.1;
    dom.viewerModal.hidden = false;
    setBodyModal(true);
    renderViewerPage();
  }

  function closeViewer() {
    if (!dom.viewerModal) return;
    dom.viewerModal.hidden = true;
    setBodyModal(false);
  }

  function tryAutoPrint() {
    if (!dom.autoPrint?.checked || !state.outputBlobUrl) return;
    const printWindow = window.open(state.outputBlobUrl, '_blank');
    if (!printWindow) {
      toast('Popup bloqueado. Abra o PDF e imprima manualmente.', 'warn');
      return;
    }
    const triggerPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (err) {
        toast('Falha ao abrir a impressão automática.', 'warn');
      }
    };
    printWindow.onload = () => {
      setTimeout(triggerPrint, 250);
    };
    setTimeout(triggerPrint, 1200);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    const digits = idx === 0 ? 0 : idx === 1 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[idx]}`;
  }

  function getModeById(modeId) {
    return MODES.find((mode) => mode.id === modeId) || MODES[0];
  }

  function setModeHint(text) {
    if (!dom.modeHint) return;
    dom.modeHint.innerHTML = text;
  }

  function applyMode(modeId) {
    const mode = getModeById(modeId);
    state.modeId = mode.id;
    if (dom.modeSelect) dom.modeSelect.value = mode.id;
  }

  function guessModeFromMeta(fileName, size, pageCount) {
    const name = String(fileName || '').toLowerCase();
    const isChecklistName = name.includes('checklist') || name.includes('check') || name.includes('lista');

    const w = Math.round(size?.width || 0);
    const h = Math.round(size?.height || 0);
    const near = (v, t) => Math.abs(v - t) <= 26;
    const isA4 = (near(w, 595) && near(h, 842)) || (near(w, 842) && near(h, 595));
    const hasPairedPages = pageCount >= 2 && pageCount % 2 === 0;

    if (isChecklistName || (isA4 && hasPairedPages)) {
      return { id: 'checklist', reason: isChecklistName ? 'nome do arquivo sugere checklist' : 'PDF A4 com páginas pareadas — etiquetas + checklists detectados' };
    }
    if (isA4) {
      return { id: 'standard', reason: 'tamanho A4 detectado' };
    }
    return { id: DEFAULT_MODE_ID, reason: 'modo padrão sugerido' };
  }

  async function suggestMode(file) {
    if (!file) return;
    setModeHint('Detectando layout...');
    try {
      const { pdfDoc, sizes } = await loadPdfDocument(file);
      const page = pdfDoc.getPages()[0];
      const rotation = normalizeRotation(page.getRotation()?.angle);
      const displaySize = getDisplaySize(sizes[0] || page.getSize(), rotation);
      const suggestion = guessModeFromMeta(file.name, displaySize, pdfDoc.getPageCount());
      state.suggestedModeId = suggestion.id;
      const mode = getModeById(suggestion.id);
      setModeHint(`Sugestão: <strong>${mode.label}</strong> — ${suggestion.reason}. Se estiver diferente, ajuste o modo.`);
      if (!state.modeTouched) {
        applyMode(suggestion.id);
      }
    } catch (err) {
      if (err?.code === 'encrypted') {
        setModeHint('PDF protegido por senha. Desbloqueie e tente novamente.');
      } else {
        setModeHint('Não foi possível detectar o layout automaticamente.');
      }
    }
  }

  function updateButtons() {
    const hasFile = !!state.file;
    const hasOutput = !!state.outputBlobUrl;
    if (dom.btnGenerate) dom.btnGenerate.disabled = !hasFile || state.processing;
    if (dom.btnDownload) dom.btnDownload.disabled = !hasOutput || state.processing;
    if (dom.btnOpenPreview) dom.btnOpenPreview.disabled = !hasOutput || state.processing;
    if (dom.btnCancel) dom.btnCancel.disabled = !state.processing;
    if (dom.btnTestPage) dom.btnTestPage.disabled = state.processing;
  }

  function setFileInfo(file) {
    if (!dom.fileName || !dom.fileSize) return;
    if (!file) {
      dom.fileName.textContent = 'Nenhum arquivo selecionado';
      dom.fileSize.textContent = '—';
      return;
    }
    dom.fileName.textContent = file.name;
    dom.fileSize.textContent = formatBytes(file.size);
  }

  function clearOutput() {
    setPreview('');
    clearPreviewThumbs();
    closeViewer();
    state.cancelRequested = false;
    if (state.outputBlobUrl) {
      revokePdfBlobUrl(state.outputBlobUrl);
    }
    resetOutput();
    resetProgress('—');
    resetTimer();
    if (dom.summary) dom.summary.hidden = true;
    updateButtons();
  }

  function updateSummary() {
    const mode = getModeById(state.modeId);
    if (!dom.summary) return;
    if (dom.summaryMode) dom.summaryMode.textContent = mode.label;
    if (dom.summaryInput) dom.summaryInput.textContent = String(state.inputPages || 0);
    if (dom.summaryOutput) dom.summaryOutput.textContent = String(state.outputPages || 0);
    dom.summary.hidden = false;
  }

  function setFileFromInput(file) {
    state.file = file || null;
    clearOutput();
    setFileInfo(state.file);
    if (state.file) {
      setStatus('PDF selecionado. Clique em Gerar etiquetas.', 'idle');
      suggestMode(state.file);
    } else {
      setStatus('Selecione um PDF para começar.', 'idle');
      setModeHint('Selecione um modo ou envie um PDF para detectar automaticamente.');
    }
    updateButtons();
  }

  function setFileFromDrop(file) {
    if (!dom.fileInput) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    dom.fileInput.files = dt.files;
    dom.fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function handleModeChange() {
    state.modeId = dom.modeSelect?.value || DEFAULT_MODE_ID;
    state.modeTouched = true;
    localStorage.setItem('value_mode', state.modeId);
    clearOutput();
    setModeHint('Modo selecionado manualmente. Se quiser, envie um PDF para reavaliar.');
    if (state.file) {
      setStatus('Modo alterado. Clique em Gerar etiquetas.', 'idle');
    }
  }

  function handleDownload() {
    if (!state.outputBlobUrl) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const mode = getModeById(state.modeId);
    const filename = `${OUTPUT_FILE_PREFIX}_${mode.id}_${ts}.pdf`;
    downloadPdfFromUrl(state.outputBlobUrl, filename);
  }

  function handleCancel() {
    if (!state.processing) return;
    state.cancelRequested = true;
    setStatus('Cancelando...', 'warn');
    if (pdfWorker) {
      pdfWorker.postMessage({ type: 'cancel' });
    }
  }

  async function handleTestPage() {
    try {
      const { PDFDocument, rgb, StandardFonts } = getPdfLib();
      const doc = await PDFDocument.create();
      const page = doc.addPage([LABEL_WIDTH_PT, LABEL_HEIGHT_PT]);
      const { width, height } = page.getSize();
      const margin = 10;
      page.drawRectangle({
        x: margin,
        y: margin,
        width: width - margin * 2,
        height: height - margin * 2,
        borderColor: rgb(0.95, 0.55, 0.2),
        borderWidth: 1.5,
      });
      page.drawLine({
        start: { x: width / 2, y: margin },
        end: { x: width / 2, y: height - margin },
        color: rgb(0.8, 0.8, 0.8),
        thickness: 0.5,
      });
      page.drawLine({
        start: { x: margin, y: height / 2 },
        end: { x: width - margin, y: height / 2 },
        color: rgb(0.8, 0.8, 0.8),
        thickness: 0.5,
      });
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText('100 x 150 mm', {
        x: margin + 6,
        y: height - margin - 18,
        size: 14,
        font: fontBold,
        color: rgb(0.95, 0.8, 0.6),
      });
      page.drawText('Use escala 100% na impressão', {
        x: margin + 6,
        y: margin + 6,
        size: 9,
        font: fontRegular,
        color: rgb(0.8, 0.8, 0.8),
      });

      const pdfBytes = await doc.save();
      const url = createPdfBlobUrl(pdfBytes);
      downloadPdfFromUrl(url, 'pagina_teste_100x150.pdf');
      setTimeout(() => revokePdfBlobUrl(url), 4000);
    } catch (err) {
      toast('Falha ao gerar a página de teste.', 'err');
    }
  }

  function resolveErrorMessage(err) {
    if (err?.code === 'encrypted') return ERROR_MESSAGES.encrypted;
    const message = String(err?.message || err || '').toLowerCase();
    if (message.includes('encrypted') || message.includes('password')) {
      return ERROR_MESSAGES.encrypted;
    }
    if (err?.code === 'cancelled') {
      return 'Processamento cancelado.';
    }
    return ERROR_MESSAGES.generic;
  }

  function shouldUseWorker(bytes) {
    if (!bytes || !bytes.byteLength) return false;
    return typeof Worker !== 'undefined' && bytes.byteLength > 1024 * 1024;
  }

  function createPdfWorker() {
    const workerCode = `
      'use strict';
      let cancelled = false;
      const LABEL_WIDTH_PT  = ${LABEL_WIDTH_PT};
      const LABEL_HEIGHT_PT = ${LABEL_HEIGHT_PT};
      const A4_W = ${A4_WIDTH_PT};
      const A4_H = ${A4_HEIGHT_PT};

      const normalizeRotation = (angle) => {
        const v = ((Number(angle) || 0) % 360 + 360) % 360;
        return (v === 90 || v === 180 || v === 270) ? v : 0;
      };

      const getDisplaySize = (s, r) =>
        (r === 90 || r === 270) ? { width: s.height, height: s.width } : { width: s.width, height: s.height };

      const mapSliceToUnrotated = (sl, pW, pH, r) => {
        if (r === 90)  return { x: pW - (sl.y + sl.h), y: sl.x, w: sl.h, h: sl.w };
        if (r === 180) return { x: pW - (sl.x + sl.w), y: pH - (sl.y + sl.h), w: sl.w, h: sl.h };
        if (r === 270) return { x: sl.y, y: pH - (sl.x + sl.w), w: sl.h, h: sl.w };
        return sl;
      };

      const getRotationPlacement = (r, sW, sH, x0, y0) => {
        if (r === 90)  return { x: x0 + sH, y: y0 };
        if (r === 180) return { x: x0 + sW, y: y0 + sH };
        if (r === 270) return { x: x0, y: y0 + sW };
        return { x: x0, y: y0 };
      };

      const fitInsideBox = (srcW, srcH, boxW, boxH) => {
        const sW = Math.max(1, srcW), sH = Math.max(1, srcH);
        const sc = Math.min(boxW / sW, boxH / sH);
        return { scale: sc, width: sW * sc, height: sH * sc };
      };

      const toBoundingBox = (sl) => ({ left: sl.x, bottom: sl.y, right: sl.x + sl.w, top: sl.y + sl.h });

      const embedSlice = async (outDoc, srcDoc, idx, sl) => {
        const page = srcDoc.getPages()[idx];
        const box  = toBoundingBox(sl);
        try { return await outDoc.embedPage(page, box); }
        catch (_) { const [cp] = await outDoc.copyPages(srcDoc, [idx]); return outDoc.embedPage(cp, box); }
      };

      self.onmessage = async (event) => {
        const { type, payload } = event.data || {};
        if (type === 'cancel') { cancelled = true; return; }
        if (type !== 'start') return;
        cancelled = false;

        try {
          if (!self.PDFLib) importScripts(payload.pdfLibUrl);
          const { PDFDocument, degrees } = self.PDFLib;
          const bytes    = new Uint8Array(payload.bytes || []);
          const modeId   = payload.modeId || 'checklist';
          const srcDoc   = await PDFDocument.load(bytes, { ignoreEncryption: false });
          const pages    = srcDoc.getPages();
          const outDoc   = await PDFDocument.create();
          self.postMessage({ type: 'init', payload: { pageCount: pages.length } });

          if (modeId === 'checklist' || modeId === 'checklist-expanded') {
            const halfPages  = Math.floor(pages.length / 2);
            const isExpanded = modeId === 'checklist-expanded';
            const CHECKLIST_CONTENT_FRAC = ${CHECKLIST_CONTENT_FRAC};
            const LABEL_ZONE = A4_H * 0.70;
            const CHECK_ZONE = A4_H - LABEL_ZONE;
            let done = 0;
            const totalItems = halfPages * 4;

            for (let i = 0; i < halfPages; i += 1) {
              if (cancelled) { self.postMessage({ type: 'cancelled' }); return; }
              const { width, height } = pages[i].getSize();
              const qW = width / 2, qH = height / 2;
              const quads = [
                { x: 0,  y: qH, w: qW, h: qH },
                { x: qW, y: qH, w: qW, h: qH },
                { x: 0,  y: 0,  w: qW, h: qH },
                { x: qW, y: 0,  w: qW, h: qH },
              ];

              for (const q of quads) {
                const lE = await embedSlice(outDoc, srcDoc, i, q);

                if (isExpanded) {
                  const p1 = outDoc.addPage([A4_W, A4_H]);
                  const lF = fitInsideBox(q.w, q.h, A4_W, A4_H);
                  p1.drawPage(lE, { x: (A4_W - lF.width) / 2, y: (A4_H - lF.height) / 2, xScale: lF.scale, yScale: lF.scale });

                  const cFull = await embedSlice(outDoc, srcDoc, i + halfPages, q);
                  const p2 = outDoc.addPage([A4_W, A4_H]);
                  const cF = fitInsideBox(q.w, q.h, A4_W, A4_H);
                  p2.drawPage(cFull, { x: (A4_W - cF.width) / 2, y: (A4_H - cF.height) / 2, xScale: cF.scale, yScale: cF.scale });
                } else {
                  const pg = outDoc.addPage([A4_W, A4_H]);
                  const lF = fitInsideBox(q.w, q.h, A4_W, LABEL_ZONE);
                  pg.drawPage(lE, { x: (A4_W - lF.width) / 2, y: CHECK_ZONE + (LABEL_ZONE - lF.height) / 2, xScale: lF.scale, yScale: lF.scale });

                  const cropH  = q.h * CHECKLIST_CONTENT_FRAC;
                  const cropQ  = { x: q.x, y: q.y + q.h - cropH, w: q.w, h: cropH };
                  const cCrop  = await embedSlice(outDoc, srcDoc, i + halfPages, cropQ);
                  const cF2    = fitInsideBox(cropQ.w, cropQ.h, A4_W, CHECK_ZONE);
                  pg.drawPage(cCrop, { x: (A4_W - cF2.width) / 2, y: (CHECK_ZONE - cF2.height) / 2, xScale: cF2.scale, yScale: cF2.scale });
                }

                done += 1;
                self.postMessage({ type: 'progress', payload: { phase: 'page', current: done, total: totalItems } });
              }
            }

          } else {
            for (let pi = 0; pi < pages.length; pi += 1) {
              if (cancelled) { self.postMessage({ type: 'cancelled' }); return; }
              const page  = pages[pi];
              const size  = page.getSize();
              const rot   = normalizeRotation(page.getRotation()?.angle);
              const dSize = getDisplaySize(size, rot);
              const halfW = dSize.width / 2, halfH = dSize.height / 2;
              const slices = [
                { x: 0,     y: halfH, w: halfW, h: halfH },
                { x: halfW, y: halfH, w: halfW, h: halfH },
                { x: 0,     y: 0,     w: halfW, h: halfH },
                { x: halfW, y: 0,     w: halfW, h: halfH },
              ];

              for (const sl of slices) {
                const ms  = mapSliceToUnrotated(sl, size.width, size.height, rot);
                const emb = await embedSlice(outDoc, srcDoc, pi, ms);
                const pg  = outDoc.addPage([LABEL_WIDTH_PT, LABEL_HEIGHT_PT]);
                const fit = fitInsideBox(sl.w, sl.h, LABEL_WIDTH_PT, LABEL_HEIGHT_PT);
                const x0  = (LABEL_WIDTH_PT  - fit.width)  / 2;
                const y0  = (LABEL_HEIGHT_PT - fit.height) / 2;
                const sW  = ms.w * fit.scale, sH = ms.h * fit.scale;
                const pl  = getRotationPlacement(rot, sW, sH, x0, y0);
                pg.drawPage(emb, { x: pl.x, y: pl.y, xScale: fit.scale, yScale: fit.scale, rotate: rot ? degrees(rot) : undefined });
              }
              self.postMessage({ type: 'progress', payload: { phase: 'page', current: pi + 1, total: pages.length } });
            }
          }

          self.postMessage({ type: 'progress', payload: { phase: 'finalize' } });
          const pdfBytes = await outDoc.save();
          const buffer   = pdfBytes.buffer.slice(0);
          self.postMessage({ type: 'done', payload: { pdfBytes: buffer, pageCount: outDoc.getPageCount() } }, [buffer]);
        } catch (err) {
          const msg  = String(err?.message || err || '');
          const code = msg.toLowerCase().includes('encrypted') || msg.toLowerCase().includes('password') ? 'encrypted' : 'generic';
          self.postMessage({ type: 'error', payload: { message: msg, code } });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker._url = url;
    return worker;
  }

  function getPdfLibUrl() {
    try {
      return new URL(PDF_LIB_URL, window.location.href).href;
    } catch (err) {
      return PDF_LIB_URL;
    }
  }

  function processWithWorker(buffer, modeId, onProgress) {
    if (!pdfWorker) {
      pdfWorker = createPdfWorker();
    }

    return new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'init') {
          state.inputPages = payload.pageCount || 0;
          return;
        }
        if (type === 'progress') {
          if (typeof onProgress === 'function') onProgress(payload);
          return;
        }
        if (type === 'done') {
          cleanup();
          resolve({ pdfBytes: new Uint8Array(payload.pdfBytes), pageCount: payload.pageCount });
          return;
        }
        if (type === 'cancelled') {
          cleanup();
          const err = new Error('cancelled');
          err.code = 'cancelled';
          reject(err);
          return;
        }
        if (type === 'error') {
          cleanup();
          const err = new Error(payload.message || ERROR_MESSAGES.generic);
          err.code = payload.code || 'generic';
          reject(err);
        }
      };

      const handleError = () => {
        cleanup();
        reject(new Error(ERROR_MESSAGES.generic));
      };

      const cleanup = () => {
        pdfWorker.removeEventListener('message', handleMessage);
        pdfWorker.removeEventListener('error', handleError);
      };

      pdfWorker.addEventListener('message', handleMessage);
      pdfWorker.addEventListener('error', handleError);

      pdfWorker.postMessage({
        type: 'start',
        payload: { bytes: buffer, modeId, pdfLibUrl: getPdfLibUrl() },
      }, [buffer]);
    });
  }

  async function processInMain(bytes, modeId, onProgress) {
    const { PDFDocument } = getPdfLib();
    const sourceDoc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    state.inputPages = sourceDoc.getPages().length;
    return renderOutputPdf({
      sourceDoc,
      modeId,
      onProgress,
      shouldCancel: () => state.cancelRequested,
    });
  }

  async function handleGenerate() {
    if (state.processing) return;

    const validation = validatePdfFile(state.file);
    if (!validation.ok) {
      setStatus(validation.message, 'err');
      toast(validation.message, 'err');
      return;
    }

    state.processing = true;
    state.cancelRequested = false;
    updateButtons();
    resetProgress('—');
    resetTimer();
    startTimer();
    setPreview('');
    clearPreviewThumbs();
    if (dom.summary) dom.summary.hidden = true;

    try {
      setStatus('Lendo PDF...', 'idle');
      setProgress({ text: 'Lendo PDF...', current: 0, total: 1 });

      const buffer = await state.file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const mode = getModeById(state.modeId);

      const onProgress = ({ phase, current, total }) => {
        if (phase === 'page') {
          const text = `Processando página ${current} de ${total}...`;
          setStatus(text, 'idle');
          setProgress({ text, current, total });
          updateEta(current, total);
        }
        if (phase === 'finalize') {
          setStatus('Gerando PDF final...', 'idle');
          setProgress({ text: 'Gerando PDF final...', current: 1, total: 1 });
        }
      };

      let result;
      if (shouldUseWorker(bytes)) {
        try {
          const workerBuffer = buffer.slice(0);
          result = await processWithWorker(workerBuffer, state.modeId, onProgress);
        } catch (err) {
          if (err?.code === 'encrypted' || err?.code === 'cancelled') throw err;
          toast('Worker indisponível. Processando no navegador...', 'warn');
          result = await processInMain(bytes, state.modeId, onProgress);
        }
      } else {
        result = await processInMain(bytes, state.modeId, onProgress);
      }

      if (!result.pageCount) {
        throw new Error(ERROR_MESSAGES.generic);
      }

      if (state.outputBlobUrl) revokePdfBlobUrl(state.outputBlobUrl);
      state.outputBytes = result.pdfBytes;
      const inputPages = state.inputPages || 0;
      const expectedOutput = inputPages ? inputPages * mode.perPage : result.pageCount;
      state.outputPages = result.pageCount || expectedOutput;
      state.outputBlobUrl = createPdfBlobUrl(result.pdfBytes);

      setPreview(state.outputBlobUrl);
      renderThumbsFromBytes(state.outputBytes);
      updateSummary();
      setStatus('PDF pronto para download.', 'ok');
      setProgress({ text: 'Concluído', current: 1, total: 1 });
      toast('PDF pronto para download.', 'ok');
      tryAutoPrint();
    } catch (err) {
      const message = resolveErrorMessage(err);
      const kind = err?.code === 'cancelled' ? 'warn' : 'err';
      setStatus(message, kind);
      resetProgress('—');
      clearOutput();
      toast(message, err?.code === 'cancelled' ? 'warn' : 'err');
    } finally {
      stopTimer();
      state.processing = false;
      updateButtons();
    }
  }

  function initEvents() {
    initPdfJs();
    if (dom.modeSelect) {
      dom.modeSelect.innerHTML = MODES.map((mode) => (
        `<option value="${mode.id}">${mode.label}</option>`
      )).join('');
      const savedMode = localStorage.getItem('value_mode');
      const validSaved = MODES.some((mode) => mode.id === savedMode);
      if (validSaved) {
        dom.modeSelect.value = savedMode;
        state.modeId = savedMode;
        state.modeTouched = true;
      } else {
        dom.modeSelect.value = DEFAULT_MODE_ID;
        state.modeId = DEFAULT_MODE_ID;
      }
    }

    resetProgress('—');
    resetTimer();
    setStatus('Selecione um PDF para começar.', 'idle');
    setPreview('');
    if (state.modeTouched) {
      const mode = getModeById(state.modeId);
      setModeHint(`Modo salvo: <strong>${mode.label}</strong>. Envie um PDF para reavaliar.`);
    } else {
      setModeHint('Selecione um modo ou envie um PDF para detectar automaticamente.');
    }
    updateButtons();

    if (dom.modeSelect) dom.modeSelect.addEventListener('change', handleModeChange);

    if (dom.btnOpenPreview) dom.btnOpenPreview.addEventListener('click', openPreview);
    if (dom.btnCancel) dom.btnCancel.addEventListener('click', handleCancel);
    if (dom.btnTestPage) dom.btnTestPage.addEventListener('click', handleTestPage);

    if (dom.previewThumbs) {
      dom.previewThumbs.addEventListener('click', (event) => {
        const target = event.target?.closest?.('.thumb');
        if (!target) return;
        const pageIndex = Number(target.dataset.page);
        if (Number.isFinite(pageIndex)) openViewer(pageIndex);
      });
    }

    if (dom.viewerModal) {
      dom.viewerModal.addEventListener('click', (event) => {
        const close = event.target?.closest?.('[data-close="1"]');
        if (close) closeViewer();
      });
    }
    if (dom.viewerClose) dom.viewerClose.addEventListener('click', closeViewer);
    if (dom.viewerPrev) dom.viewerPrev.addEventListener('click', () => {
      state.viewerPage -= 1;
      renderViewerPage();
    });
    if (dom.viewerNext) dom.viewerNext.addEventListener('click', () => {
      state.viewerPage += 1;
      renderViewerPage();
    });
    if (dom.viewerZoomIn) dom.viewerZoomIn.addEventListener('click', () => {
      state.viewerScale = Math.min(3, state.viewerScale + 0.2);
      renderViewerPage();
    });
    if (dom.viewerZoomOut) dom.viewerZoomOut.addEventListener('click', () => {
      state.viewerScale = Math.max(0.4, state.viewerScale - 0.2);
      renderViewerPage();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dom.viewerModal && !dom.viewerModal.hidden) {
        closeViewer();
      }
    });

    if (dom.autoPrint) {
      const saved = localStorage.getItem('value_autoPrint');
      if (saved === 'true') dom.autoPrint.checked = true;
      dom.autoPrint.addEventListener('change', () => {
        localStorage.setItem('value_autoPrint', dom.autoPrint.checked ? 'true' : 'false');
      });
    }

    if (dom.fileInput) {
      dom.fileInput.addEventListener('change', () => {
        const file = dom.fileInput.files?.[0];
        if (!file) {
          setFileFromInput(null);
          return;
        }
        const validation = validatePdfFile(file);
        if (!validation.ok) {
          setFileFromInput(null);
          setStatus(validation.message, 'err');
          toast(validation.message, 'err');
          return;
        }
        setFileFromInput(file);
      });
    }

    if (dom.btnPick && dom.fileInput) {
      dom.btnPick.addEventListener('click', () => dom.fileInput.click());
    }

    if (dom.dropZone && dom.fileInput) {
      const stop = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };

      dom.dropZone.addEventListener('click', (event) => {
        if (event.target?.closest?.('button')) return;
        dom.fileInput.click();
      });

      dom.dropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          dom.fileInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach((evt) => {
        dom.dropZone.addEventListener(evt, (event) => {
          stop(event);
          dom.dropZone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'dragend', 'drop'].forEach((evt) => {
        dom.dropZone.addEventListener(evt, (event) => {
          stop(event);
          dom.dropZone.classList.remove('is-dragover');
        });
      });

      dom.dropZone.addEventListener('drop', (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const validation = validatePdfFile(file);
        if (!validation.ok) {
          setStatus(validation.message, 'err');
          toast(validation.message, 'err');
          return;
        }
        setFileFromDrop(file);
      });
    }

    if (dom.btnGenerate) dom.btnGenerate.addEventListener('click', handleGenerate);
    if (dom.btnDownload) dom.btnDownload.addEventListener('click', handleDownload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEvents);
  } else {
    initEvents();
  }
})();
