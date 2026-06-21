import { Button } from "@/components/ui/button";

import { GoogleG } from "./atoms/GoogleG";

export const HandoffScreen = (): React.ReactElement => (
  <main className="flex min-h-dvh flex-col bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
    <div className="flex flex-1 flex-col items-center justify-center px-8">
      <div className="relative grid size-24 place-items-center">
        <svg
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: "1.4s" }}
          viewBox="0 0 100 100"
          aria-hidden
          role="presentation"
        >
          <title>Loading</title>
          <circle cx="50" cy="50" r="46" fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="#0f172a"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="72 220"
          />
        </svg>
        <div className="grid size-14 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <GoogleG size={26} />
        </div>
      </div>
      <div className="mt-7 font-medium text-[17px] text-slate-900">Opening Google…</div>
      <div className="mt-1.5 max-w-[260px] text-center text-[14px] text-slate-500">
        You'll come back here once you've signed in.
      </div>
    </div>
    <div className="px-6 pb-10">
      <Button
        variant="ghost"
        className="min-h-12 w-full rounded-2xl text-[15px] text-slate-500 hover:bg-slate-100"
      >
        Cancel
      </Button>
    </div>
  </main>
);
