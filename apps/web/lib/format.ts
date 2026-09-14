export const formatSize = (bytes: number) =>
  bytes < 1e6
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
