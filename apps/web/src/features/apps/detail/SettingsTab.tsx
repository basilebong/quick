import type { AppSummary } from "@quick/app-hosting/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

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
import { deleteApp } from "@/lib/apps-api";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";

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
  );
};
