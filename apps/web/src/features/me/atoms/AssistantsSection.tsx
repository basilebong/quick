import type { ConnectedAssistant } from "@quick/core/shared";
import { PlugsIcon } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { AssistantRow } from "./AssistantRow";
import { SectionLabel } from "./SectionLabel";

const connectedLabel = (ms: number): string => {
  if (ms <= 0) return "Recently connected";
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
  return `Connected ${formatted}`;
};

type AssistantsSectionProps = {
  isPending: boolean;
  isError: boolean;
  assistants: ConnectedAssistant[];
  onRevoke: (assistant: ConnectedAssistant) => void;
  onRetry: () => void;
};

const SkeletonRow = (): ReactElement => (
  <div className="flex items-center gap-3 px-5 py-3.5">
    <div className="size-9 shrink-0 animate-pulse rounded-xl bg-slate-100" />
    <div className="min-w-0 flex-1">
      <div className="h-3.5 w-28 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-100" />
    </div>
  </div>
);

export const AssistantsSection = ({
  isPending,
  isError,
  assistants,
  onRevoke,
  onRetry,
}: AssistantsSectionProps): ReactElement => {
  if (isPending) {
    return (
      <>
        <SectionLabel>Connected assistants</SectionLabel>
        <div className="divide-y divide-slate-100 bg-white">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <SectionLabel>Connected assistants</SectionLabel>
        <div className="bg-white px-5 py-6">
          <p className="text-[13px] text-slate-500">Couldn't load your connected assistants.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex min-h-11 items-center font-medium text-[13px] text-slate-900"
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  if (assistants.length === 0) {
    return (
      <>
        <SectionLabel>Connected assistants</SectionLabel>
        <div className="bg-white px-5 py-8">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100">
              <PlugsIcon size={22} weight="duotone" className="text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[15px] text-slate-900">No assistants connected</div>
              <div className="mt-0.5 text-[13px] text-slate-500 leading-relaxed">
                When you sign Claude or another MCP client into Quick, it'll appear here.
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SectionLabel
        right={
          <span className="font-medium text-[11px] text-slate-400 tabular-nums">
            {assistants.length}
          </span>
        }
      >
        Connected assistants
      </SectionLabel>
      <div className="divide-y divide-slate-100 bg-white">
        {assistants.map((assistant) => (
          <AssistantRow
            key={assistant.id}
            name={assistant.name}
            connectedLabel={connectedLabel(assistant.connectedAt)}
            onRevoke={() => onRevoke(assistant)}
          />
        ))}
      </div>
      <div className="bg-white px-5 pt-2 pb-1">
        <p className="text-[12px] text-slate-400 leading-relaxed">
          Each connection can see and change anything in your house. Revoke any you don't recognise.
        </p>
      </div>
    </>
  );
};
