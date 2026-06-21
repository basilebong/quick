import { LightningIcon, SignOutIcon } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useOwner } from "@/lib/owner";

type DashboardLayoutProps = {
  children: ReactNode;
};

const initialOf = (owner: { email: string; name: string }): string => {
  const source = owner.name.trim().length > 0 ? owner.name.trim() : owner.email;
  return source[0]?.toUpperCase() ?? "·";
};

export const DashboardLayout = ({ children }: DashboardLayoutProps): React.ReactElement => {
  const owner = useOwner();
  const router = useRouter();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    router.navigate({ to: "/sign-in" });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-border border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary">
              <LightningIcon size={16} weight="fill" className="text-primary-foreground" />
            </span>
            <span className="font-semibold text-foreground tracking-tight">Quick</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              to="/tokens"
              className={cn(
                "rounded-md px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                "[&.active]:text-foreground",
              )}
            >
              Tokens
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="grid size-9 place-items-center rounded-full bg-secondary font-medium text-secondary-foreground text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Account menu"
              >
                {initialOf(owner)}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">{owner.name || "Owner"}</span>
                  <span className="font-normal text-muted-foreground text-xs">{owner.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <SignOutIcon size={16} />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {children}
      </main>
    </div>
  );
};
