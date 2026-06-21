import { ShieldIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

import { Wordmark } from "./atoms/Wordmark";

type NotOwnerScreenProps = {
  email?: string;
};

export const NotOwnerScreen = ({ email }: NotOwnerScreenProps): React.ReactElement => {
  const router = useRouter();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    router.navigate({ to: "/sign-in" });
  };

  return (
    <main className="flex min-h-dvh flex-col bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 flex-col px-6 pt-16 pb-10">
        <Wordmark />

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50">
              <ShieldIcon size={16} weight="fill" className="text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[16px] text-slate-900">Not authorized</div>
              <p className="mt-1 text-[14px] text-slate-500 leading-relaxed">
                {email === undefined ? (
                  "This account is not an owner of this Quick instance."
                ) : (
                  <>
                    <span className="font-medium text-slate-900">{email}</span> is not an owner of
                    this Quick instance.
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 border-slate-100 border-t pt-4 text-[13px] text-slate-500 leading-relaxed">
            Sign in with the Google account that runs this instance, or ask the owner to add your
            email.
          </div>
        </div>

        <div className="flex-1" />

        <Button
          onClick={handleSignOut}
          className="min-h-12 w-full rounded-2xl bg-slate-900 font-medium text-base text-white hover:bg-slate-900/95"
        >
          Sign out
        </Button>
      </div>
    </main>
  );
};
