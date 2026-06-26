import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import * as v from "valibot";

import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AppDetailScreen } from "@/features/apps/AppDetailScreen";
import { AppsScreen } from "@/features/apps/AppsScreen";
import { CreateAppScreen } from "@/features/apps/CreateAppScreen";
import { ConsentScreen } from "@/features/auth/ConsentScreen";
import { SignInScreen } from "@/features/auth/SignInScreen";

const Dashboard = ({ children }: { children: ReactNode }): React.ReactElement => (
  <AuthGuard>
    <DashboardLayout>{children}</DashboardLayout>
  </AuthGuard>
);

export const rootRoute = createRootRoute({
  component: AppShell,
});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <Dashboard>
      <AppsScreen />
    </Dashboard>
  ),
});

const signInSearchSchema = v.object({
  error: v.optional(v.picklist(["google_unreachable", "google_cancelled"])),
  next: v.optional(v.string()),
});

export const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: (search): v.InferOutput<typeof signInSearchSchema> =>
    v.parse(signInSearchSchema, search),
  component: SignInScreen,
});

const consentSearchSchema = v.object({
  client_id: v.optional(v.string()),
  scope: v.optional(v.string()),
  redirect_uri: v.optional(v.string()),
});

export const consentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/consent",
  validateSearch: (search): v.InferOutput<typeof consentSearchSchema> =>
    v.parse(consentSearchSchema, search),
  component: ConsentScreen,
});

export const newAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/apps/new",
  component: () => (
    <Dashboard>
      <CreateAppScreen />
    </Dashboard>
  ),
});

export const appDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/apps/$appId",
  component: () => {
    const { appId } = appDetailRoute.useParams();
    return (
      <Dashboard>
        <AppDetailScreen appId={appId} />
      </Dashboard>
    );
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  consentRoute,
  newAppRoute,
  appDetailRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
