import { DEFAULT_MODE_ID } from './constants.js';

export const state = {
  file: null,
  modeId: DEFAULT_MODE_ID,
  processing: false,
  inputPages: 0,
  outputPages: 0,
  outputBytes: null,
  outputBlobUrl: '',
  startTime: 0,
};

export function resetOutput() {
  state.inputPages = 0;
  state.outputPages = 0;
  state.outputBytes = null;
  state.outputBlobUrl = '';
}

