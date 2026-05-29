export function createPdfBlobUrl(bytes) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

export function revokePdfBlobUrl(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function downloadPdfFromUrl(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

