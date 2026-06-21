# Mobile-first checklist — pre-merge gate

Every new/modified component MUST pass before merge.

## Design rule (the meta-rule)

Designed for 360×780 first. Desktop adapts UP via `sm:`, `md:`, `lg:`.
If a component "works on mobile after some tweaks," it failed.
If you reached for `Dialog` on a mobile screen, you failed.

## Layout
- [ ] 360×780 layout is the base; breakpoints scale up.
- [ ] Primary actions in BOTTOM half of screen.
- [ ] Bottom nav: `pb-[env(safe-area-inset-bottom)]`.
- [ ] Top bar in PWA: `pt-[env(safe-area-inset-top)]`.
- [ ] `min-h-dvh` not `min-h-screen`.

## Modals
- [ ] Drawer (Vaul) for any modal below `sm`.
- [ ] If desktop also needs a modal, ResponsiveDialog pattern:
      Drawer < `sm`, Dialog ≥ `sm`.
- [ ] Drawer footer buttons stack vertically.

## Touch
- [ ] Every tappable ≥ 44×44 CSS px (`min-h-11 min-w-11`).
- [ ] No `:hover` as the only interaction.
- [ ] Adjacent buttons separated by ≥ 8px.

## Inputs
- [ ] Base font ≥ 16px (`text-base`) to prevent iOS zoom.
- [ ] `inputmode`, `autocomplete`, `autocapitalize` always set.
- [ ] `autoFocus` only inside an opened Drawer/Dialog; never on page load.

## State
- [ ] Mutations optimistic; rollback via TanStack Query.
- [ ] `transition()` from `@quick/app-*/shared` used for optimistic
      computation — do not hand-roll.
- [ ] Errors toast via Sonner; no silent failures.
- [ ] Loading = skeleton matching final layout (no shift).

## Offline
- [ ] GETs work from TanStack Query cache offline.
- [ ] Mutations queue via Workbox Background Sync.
- [ ] Online/offline indicator visible.

## PWA
- [ ] Manifest icons (192, 512, 512-maskable) present.
- [ ] apple-touch-icon + apple-mobile-web-app meta present.
- [ ] Service worker autoUpdate enabled.
