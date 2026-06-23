const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:18vh auto;padding:0 1.25rem;color:#1a1a1a;line-height:1.5}h1{font-size:1.4rem;margin:0 0 .5rem}p{color:#555;margin:0}code{background:#f2f2f2;padding:.1rem .35rem;border-radius:.25rem}</style></head><body>${body}</body></html>`;

export const notFoundAppPage = (label: string): string =>
  page(
    "No app here",
    `<h1>No app here</h1><p>There is no app named <code>${escapeHtml(label)}</code> on this Quick instance.</p>`,
  );

export const linkAccessPage = (kind: "expired" | "missing"): string =>
  kind === "expired"
    ? page(
        "Link expired",
        "<h1>This link has expired or been revoked</h1><p>Ask the owner to send you a new one.</p>",
      )
    : page(
        "Link required",
        "<h1>A share link is required</h1><p>This app is shared privately by secret link. Open the full link you were given.</p>",
      );

export const googleAccessDeniedPage = (email: string): string =>
  page(
    "Access denied",
    `<h1>You don't have access to this app</h1><p>You're signed in as <code>${escapeHtml(email)}</code>, which isn't on this app's allowlist. Ask the owner to add you.</p>`,
  );
