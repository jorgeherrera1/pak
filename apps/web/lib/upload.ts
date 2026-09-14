export const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Checks the declared size and presence of the file. By the time this runs,
 * `req.formData()` has already buffered the whole request body into memory.
 * Returns an error message, or null when acceptable.
 */
export function validatePdf(file: File | null): string | null {
  if (!file) return "no file";
  if (file.size > MAX_BYTES) return "larger than 50 MB";
  return null;
}

/** Magic-bytes check once the bytes are in memory. */
export function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}
