export const MM_TO_PT = 2.834645669;

export const LABEL_WIDTH_MM = 100;
export const LABEL_HEIGHT_MM = 150;
export const LABEL_WIDTH_PT = LABEL_WIDTH_MM * MM_TO_PT;
export const LABEL_HEIGHT_PT = LABEL_HEIGHT_MM * MM_TO_PT;

export const MODES = [
  { id: 'checklist', label: 'Etiqueta com checklist', perPage: 2 },
  { id: 'standard', label: 'Etiqueta padrão', perPage: 4 },
];

export const DEFAULT_MODE_ID = MODES[0].id;

export const ERROR_MESSAGES = {
  invalidFile: 'Arquivo inválido',
  encrypted: 'PDF protegido por senha',
  generic: 'Falha ao gerar, tente novamente',
};

export const STATUS_KIND = {
  idle: 'idle',
  ok: 'ok',
  warn: 'warn',
  err: 'err',
};

export const OUTPUT_FILE_PREFIX = 'etiquetas_100x150';

export const mmToPt = (mm) => mm * MM_TO_PT;

