import { AppNameSchema, type AppSummary } from "@quick/app-hosting/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteApp, updateApp } from "@/lib/apps-api";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";

const RenameAppCard = ({ app }: { app: AppSummary }): React.ReactElement => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(app.name);
  const trimmed = name.trim();
  const valid = v.safeParse(AppNameSchema, name).success;
  const dirty = trimmed !== app.name;

  const rename = useMutation({
    mutationFn: (next: string) => updateApp(app.id, { name: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.app(app.id) });
      const previous = queryClient.getQueryData<AppSummary>(queryKeys.app(app.id));
      queryClient.setQueryData<AppSummary>(queryKeys.app(app.id), (old) =>
        old === undefined ? old : { ...old, name: next },
      );
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.app(app.id), context.previous);
      }
      toast.error(error instanceof ApiError ? error.message : "Couldn't rename the app.");
    },
    onSuccess: () => {
      toast.success("App renamed");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.app(app.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.apps });
    },
  });

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!valid || !dirty) return;
    rename.mutate(trimmed);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>App name</CardTitle>
        <CardDescription>
          The display name shown in the dashboard. The URL ({app.slug}) doesn't change.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-name">Name</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My App"
              autoComplete="off"
              autoCapitalize="words"
              inputMode="text"
              aria-invalid={name.length > 0 && !valid}
              className="text-base"
            />
            {name.length > 0 && !valid ? (
              <p className="text-destructive text-xs">Enter a name (1–80 characters).</p>
            ) : null}
          </div>
          <Button type="submit" size="lg" disabled={!valid || !dirty || rename.isPending}>
            {rename.isPending ? "Saving…" : "Save name"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export const SettingsTab = ({ app }: { app: AppSummary }): React.ReactElement => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => deleteApp(app.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.apps });
      toast.success("App deleted");
      router.navigate({ to: "/" });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete the app.");
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <RenameAppCard app={app} />

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete app</CardTitle>
          <CardDescription>
            Permanently delete <span className="font-medium text-foreground">{app.name}</span>, its
            deployments, links, files and data. This can't be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={remove.isPending}>
                Delete this app
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {app.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the app at <span className="font-mono">{app.slug}</span>{" "}
                  and everything in it. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => remove.mutate()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};
