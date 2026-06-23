import type { ReactNode } from "react";

import { Wordmark } from "@/components/Wordmark";

type LoginScaffoldProps = {
  children: ReactNode;
  footnote?: boolean;
};

export const LoginScaffold = ({
  children,
  footnote = true,
}: LoginScaffoldProps): React.ReactElement => (
  <div className="flex flex-1 flex-col px-6 pt-24 pb-10 sm:items-center sm:justify-center sm:px-8 sm:py-12 lg:items-start lg:px-14 xl:px-20">
    <div className="motion-safe:lg:fade-in-0 flex w-full flex-1 flex-col sm:max-w-sm sm:flex-none motion-safe:lg:animate-in motion-safe:lg:duration-500">
      <div className="flex max-w-[19rem] flex-col items-start lg:max-w-none">
        <Wordmark className="lg:hidden" />
        <h1 className="mt-10 text-balance font-semibold text-[30px] text-slate-900 leading-[1.12] tracking-[-0.02em] lg:mt-0">
          Ship a folder. Get a URL.
        </h1>
        <p className="mt-3.5 text-pretty text-[15px] text-slate-500 leading-relaxed">
          Deploy static apps and share them with clients — behind Google sign-in or an expiring
          link.
        </p>
      </div>

      <div className="flex-1 sm:hidden" />

      <div className="sm:mt-9">{children}</div>

      {footnote ? (
        <p className="mx-auto mt-5 max-w-[260px] text-center text-[12px] text-slate-400 leading-snug lg:mx-0 lg:text-left">
          Owner access only · Sign in with the Google account that runs this instance.
        </p>
      ) : null}
    </div>
  </div>
);
