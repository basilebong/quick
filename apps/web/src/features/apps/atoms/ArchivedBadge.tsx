import { ArchiveIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";

export const ArchivedBadge = (): React.ReactElement => (
  <Badge variant="warning">
    <ArchiveIcon size={12} weight="fill" />
    Archived
  </Badge>
);
