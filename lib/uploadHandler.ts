/**
 * Local-first file upload pipeline.
 *
 * Files are stored in the `files` table with sha256 dedup.
 * The IPC handler (files:upload) handles:
 * - sha256 computation
 * - Duplicate detection via UNIQUE(deal_id, sha256)
 * - Disk storage at ~/Library/Application Support/<app>/transaction-docs/{deal_id}/
 * - files table insertion
 * - audit_log entry
 */
export const uploadFileLocal = async (
  dealId: string,
  file: File,
  categoryKey: string,
  onProgress?: (msg: string) => void
) => {
  try {
    onProgress?.('Saving file...');
    const buffer = await file.arrayBuffer();
    const result = await window.electronAPI.files.uploadFile(dealId, categoryKey, file.name, buffer);

    onProgress?.('File saved.');
    return result;
  } catch (error) {
    console.error('Local file upload failed:', error);
    throw error;
  }
};
