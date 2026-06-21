import { ArrowLeftIcon, KeyIcon } from "@phosphor-icons/react";
import type { AccessTokenView } from "@quick/app-hosting/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelative } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";
import { fetchTokens, revokeToken } from "@/lib/tokens-api";

import { CreateTokenDrawer } from "./CreateTokenDrawer";

const RevokeTokenButton = ({ token }: { token: AccessTokenView }): React.ReactElement => {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => revokeToken(token.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
      toast.success("Token revoked");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't revoke the token.");
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
          <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
          <AlertDialogDescription>
            Any CLI using {token.label.length > 0 ? `“${token.label}”` : "this token"} will stop
            working immediately. This can't be undone.
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

export const TokensScreen = (): React.ReactElement => {
  const tokens = useQuery({ queryKey: queryKeys.tokens, queryFn: fetchTokens });
  const active = tokens.data?.filter((token) => token.revokedAt === null) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link to="/">
            <ArrowLeftIcon size={16} />
            Apps
          </Link>
        </Button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl text-foreground tracking-tight">Access tokens</h1>
          <CreateTokenDrawer />
        </div>
        <p className="text-muted-foreground text-sm">
          Personal access tokens authenticate the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">quick</code> CLI for deploys.
        </p>
      </div>

      {tokens.isPending ? (
        <div className="h-24 animate-pulse rounded-xl border bg-card" />
      ) : tokens.isError ? (
        <p className="py-6 text-center text-muted-foreground text-sm">Couldn't load tokens.</p>
      ) : active.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary">
              <KeyIcon size={24} weight="fill" className="text-secondary-foreground" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground">No tokens yet</p>
              <p className="max-w-xs text-muted-foreground text-sm">
                Create a token to authenticate the CLI on a machine.
              </p>
            </div>
            <CreateTokenDrawer />
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">
                    {token.label.length > 0 ? token.label : "Untitled"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(token.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelative(token.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RevokeTokenButton token={token} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};
