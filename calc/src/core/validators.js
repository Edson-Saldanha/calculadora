import { ERROR_MESSAGES } from './constants.js';

export function validatePdfFile(file) {
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

