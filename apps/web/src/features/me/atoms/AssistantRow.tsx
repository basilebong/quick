import { PlugsConnectedIcon } from "@phosphor-icons/react";
import type { ReactElement } from "react";

type AssistantRowProps = {
  name: string;
  connectedLabel: string;
  onRevoke: () => void;
};

export const AssistantRow = ({
  name,
  connectedLabel,
  onRevoke,
}: AssistantRowProps): ReactElement => (
  <div className="flex items-center gap-3 px-5 py-3.5">
    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100">
      <PlugsConnectedIcon size={18} className="text-slate-500" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium text-[15px] text-slate-900">{name}</div>
      <div className="mt-0.5 truncate text-[12px] text-slate-500">{connectedLabel}</div>
    </div>
    <button
      type="button"
      onClick={onRevoke}
      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 px-3 font-medium text-[12px] text-slate-600 transition active:bg-slate-50"
    >
      Revoke
    </button>
  </div>
);
