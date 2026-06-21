import { paletteFor } from "@quick/app-grocery/ui";
import type { ReactElement } from "react";

type MeAvatarProps = {
  userKey: string;
  initial: string;
  size?: number;
};

export const MeAvatar = ({ userKey, initial, size = 56 }: MeAvatarProps): ReactElement => {
  const palette = paletteFor(userKey);
  return (
    <div
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: palette.bg,
        color: palette.fg,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initial}
    </div>
  );
};
