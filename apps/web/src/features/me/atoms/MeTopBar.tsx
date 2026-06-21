import type { ReactElement } from "react";

export const MeTopBar = (): ReactElement => (
  <header className="shrink-0 bg-white px-5 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3">
    <h1 className="font-semibold text-2xl text-slate-900 tracking-tight">Me</h1>
  </header>
);
