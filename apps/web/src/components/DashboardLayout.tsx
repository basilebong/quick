import type { ReactNode } from "react";

import { DashboardMobileHeader } from "@/components/dashboard/DashboardMobileHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

type DashboardLayoutProps = {
  children: ReactNode;
};

export const DashboardLayout = ({ children }: DashboardLayoutProps): React.ReactElement => (
  <div className="lg:flex">
    <DashboardSidebar />
    <div className="relative flex min-h-dvh min-w-0 flex-1 flex-col bg-[radial-gradient(120%_60%_at_50%_-10%,rgba(2,132,199,0.05),transparent_55%)]">
      <DashboardMobileHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] sm:px-6 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  </div>
);
