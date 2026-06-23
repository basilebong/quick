import { type Icon, KeyIcon, SignOutIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
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
import { useOwner } from "@/lib/owner";

type NavItem = {
  to: "/" | "/tokens";
  label: string;
  icon: Icon;
  exact: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Apps", icon: SquaresFourIcon, exact: true },
  { to: "/tokens", label: "Tokens", icon: KeyIcon, exact: false },
];

export const ownerInitial = (owner: { email: string; name: string }): string => {
  const source = owner.name.trim().length > 0 ? owner.name.trim() : owner.email;
  return source[0]?.toUpperCase() ?? "·";
};

type AccountMenuProps = {
  trigger: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "end";
};

export const AccountMenu = ({
  trigger,
  side = "bottom",
  align = "end",
}: AccountMenuProps): React.ReactElement => {
  const owner = useOwner();
  const router = useRouter();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    router.navigate({ to: "/sign-in" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={8} className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{owner.name || "Owner"}</span>
          <span className="truncate font-normal text-muted-foreground text-xs">{owner.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()}>
          <SignOutIcon size={16} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
