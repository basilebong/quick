import { useRouter } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useEffect } from "react";

import { Spinner } from "@/features/auth/atoms/Spinner";
import { useSession } from "@/lib/auth-client";

type AuthGuardProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

const DefaultFallback = (): ReactElement => (
  <main className="flex min-h-dvh flex-col bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
    <output
      aria-label="Checking sign-in"
      className="-mt-12 flex flex-1 items-center justify-center"
    >
      <Spinner size={24} color="#0f172a" />
    </output>
  </main>
);

export const AuthGuard = ({ children, fallback }: AuthGuardProps): ReactElement => {
  const router = useRouter();
  const session = useSession();
  const settled = !session.isPending && !session.isRefetching;
  const needsSignIn = settled && (session.data === null || session.error !== null);

  useEffect(() => {
    if (needsSignIn) {
      router.navigate({ to: "/sign-in", replace: true });
    }
  }, [needsSignIn, router]);

  if (!session.data) {
    return <>{fallback ?? <DefaultFallback />}</>;
  }
  return <>{children}</>;
};
