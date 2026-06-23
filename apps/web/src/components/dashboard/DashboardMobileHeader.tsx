import { Link } from "@tanstack/react-router";

import { Wordmark } from "@/components/Wordmark";
import { AccountMenu, ownerInitial } from "@/components/dashboard/nav";
import { cn } from "@/lib/cn";
import { useOwner } from "@/lib/owner";

export const DashboardMobileHeader = (): React.ReactElement => {
  const owner = useOwner();

  return (
    <header className="sticky top-0 z-40 border-border border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex min-h-11 items-center outline-none">
          <Wordmark size="sm" />
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            to="/tokens"
            className={cn(
              "flex min-h-11 items-center rounded-md px-3 font-medium text-muted-foreground text-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "[&.active]:text-foreground",
            )}
          >
            Tokens
          </Link>
          <AccountMenu
            align="end"
            trigger={
              <button
                type="button"
                aria-label="Account menu"
                className="grid size-11 place-items-center rounded-full bg-secondary font-medium text-secondary-foreground text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {ownerInitial(owner)}
              </button>
            }
          />
        </nav>
      </div>
    </header>
  );
};
