export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = units[unitIndex] ?? "KB";
  return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
};

export const formatDate = (epochMs: number): string =>
  new Date(epochMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const formatRelative = (epochMs: number | null): string => {
  if (epochMs === null) return "never";
  const diffMs = epochMs - Date.now();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < hour) return formatter.format(Math.round(diffMs / minute), "minute");
  if (abs < day) return formatter.format(Math.round(diffMs / hour), "hour");
  return formatter.format(Math.round(diffMs / day), "day");
};
