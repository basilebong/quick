import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { AllowedEmailSchema, type AppSummary, MAX_ALLOWED_EMAILS } from "@quick/app-hosting/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateApp } from "@/lib/apps-api";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";

const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((email) => set.has(email));
};

export const AllowedEmailsCard = ({ app }: { app: AppSummary }): React.ReactElement => {
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState<string[]>(app.allowedEmails);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dirty = !sameSet(emails, app.allowedEmails);

  const save = useMutation({
    mutationFn: (next: string[]) => updateApp(app.id, { allowedEmails: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.app(app.id) });
      const previous = queryClient.getQueryData<AppSummary>(queryKeys.app(app.id));
      queryClient.setQueryData<AppSummary>(queryKeys.app(app.id), (old) =>
        old === undefined ? old : { ...old, allowedEmails: next },
      );
      return { previous };
    },
    onError: (err, _next, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.app(app.id), context.previous);
      }
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the allowlist.");
    },
    onSuccess: () => {
      toast.success("Allowlist updated");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.app(app.id) });
    },
  });

  const addEmail = (event: React.FormEvent): void => {
    event.preventDefault();
    const parsed = v.safeParse(AllowedEmailSchema, draft);
    if (!parsed.success) {
      setError("Enter a valid email address.");
      return;
    }
    if (emails.includes(parsed.output)) {
      setError("That email is already on the list.");
      setDraft("");
      return;
    }
    if (emails.length >= MAX_ALLOWED_EMAILS) {
      setError(`At most ${MAX_ALLOWED_EMAILS} emails.`);
      return;
    }
    setEmails([...emails, parsed.output]);
    setDraft("");
    setError(null);
  };

  const removeEmail = (email: string): void => {
    setEmails(emails.filter((e) => e !== email));
    setError(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who can view</CardTitle>
        <CardDescription>
          {emails.length === 0
            ? "Any Google account that signs in can view this app. Add emails to restrict access."
            : "Only these Google accounts can view this app."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={addEmail} className="flex flex-col gap-1.5" noValidate>
          <div className="flex items-start gap-2">
            <Input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              placeholder="client@example.com"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={error !== null}
              aria-label="Email to allow"
              className="text-base"
            />
            <Button type="submit" variant="secondary" className="min-h-11 shrink-0">
              <PlusIcon size={20} />
              Add
            </Button>
          </div>
          {error !== null ? <p className="text-destructive text-xs">{error}</p> : null}
        </form>

        {emails.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {emails.map((email) => (
              <li
                key={email}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <span className="truncate text-foreground text-sm">{email}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEmail(email)}
                  aria-label={`Remove ${email}`}
                >
                  <XIcon size={18} />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <Button
          type="button"
          size="lg"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(emails)}
        >
          {save.isPending ? "Saving…" : "Save allowlist"}
        </Button>
      </CardContent>
    </Card>
  );
};
