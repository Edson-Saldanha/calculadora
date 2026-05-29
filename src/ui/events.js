import { DEFAULT_MODE_ID, ERROR_MESSAGES, MODES, OUTPUT_FILE_PREFIX } from '../core/constants.js';
import { resetOutput, state } from '../core/state.js';
import { validatePdfFile } from '../core/validators.js';
import { createPdfBlobUrl, downloadPdfFromUrl, revokePdfBlobUrl } from '../pdf/exporter.js';
import { loadPdfDocument } from '../pdf/pdfLoader.js';
import { renderOutputPdf } from '../pdf/renderer.js';
import { dom } from './dom.js';
import { resetProgress, resetTimer, setProgress, setStatus, startTimer, stopTimer } from './progress.js';
import { toast } from './notifications.js';

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

function updateButtons() {
  const hasFile = !!state.file;
  const hasOutput = !!state.outputBlobUrl;
  if (dom.btnGenerate) dom.btnGenerate.disabled = !hasFile || state.processing;
  if (dom.btnDownload) dom.btnDownload.disabled = !hasOutput || state.processing;
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
  } else {
    setStatus('Selecione um PDF para começar.', 'idle');
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
  clearOutput();
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

function resolveErrorMessage(err) {
  if (err?.code === 'encrypted') return ERROR_MESSAGES.encrypted;
  const message = String(err?.message || err || '').toLowerCase();
  if (message.includes('encrypted') || message.includes('password')) {
    return ERROR_MESSAGES.encrypted;
  }
  if (message.includes('pdf') && message.includes('não')) {
    return ERROR_MESSAGES.generic;
  }
  return ERROR_MESSAGES.generic;
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
  updateButtons();
  resetProgress('—');
  resetTimer();
  startTimer();

  try {
    setStatus('Lendo PDF...', 'idle');
    setProgress({ text: 'Lendo PDF...', current: 0, total: 1 });

    const { pdfDoc, pageCount } = await loadPdfDocument(state.file);
    if (!pageCount) {
      throw new Error(ERROR_MESSAGES.generic);
    }

    state.inputPages = pageCount;

    const mode = getModeById(state.modeId);
    const expectedOutput = pageCount * mode.perPage;

    const result = await renderOutputPdf({
      sourceDoc: pdfDoc,
      modeId: state.modeId,
      onProgress: ({ phase, current, total }) => {
        if (phase === 'page') {
          const text = `Processando página ${current} de ${total}...`;
          setStatus(text, 'idle');
          setProgress({ text, current, total });
        }
        if (phase === 'finalize') {
          setStatus('Gerando PDF final...', 'idle');
          setProgress({ text: 'Gerando PDF final...', current: 1, total: 1 });
        }
      },
    });

    if (!result.pageCount) {
      throw new Error(ERROR_MESSAGES.generic);
    }

    if (state.outputBlobUrl) revokePdfBlobUrl(state.outputBlobUrl);
    state.outputBytes = result.pdfBytes;
    state.outputPages = result.pageCount || expectedOutput;
    state.outputBlobUrl = createPdfBlobUrl(result.pdfBytes);

    updateSummary();
    setStatus('PDF pronto para download.', 'ok');
    setProgress({ text: 'Concluído', current: 1, total: 1 });
    toast('PDF pronto para download.', 'ok');
  } catch (err) {
    const message = resolveErrorMessage(err);
    setStatus(message, 'err');
    resetProgress('—');
    clearOutput();
    toast(message, 'err');
  } finally {
    stopTimer();
    state.processing = false;
    updateButtons();
  }
}

export function initEvents() {
  if (dom.modeSelect) {
    dom.modeSelect.innerHTML = MODES.map((mode) => (
      `<option value="${mode.id}">${mode.label}</option>`
    )).join('');
    dom.modeSelect.value = DEFAULT_MODE_ID;
    state.modeId = DEFAULT_MODE_ID;
  }

  resetProgress('—');
  resetTimer();
  setStatus('Selecione um PDF para começar.', 'idle');
  updateButtons();

  if (dom.modeSelect) dom.modeSelect.addEventListener('change', handleModeChange);

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

