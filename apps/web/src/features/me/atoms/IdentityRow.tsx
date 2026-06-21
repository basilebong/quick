import type { ReactElement } from "react";
import { MeAvatar } from "./MeAvatar";

type IdentityRowProps = {
  userKey: string;
  name: string;
  email: string;
  initial: string;
};

export const IdentityRow = ({ userKey, name, email, initial }: IdentityRowProps): ReactElement => (
  <div className="bg-white">
    <div className="flex items-center gap-4 px-5 py-5">
      <MeAvatar userKey={userKey} initial={initial} size={56} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-[17px] text-slate-900">{name}</div>
        <div className="mt-0.5 truncate text-[13px] text-slate-500">{email}</div>
      </div>
    </div>
  </div>
);
