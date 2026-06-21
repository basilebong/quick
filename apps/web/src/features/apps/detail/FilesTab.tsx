import type { AppFileMeta } from "@quick/app-files/shared";
import type { AppSummary } from "@quick/app-hosting/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteFile, fetchFiles } from "@/lib/files-api";
import { formatBytes, formatRelative } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";

import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

const FileRow = ({ app, file }: { app: AppSummary; file: AppFileMeta }): React.ReactElement => {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteFile(app.id, file.path),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.files(app.id) });
      toast.success("File deleted");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete the file.");
    },
  });

  return (
    <TableRow>
      <TableCell className="max-w-[14rem] truncate font-medium">{file.path}</TableCell>
      <TableCell className="text-muted-foreground">{file.contentType}</TableCell>
      <TableCell className="text-muted-foreground">{formatBytes(file.sizeBytes)}</TableCell>
      <TableCell className="text-muted-foreground">{formatRelative(file.updatedAt)}</TableCell>
      <TableCell className="text-right">
        <ConfirmDeleteButton
          title="Delete this file?"
          description={
            <>
              Permanently delete <span className="font-mono">{file.path}</span>.
            </>
          }
          disabled={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      </TableCell>
    </TableRow>
  );
};

export const FilesTab = ({ app }: { app: AppSummary }): React.ReactElement => {
  const files = useQuery({
    queryKey: queryKeys.files(app.id),
    queryFn: () => fetchFiles(app.id),
  });

  if (files.isPending) {
    return <div className="h-24 animate-pulse rounded-xl border bg-card" />;
  }
  if (files.isError) {
    return <p className="py-6 text-center text-muted-foreground text-sm">Couldn't load files.</p>;
  }
  if (files.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No files yet. Files written by the app appear here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Path</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.data.map((file) => (
            <FileRow key={file.id} app={app} file={file} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
