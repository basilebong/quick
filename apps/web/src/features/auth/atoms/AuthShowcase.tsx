import {
  LightningIcon,
  LockKeyIcon,
  LockSimpleIcon,
  StackIcon,
  TimerIcon,
} from "@phosphor-icons/react";

import { Wordmark } from "./Wordmark";

const features = [
  { Icon: LockKeyIcon, label: "Google-gated access" },
  { Icon: TimerIcon, label: "Share links that expire" },
  { Icon: StackIcon, label: "Immutable, versioned deploys" },
];

export const AuthShowcase = (): React.ReactElement => (
  <div className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_55%_at_22%_12%,rgba(56,189,248,0.12),transparent_60%)]"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_40%_at_32%_52%,rgba(255,255,255,0.05),transparent_70%)]"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)] [-webkit-mask-image:radial-gradient(circle_at_28%_30%,black,transparent_72%)] [background-size:34px_34px] [mask-image:radial-gradient(circle_at_28%_30%,black,transparent_72%)]"
    />

    <Wordmark
      tone="invert"
      className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 relative motion-safe:animate-in motion-safe:duration-700"
    />

    <div className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 relative motion-safe:animate-in motion-safe:delay-100 motion-safe:duration-700">
      <div className="relative inline-grid">
        <div
          aria-hidden
          className="-inset-5 pointer-events-none absolute rounded-[2rem] bg-sky-400/15 blur-2xl"
        />
        <div className="relative grid size-16 place-items-center rounded-3xl bg-white/[0.06] shadow-2xl shadow-black/40 ring-1 ring-white/10 ring-inset backdrop-blur-sm">
          <LightningIcon size={34} weight="fill" className="text-white" />
        </div>
      </div>

      <h2 className="mt-8 max-w-[20ch] text-balance font-semibold text-[34px] text-white leading-[1.1] tracking-[-0.02em] xl:text-[40px]">
        Ship static apps your clients can trust.
      </h2>
      <p className="mt-4 max-w-[42ch] text-[15px] text-slate-400 leading-relaxed">
        Deploy an immutable build and share it behind Google sign-in or a link that expires on your
        schedule — each app on its own secure origin.
      </p>

      <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pr-3.5 pl-3 text-[13px] text-slate-300">
        <LockSimpleIcon size={13} weight="fill" className="text-slate-400" />
        <span className="font-mono tracking-tight">acme-q3-demo.quick.app</span>
      </div>
    </div>

    <ul className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 relative space-y-3.5 motion-safe:animate-in motion-safe:delay-200 motion-safe:duration-700">
      {features.map(({ Icon, label }) => (
        <li key={label} className="flex items-center gap-3 text-[14px] text-slate-300">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10 ring-inset">
            <Icon size={16} weight="bold" className="text-slate-200" />
          </span>
          {label}
        </li>
      ))}
    </ul>
  </div>
);
