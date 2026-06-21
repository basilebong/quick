# UI component rules — shadcn/ui + Vaul

## Where components live

- shadcn primitives in `apps/web/src/components/ui/` — installed via
  `bunx shadcn@latest add <name>`. Owned by us; edit freely.
- App-shell + layout components in `apps/web/src/components/`.
- Feature components re-used across entry-points: `packages/app-*/src/ui/`.
- Feature wiring (imports state, calls hooks): `apps/web/src/features/`.

## Modals — Drawer is the default

```tsx
// WRONG on mobile-first:
<Dialog>
  <DialogContent>...</DialogContent>
</Dialog>

// RIGHT:
<Drawer>
  <DrawerContent>...</DrawerContent>
</Drawer>

// RIGHT when desktop also gets a centered modal:
<ResponsiveDialog>
  <ResponsiveDialogContent>...</ResponsiveDialogContent>
</ResponsiveDialog>
// (Drawer < `sm`, Dialog ≥ `sm`. Pattern in shadcn/ui docs.)
```

## Toasts

Use Sonner via `<Toaster />` mounted once at the root, then
`toast.success("...")`, `toast.error("...")`. Default position is
bottom-center on mobile, top-right on desktop. Don't override unless
designing for a specific surface.

## Icons — Phosphor

`@phosphor-icons/react`. Import per-icon (tree-shakeable):
`import { HeartIcon, PlusIcon } from "@phosphor-icons/react"`. Standard sizes:
`size={20}` for inline, `size={24}` for buttons, `size={16}` for hints.
Use `weight="regular"` (default), `weight="bold"` for emphasis,
`weight="fill"` for active/selected states. Don't import the full icon
library; per-icon imports are tree-shaken.

Important: shadcn's generated components ship with `lucide-react` imports.
After `bunx shadcn add <name>`, swap any
`import { Foo } from "lucide-react"` to
`import { FooIcon } from "@phosphor-icons/react"` and replace
`className="size-4"` with `size={16}`. Don't leave a mixed icon set in the
repo.

## Radix primitives — never reimplement from scratch

This is rule 13 in the root CLAUDE.md, expanded with examples.

### BAD — writing a dropdown from scratch

```tsx
// DO NOT DO THIS
function MyDropdown({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  return (
    <div ref={ref}>
      <button onClick={() => setOpen(!open)}>Menu</button>
      {open && <div>{items.map(i => <div onClick={...}>{i}</div>)}</div>}
    </div>
  );
}
```

Missing: focus trap, arrow-key navigation, escape-to-close, `aria-expanded`,
`aria-haspopup`, `role="menu"`, scroll lock, return-focus on close, typeahead.
You will not add these; they will not be caught in review; you will ship an
accessibility regression.

### GOOD — use shadcn (which wraps Radix)

```bash
bunx shadcn@latest add dropdown-menu
```

```tsx
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

function MyDropdown({ items }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {items.map(i => <DropdownMenuItem key={i.id}>{i.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### When shadcn doesn't have it — wrap Radix directly

```bash
bun add @radix-ui/react-toolbar
```

Write a thin styled wrapper in `apps/web/src/components/ui/toolbar.tsx`
that re-exports the Radix primitives with our Tailwind classes. Look at
existing shadcn components for the wrapper pattern.

### Mobile note

For modal-like primitives below `sm`, use Vaul (Drawer/Sheet) instead of
Radix Dialog directly. Vaul wraps Radix Dialog under the hood, so a11y
is preserved while you get the mobile gestures and snap points.

### Allowed exceptions

- **Sonner** (toasts) — own implementation, fine.
- **Framer Motion** (animations) — no a11y surface for the layout itself.
- **Pure layout** components (e.g., `AppShell`, `CardGrid`) — no
  interactive state, no Radix needed.

If you think you've found another exception, ask Basile first.

## Class merging

Always use `cn()` from `@/lib/cn` for conditional classes. Direct
template-literal string concatenation in `className` is a bug — it
breaks Tailwind's IntelliSense and merge logic.

## Forms

TanStack Form + Valibot via Standard Schema. Form field components live
in `apps/web/src/components/form/` (Field, FormItem, FormLabel, FormError
— shadcn-style wrappers around TanStack Form primitives).

## Adding a new shadcn component

1. `cd apps/web && bunx shadcn@latest add <name>`
2. Review the generated file — apply our Tailwind v4 conventions
3. If it needs mobile tweaks (most do for buttons/inputs:
   `min-h-12` instead of `min-h-9` defaults), edit in place
4. Commit
