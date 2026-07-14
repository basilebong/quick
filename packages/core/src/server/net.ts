// The real client IP as seen by our own trusted proxy (Caddy), which is the ONLY
// hop in front of the app. Caddy appends that peer to the END of X-Forwarded-For,
// so the last entry is trustworthy; earlier entries are client-supplied and can be
// spoofed. Never take the first entry for anything that gets stored or logged.
export const clientIpFromXff = (xff: string | undefined): string | null => {
  if (xff === undefined) return null;
  const parts = xff.split(",");
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = (parts[i] ?? "").trim();
    if (ip !== "") return ip;
  }
  return null;
};
