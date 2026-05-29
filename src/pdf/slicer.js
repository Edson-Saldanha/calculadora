import { LABEL_HEIGHT_PT } from '../core/constants.js';

export function getSlicesForPage(size, modeId) {
  const width = Number(size?.width) || 0;
  const height = Number(size?.height) || 0;

  if (width <= 0 || height <= 0) {
    return [];
  }

  if (modeId === 'standard') {
    const halfW = width / 2;
    const halfH = height / 2;
    return [
      { x: 0, y: halfH, w: halfW, h: halfH },
      { x: halfW, y: halfH, w: halfW, h: halfH },
      { x: 0, y: 0, w: halfW, h: halfH },
      { x: halfW, y: 0, w: halfW, h: halfH },
    ];
  }

  if (modeId === 'checklist') {
    const halfW = width / 2;
    const sliceH = Math.min(height, LABEL_HEIGHT_PT);
    const topSliceY = Math.max(0, height - sliceH);
    return [
      { x: 0, y: topSliceY, w: halfW, h: sliceH },
      { x: halfW, y: topSliceY, w: halfW, h: sliceH },
    ];
  }

  return [];
}

