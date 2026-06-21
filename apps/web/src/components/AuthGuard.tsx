import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useEffect } from "react";
import { match } from "ts-pattern";

import { NotOwnerScreen } from "@/features/auth/NotOwnerScreen";
import { Spinner } from "@/features/auth/atoms/Spinner";
import { useSession } from "@/lib/auth-client";
import { fetchMe } from "@/lib/me-api";
import { OwnerProvider } from "@/lib/owner";

type AuthGuardProps = {
  children: ReactNode;
};

const LoadingScreen = (): ReactElement => (
  <main className="flex min-h-dvh flex-col bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
    <output
      aria-label="Checking sign-in"
      className="-mt-12 flex flex-1 items-center justify-center"
    >
      <Spinner size={24} color="#0f172a" />
    </output>
  </main>
);

export const AuthGuard = ({ children }: AuthGuardProps): ReactElement => {
  const router = useRouter();
  const session = useSession();
  const sessionSettled = !session.isPending && !session.isRefetching;
  const hasSession = session.data !== null && session.error === null;
  const needsSignIn = sessionSettled && !hasSession;

  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: hasSession,
    staleTime: 60_000,
  });

  const redirectToSignIn = needsSignIn || me.data?.kind === "unauthorized";

  useEffect(() => {
    if (redirectToSignIn) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.navigate({ to: "/sign-in", search: { next }, replace: true });
    }
  }, [redirectToSignIn, router]);

  if (!hasSession || me.isPending || me.data === undefined) {
    return <LoadingScreen />;
  }

  const sessionEmail = session.data?.user.email;

  return match(me.data)
    .with({ kind: "owner" }, ({ user }) => <OwnerProvider value={user}>{children}</OwnerProvider>)
    .with({ kind: "forbidden" }, () =>
      sessionEmail === undefined ? <NotOwnerScreen /> : <NotOwnerScreen email={sessionEmail} />,
    )
    .with({ kind: "unauthorized" }, () => <LoadingScreen />)
    .exhaustive();
};
