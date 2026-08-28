export const VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);
export const SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES = Math.floor(3.5 * 1024 * 1024);
export const MAX_ESTIMATE_IMAGE_BYTES = 3 * 1024 * 1024;

export const IMAGE_TOO_LARGE_MESSAGE = 'The selected images are too large to analyze. Please use fewer images or smaller files.';

export type FileSizeLike = {
  size: number;
};

export function totalFileBytes(files: Iterable<FileSizeLike>) {
  let total = 0;
  for (const file of files) {
    total += file.size;
  }
  return total;
}

export function getPhotoSizeRejection(files: Iterable<FileSizeLike>) {
  const fileList = Array.from(files);

  if (fileList.some((file) => file.size > MAX_ESTIMATE_IMAGE_BYTES)) {
    return `Each photo must be ${formatBytes(MAX_ESTIMATE_IMAGE_BYTES)} or smaller.`;
  }

  if (totalFileBytes(fileList) > SAFE_ESTIMATE_REQUEST_BODY_LIMIT_BYTES) {
    return IMAGE_TOO_LARGE_MESSAGE;
  }

  return null;
}

export function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
