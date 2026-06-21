import { LockKeyIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { rejectedRoute } from "@/router";

import { Wordmark } from "./atoms/Wordmark";

export const RejectedScreen = (): React.ReactElement => {
  const router = useRouter();
  const search = rejectedRoute.useSearch();
  const email = search.email ?? "your account";

  const handleRetry = async (): Promise<void> => {
    await signOut();
    router.navigate({ to: "/sign-in" });
  };

  const handleBack = (): void => {
    router.navigate({ to: "/sign-in" });
  };

  return (
    <main className="flex min-h-dvh flex-col bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 flex-col px-6 pt-16 pb-10">
        <div className="flex flex-col items-start">
          <Wordmark />
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50">
              <LockKeyIcon size={16} weight="fill" className="text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[16px] text-slate-900">This isn't your home</div>
              <p className="mt-1 text-[14px] text-slate-500 leading-relaxed">
                <span className="font-medium text-slate-900">{email}</span> isn't on the household
                list.
              </p>
            </div>
          </div>
          <div className="mt-4 border-slate-100 border-t pt-4 text-[13px] text-slate-500 leading-relaxed">
            Ask whoever set this up to add your email, then try again.
          </div>
        </div>

        <div className="flex-1" />

        <div className="space-y-2.5">
          <Button
            onClick={handleRetry}
            className="min-h-12 w-full rounded-2xl bg-slate-900 font-medium text-base text-white hover:bg-slate-900/95"
          >
            Try a different account
          </Button>
          <Button
            onClick={handleBack}
            variant="ghost"
            className="min-h-12 w-full rounded-2xl text-[15px] text-slate-500 hover:bg-slate-100"
          >
            Back
          </Button>
        </div>
      </div>
    </main>
  );
};
