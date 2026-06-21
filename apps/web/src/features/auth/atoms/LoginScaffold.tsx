import type { ReactNode } from "react";

import { Wordmark } from "./Wordmark";

type LoginScaffoldProps = {
  children: ReactNode;
  footnote?: boolean;
};

export const LoginScaffold = ({
  children,
  footnote = true,
}: LoginScaffoldProps): React.ReactElement => (
  <div className="flex flex-1 flex-col px-6 pt-24 pb-10">
    <div className="flex max-w-[19rem] flex-col items-start">
      <Wordmark />
      <h1 className="mt-10 text-balance font-semibold text-[30px] text-slate-900 leading-[1.12] tracking-[-0.02em]">
        Ship a folder. Get a URL.
      </h1>
      <p className="mt-3.5 text-pretty text-[15px] text-slate-500 leading-relaxed">
        Deploy static apps and share them with clients — behind Google sign-in or an expiring link.
      </p>
    </div>

    <div className="flex-1" />

    {children}

    {footnote ? (
      <p className="mx-auto mt-5 max-w-[260px] text-center text-[12px] text-slate-400 leading-snug">
        Owner access only · Sign in with the Google account that runs this instance.
      </p>
    ) : null}
  </div>
);
