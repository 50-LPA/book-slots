/**
 * Downloads a file with "Save As" dialog when supported (Chrome, Edge).
 * Call showSaveFilePicker FIRST to preserve user gesture (required by browser).
 * Falls back to opening in new tab so user can use Ctrl+S / File → Save As.
 */
export async function downloadWithSaveAs(url, suggestedName) {
  const name = suggestedName || 'download';

  if ('showSaveFilePicker' in window && window.isSecureContext) {
    try {
      // Must call showSaveFilePicker immediately while user gesture is active
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: 'PDF Document',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const blob = await res.blob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // Fallback: open in new tab so user can use Ctrl+S / File → Save As to choose location
  window.open(url, '_blank', 'noopener,noreferrer');
}
