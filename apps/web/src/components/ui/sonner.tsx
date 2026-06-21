import {
  CheckCircleIcon,
  InfoIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

type ThemeKind = ToasterProps["theme"];

const isThemeKind = (value: string): value is NonNullable<ThemeKind> =>
  value === "light" || value === "dark" || value === "system";

const Toaster = ({ ...props }: ToasterProps): React.ReactElement => {
  const { theme = "system" } = useTheme();
  const resolved: ThemeKind = isThemeKind(theme) ? theme : "system";

  const style: CSSProperties & Record<string, string> = {
    "--normal-bg": "var(--popover)",
    "--normal-text": "var(--popover-foreground)",
    "--normal-border": "var(--border)",
    "--border-radius": "var(--radius)",
  };

  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon size={16} weight="fill" />,
        info: <InfoIcon size={16} weight="fill" />,
        warning: <WarningIcon size={16} weight="fill" />,
        error: <WarningCircleIcon size={16} weight="fill" />,
        loading: <SpinnerGapIcon size={16} className="animate-spin" />,
      }}
      style={style}
      {...props}
    />
  );
};

export { Toaster };
