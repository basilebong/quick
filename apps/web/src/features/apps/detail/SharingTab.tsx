import type { AppSummary, ShareLinkView } from "@quick/app-hosting/shared";
import type { ShareMode } from "@quick/core/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { match } from "ts-pattern";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateApp } from "@/lib/apps-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { fetchLinks, revokeLink } from "@/lib/links-api";
import { queryKeys } from "@/lib/query-keys";

import { CreateLinkDrawer } from "./CreateLinkDrawer";

const LinkStatusBadge = ({ link }: { link: ShareLinkView }): React.ReactElement => {
  if (link.revokedAt !== null) return <Badge variant="outline">Revoked</Badge>;
  if (link.expired) return <Badge variant="warning">Expired</Badge>;
  if (link.active) return <Badge variant="success">Active</Badge>;
  return <Badge variant="outline">Inactive</Badge>;
};

const RevokeLinkButton = ({
  app,
  link,
}: { app: AppSummary; link: ShareLinkView }): React.ReactElement => {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => revokeLink(app.id, link.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.links(app.id) });
      toast.success("Link revoked");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't revoke the link.");
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
          <AlertDialogDescription>
            Anyone using {link.label.length > 0 ? `“${link.label}”` : "this link"} will lose access
            immediately. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => revoke.mutate()}
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const SharingTab = ({ app }: { app: AppSummary }): React.ReactElement => {
  const queryClient = useQueryClient();

  const setMode = useMutation({
    mutationFn: (mode: ShareMode) => updateApp(app.id, { shareMode: mode }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.app(app.id) });
      toast.success(
        updated.shareMode === "google" ? "Now requires Google sign-in" : "Now shared by link",
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't change sharing.");
    },
  });

  const links = useQuery({
    queryKey: queryKeys.links(app.id),
    queryFn: () => fetchLinks(app.id),
    enabled: app.shareMode === "link",
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
          <CardDescription>How viewers reach this app.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={app.shareMode}
            disabled={setMode.isPending}
            onValueChange={(value) => setMode.mutate(value === "link" ? "link" : "google")}
          >
            <SelectTrigger aria-label="Share mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google sign-in</SelectItem>
              <SelectItem value="link">Secret link</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {match(app.shareMode)
        .with("google", () => (
          <p className="px-1 text-muted-foreground text-sm">
            Viewers sign in with Google. Switch to secret link to share with people who don't have
            an account.
          </p>
        ))
        .with("link", () => (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-foreground">Links</h2>
              <CreateLinkDrawer app={app} />
            </div>

            {links.isPending ? (
              <div className="h-20 animate-pulse rounded-xl border bg-card" />
            ) : links.isError ? (
              <p className="py-4 text-center text-muted-foreground text-sm">Couldn't load links.</p>
            ) : links.data.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No links yet. Create one to share this app.
                </CardContent>
              </Card>
            ) : (
              <Card className="py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.data.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell className="font-medium">
                          {link.label.length > 0 ? link.label : "Untitled"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(link.expiresAt)}
                        </TableCell>
                        <TableCell>
                          <LinkStatusBadge link={link} />
                        </TableCell>
                        <TableCell className="text-right">
                          {link.revokedAt === null ? (
                            <RevokeLinkButton app={app} link={link} />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        ))
        .exhaustive()}
    </div>
  );
};
