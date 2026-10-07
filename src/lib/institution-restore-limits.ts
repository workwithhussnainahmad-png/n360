// Pure constants shared with Proxy: no database, ZIP or Node-only imports.
export const MAX_RESTORE_ZIP_BYTES = 16 * 1024 * 1024;
export const MAX_RESTORE_DATA_BYTES = 64 * 1024 * 1024;
export const MAX_RESTORE_ROWS = 100_000;
export const MAX_RESTORE_UPLOAD_BYTES = MAX_RESTORE_ZIP_BYTES + 16 * 1024;
