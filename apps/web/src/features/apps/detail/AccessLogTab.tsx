import type { AccessLogEntry, AppSummary } from "@quick/app-hosting/shared";
import { useQuery } from "@tanstack/react-query";

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
import { fetchAccessLog } from "@/lib/links-api";
import { queryKeys } from "@/lib/query-keys";

const whoOf = (entry: AccessLogEntry): string => {
  if (entry.userId !== null) return entry.userId;
  if (entry.linkId !== null) return `link ${entry.linkId}`;
  return "—";
};

export const AccessLogTab = ({ app }: { app: AppSummary }): React.ReactElement => {
  const log = useQuery({
    queryKey: queryKeys.accessLog(app.id),
    queryFn: () => fetchAccessLog(app.id),
  });

  if (log.isPending) {
    return <div className="h-24 animate-pulse rounded-xl border bg-card" />;
  }
  if (log.isError) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        Couldn't load the access log.
      </p>
    );
  }
  if (log.data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No access events yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>Path</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {log.data.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatRelative(entry.createdAt)}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{entry.event}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{entry.mode}</TableCell>
              <TableCell className="max-w-[10rem] truncate font-mono text-xs">
                {whoOf(entry)}
              </TableCell>
              <TableCell className="max-w-[12rem] truncate font-mono text-muted-foreground text-xs">
                {entry.path}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
