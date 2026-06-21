import { GlobeIcon, LinkSimpleIcon } from "@phosphor-icons/react";
import type { ShareMode } from "@quick/core/shared";
import { match } from "ts-pattern";

import { Badge } from "@/components/ui/badge";

export const ShareModeBadge = ({ mode }: { mode: ShareMode }): React.ReactElement =>
  match(mode)
    .with("google", () => (
      <Badge variant="secondary">
        <GlobeIcon size={12} weight="fill" />
        Google
      </Badge>
    ))
    .with("link", () => (
      <Badge variant="secondary">
        <LinkSimpleIcon size={12} weight="fill" />
        Link
      </Badge>
    ))
    .exhaustive();
