import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { match } from "ts-pattern";

import { signInWithGoogle } from "@/lib/auth-client";
import { signInRoute } from "@/router";

import { GoogleButton } from "./atoms/GoogleButton";
import { LoginScaffold } from "./atoms/LoginScaffold";

type Status =
  | { kind: "idle" }
  | { kind: "signing-in" }
  | { kind: "error"; reason: "google_unreachable" | "google_cancelled" };

const errorCopy = {
  google_unreachable: {
    title: "Couldn't reach Google",
    body: "Check your connection and try again.",
  },
  google_cancelled: {
    title: "Sign-in was cancelled",
    body: "Tap below to try again.",
  },
} as const;

const sameOriginNext = (next: string | undefined): string => {
  if (next === undefined) return "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
};

export const SignInScreen = (): React.ReactElement => {
  const search = signInRoute.useSearch();
  const next = sameOriginNext(search.next);
  const initial: Status =
    search.error === undefined ? { kind: "idle" } : { kind: "error", reason: search.error };
  const [status, setStatus] = useState<Status>(initial);

  const handleSignIn = async (): Promise<void> => {
    setStatus({ kind: "signing-in" });
    try {
      await signInWithGoogle(next);
    } catch {
      setStatus({ kind: "error", reason: "google_unreachable" });
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <LoginScaffold footnote={status.kind !== "error"}>
        {match(status)
          .with({ kind: "error" }, ({ reason }) => {
            const copy = errorCopy[reason];
            return (
              <>
                <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <WarningCircleIcon
                    size={18}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-rose-600"
                  />
                  <div className="text-[13px] leading-snug">
                    <div className="font-medium text-rose-900">{copy.title}</div>
                    <div className="mt-0.5 text-rose-700/80">{copy.body}</div>
                  </div>
                </div>
                <GoogleButton variant="primary" label="Try again" onClick={handleSignIn} />
              </>
            );
          })
          .with({ kind: "signing-in" }, () => <GoogleButton loading />)
          .with({ kind: "idle" }, () => <GoogleButton onClick={handleSignIn} />)
          .exhaustive()}
      </LoginScaffold>
    </main>
  );
};
