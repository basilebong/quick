import type { AppSummary } from "@quick/app-hosting/shared";
import type { AppRecord } from "@quick/app-store/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";
import { deleteRecord, fetchRecords } from "@/lib/records-api";

import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

const previewData = (data: unknown): string => {
  try {
    const json = JSON.stringify(data);
    if (json === undefined) return "—";
    return json.length > 80 ? `${json.slice(0, 80)}…` : json;
  } catch {
    return "—";
  }
};

const RecordRow = ({ app, record }: { app: AppSummary; record: AppRecord }): React.ReactElement => {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteRecord(app.id, record.collection, record.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.records(app.id) });
      toast.success("Record deleted");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete the record.");
    },
  });

  return (
    <TableRow>
      <TableCell>
        <Badge variant="secondary">{record.collection}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs">{record.id}</TableCell>
      <TableCell className="max-w-[16rem] truncate font-mono text-muted-foreground text-xs">
        {previewData(record.data)}
      </TableCell>
      <TableCell className="text-muted-foreground">{formatRelative(record.updatedAt)}</TableCell>
      <TableCell className="text-right">
        <ConfirmDeleteButton
          title="Delete this record?"
          description={
            <>
              Permanently delete record <span className="font-mono">{record.id}</span> from{" "}
              <span className="font-medium">{record.collection}</span>.
            </>
          }
          disabled={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      </TableCell>
    </TableRow>
  );
};

export const DataTab = ({ app }: { app: AppSummary }): React.ReactElement => {
  const records = useQuery({
    queryKey: queryKeys.records(app.id),
    queryFn: () => fetchRecords(app.id),
  });

  if (records.isPending) {
    return <div className="h-24 animate-pulse rounded-xl border bg-card" />;
  }
  if (records.isError) {
    return <p className="py-6 text-center text-muted-foreground text-sm">Couldn't load records.</p>;
  }
  if (records.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No records yet. Data written by the app appears here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Collection</TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Preview</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.data.map((record) => (
            <RecordRow key={record.id} app={app} record={record} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
