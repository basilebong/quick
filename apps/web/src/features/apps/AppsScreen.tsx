import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { match } from "ts-pattern";

import { BottomNav } from "@/components/BottomNav";
import { cn } from "@/lib/cn";
import { APP_CATALOG, type AppEntry } from "./catalog.ts";

const TILE_BASE = "flex flex-col gap-2.5 rounded-2xl border p-3.5";

const AppTile = ({ entry }: { entry: AppEntry }): ReactElement => {
  const { icon: Icon, name, note } = entry;
  return match(entry.status)
    .with({ kind: "live" }, ({ to }) => (
      <Link
        to={to}
        className={cn(TILE_BASE, "border-slate-200/80 bg-white transition active:scale-[0.98]")}
      >
        <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white">
          <Icon size={20} weight="fill" />
        </span>
        <span>
          <span className="block font-semibold text-[14px] text-slate-900 leading-tight">
            {name}
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-400">{note}</span>
        </span>
      </Link>
    ))
    .with({ kind: "soon" }, () => (
      <div className={cn(TILE_BASE, "border-slate-200 border-dashed bg-slate-50/50")}>
        <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-300">
          <Icon size={20} weight="regular" />
        </span>
        <span>
          <span className="block font-semibold text-[14px] text-slate-400 leading-tight">
            {name}
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-400">{note}</span>
        </span>
      </div>
    ))
    .exhaustive();
};

export const AppsScreen = (): ReactElement => (
  <main className="flex h-dvh flex-col overflow-hidden bg-slate-50">
    <header className="shrink-0 bg-white px-5 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3">
      <h1 className="font-semibold text-2xl text-slate-900 tracking-tight">Apps</h1>
      <p className="mt-0.5 text-slate-500 text-sm">Everything in your home, one tap away</p>
    </header>
    <div className="flex-1 overflow-y-auto px-5 pt-5">
      <div className="grid grid-cols-3 gap-3">
        {APP_CATALOG.map((entry) => (
          <AppTile key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
    <BottomNav active="apps" />
  </main>
);
