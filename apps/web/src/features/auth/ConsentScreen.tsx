import { PlugsConnectedIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { submitOAuthConsent } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { consentRoute } from "@/router";

import { Wordmark } from "./atoms/Wordmark";

type Status =
  | { kind: "idle" }
  | { kind: "submitting"; decision: "allow" | "deny" }
  | { kind: "error"; message: string };

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "Your name and picture",
  email: "Your email address",
  offline_access: "Stay connected without signing in again",
};

const describeScope = (scope: string): string => SCOPE_LABELS[scope] ?? scope;

const hostFromRedirect = (redirectUri: string | undefined): string | null => {
  if (redirectUri === undefined) return null;
  try {
    return new URL(redirectUri).host;
  } catch {
    return null;
  }
};

export const ConsentScreen = (): React.ReactElement => {
  const { client_id, scope, redirect_uri } = consentRoute.useSearch();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const appLabel = hostFromRedirect(redirect_uri) ?? client_id;

  const scopes = (scope ?? "").split(" ").filter((value) => value.length > 0);
  const submitting = status.kind === "submitting";

  const decide = async (accept: boolean): Promise<void> => {
    setStatus({ kind: "submitting", decision: accept ? "allow" : "deny" });
    try {
      window.location.href = await submitOAuthConsent(accept);
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 flex-col px-6 pt-16 pb-10">
        <Wordmark />

        <div className="mt-10 inline-grid size-12 place-items-center rounded-2xl bg-slate-900 text-white">
          <PlugsConnectedIcon size={24} weight="fill" />
        </div>

        <h1 className="mt-6 font-semibold text-[26px] text-slate-900 leading-[1.15] tracking-tight">
          Connect an app?
        </h1>
        <p className="mt-3 max-w-[300px] text-[15px] text-slate-500 leading-relaxed">
          {appLabel === undefined
            ? "An application wants to connect to your Quick account."
            : `“${appLabel}” wants to connect to your Quick account.`}
        </p>

        {scopes.length > 0 ? (
          <ul className="mt-6 space-y-2.5">
            {scopes.map((value) => (
              <li key={value} className="flex items-start gap-2.5 text-[15px] text-slate-700">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                {describeScope(value)}
              </li>
            ))}
          </ul>
        ) : null}

        {status.kind === "error" ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
            <WarningCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-rose-600" />
            <div className="text-[13px] text-rose-800 leading-snug">{status.message}</div>
          </div>
        ) : null}

        <div className="flex-1" />

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            onClick={() => decide(true)}
            disabled={submitting}
            className={cn(
              "min-h-12 w-full rounded-2xl bg-slate-900 font-medium text-base text-white",
              "hover:bg-slate-900/95 active:scale-[0.99]",
            )}
          >
            {status.kind === "submitting" && status.decision === "allow" ? "Connecting…" : "Allow"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => decide(false)}
            disabled={submitting}
            className={cn(
              "min-h-12 w-full rounded-2xl border-slate-300 bg-white font-medium text-base text-slate-700",
              "hover:bg-slate-50 active:scale-[0.99]",
            )}
          >
            {status.kind === "submitting" && status.decision === "deny" ? "Cancelling…" : "Deny"}
          </Button>
        </div>
      </div>
    </main>
  );
};
