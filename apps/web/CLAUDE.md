# apps/web

React + Vite + TanStack + Tailwind v4 + PWA. Browser entry-point only.

## Hard rules
- May only import `@quick/*/shared` and `@quick/*/ui`. Importing
  `/server` or `/tools` from any file under `src/` is a build error and
  a review block.
- shadcn primitives live under `src/components/ui/` — installed via
  `bunx shadcn@latest add <name>`. Edit freely; we own the code.
- After `bunx shadcn add`, swap any `lucide-react` imports to
  `@phosphor-icons/react` (see `.claude/rules/ui.md`).
- Mobile-first is enforced (see `.claude/rules/mobile.md`). Drawer is the
  default modal pattern; centered Dialog is desktop-only.
- All interactive primitives wrap Radix (rule 13). No bespoke dropdowns,
  modals, menus, popovers.
- TanStack Router with file-based routing in `src/routes/`.
- `cn()` from `@/lib/cn` for all conditional classNames.

## Where things live
- `src/main.tsx`       — React entry + Toaster mount
- `src/router.tsx`     — TanStack Router setup
- `src/routes/`        — file-based routes
- `src/components/`    — AppShell + app-wide layout (no Radix needed)
- `src/components/ui/` — shadcn primitives (own copies, edit freely)
- `src/components/form/` — TanStack Form wrappers
- `src/features/<app>/` — feature wiring (imports `@quick/app-<app>/{shared,ui}`)
- `src/lib/`           — `cn`, `api`, `auth-client`
- `src/styles.css`     — `@import "tailwindcss";`
- `public/`            — PWA manifest, icons, apple-touch-icon
