import type { ReactElement, ReactNode } from "react";

type SectionLabelProps = {
  children: ReactNode;
  right?: ReactNode;
};

export const SectionLabel = ({ children, right }: SectionLabelProps): ReactElement => (
  <div className="flex items-baseline justify-between bg-slate-50 px-5 pt-6 pb-2">
    <div className="font-semibold text-[11px] text-slate-400 uppercase tracking-[0.12em]">
      {children}
    </div>
    {right}
  </div>
);
