import { TrashIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

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

type ConfirmDeleteButtonProps = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
  triggerLabel?: string;
};

export const ConfirmDeleteButton = ({
  title,
  description,
  confirmLabel = "Delete",
  disabled = false,
  onConfirm,
  triggerLabel,
}: ConfirmDeleteButtonProps): React.ReactElement => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button
        variant="ghost"
        size={triggerLabel === undefined ? "icon-sm" : "sm"}
        className="size-9 text-destructive hover:text-destructive"
        disabled={disabled}
        aria-label={triggerLabel ?? "Delete"}
      >
        <TrashIcon size={16} />
        {triggerLabel === undefined ? null : triggerLabel}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-white hover:bg-destructive/90"
          onClick={onConfirm}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
