// The client IP as seen by our own proxy. Only the entry our proxy contributes is
// trustworthy — every earlier one is client-supplied and can be spoofed — and a proxy
// contributes its peer at the END, whether it appends to an inbound header or (as our
// Caddyfile does) overwrites it outright. So: take the last entry, never the first.
// This holds only behind the bundled Caddy; run the container with no proxy in front
// and the whole header is attacker-controlled, so treat a logged IP as a hint, never
// as an authorization input.
export const clientIpFromXff = (xff: string | undefined): string | null => {
  if (xff === undefined) return null;
  const parts = xff.split(",");
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = (parts[i] ?? "").trim();
    if (ip !== "") return ip;
  }
  return null;
};
