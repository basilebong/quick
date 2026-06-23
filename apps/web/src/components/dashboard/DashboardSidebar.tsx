import { CaretUpDownIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { Wordmark } from "@/components/Wordmark";
import { AccountMenu, NAV_ITEMS, ownerInitial } from "@/components/dashboard/nav";
import { cn } from "@/lib/cn";
import { useOwner } from "@/lib/owner";

export const DashboardSidebar = (): React.ReactElement => {
  const owner = useOwner();

  return (
    <aside className="relative hidden shrink-0 overflow-hidden bg-slate-950 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_45%_at_28%_0%,rgba(56,189,248,0.13),transparent_62%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [-webkit-mask-image:radial-gradient(circle_at_26%_6%,black,transparent_70%)] [background-size:32px_32px] [mask-image:radial-gradient(circle_at_26%_6%,black,transparent_70%)]"
      />

      <div className="relative flex flex-1 flex-col p-4 pt-6">
        <Link
          to="/"
          className="mb-8 flex w-fit items-center rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
        >
          <Wordmark tone="invert" size="sm" />
        </Link>

        <p className="mb-2 px-3 font-medium text-[11px] text-slate-500 uppercase tracking-[0.09em]">
          Workspace
        </p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: ItemIcon, exact }) => (
            <Link
              key={to}
              to={to}
              {...(exact ? { activeOptions: { exact: true } } : {})}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium text-[15px] text-slate-300 outline-none transition-colors",
                "hover:bg-white/[0.06] hover:text-white",
                "focus-visible:ring-2 focus-visible:ring-sky-400/40",
                "[&.active]:bg-white/[0.1] [&.active]:text-white [&.active]:ring-1 [&.active]:ring-white/10 [&.active]:ring-inset",
              )}
            >
              <ItemIcon size={20} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-white/[0.07] border-t pt-3">
          <AccountMenu
            side="top"
            align="start"
            trigger={
              <button
                type="button"
                aria-label="Account menu"
                className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-sky-400/40"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 font-medium text-[13px] text-white ring-1 ring-white/10 ring-inset">
                  {ownerInitial(owner)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-[13px] text-white leading-tight">
                    {owner.name || "Owner"}
                  </span>
                  <span className="truncate text-[12px] text-slate-400 leading-tight">
                    {owner.email}
                  </span>
                </span>
                <CaretUpDownIcon size={15} className="shrink-0 text-slate-500" />
              </button>
            }
          />
        </div>
      </div>
    </aside>
  );
};
