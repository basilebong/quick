import { isUsableSlug } from "@quick/core/shared";
import * as v from "valibot";

export const ShareModeSchema = v.picklist(["google", "link"]);

export const AppNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80));

export const SlugSchema = v.pipe(
  v.string(),
  v.check(isUsableSlug, "Slug must be a valid, non-reserved DNS label"),
);

export const LabelSchema = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), "");

export const MAX_ALLOWED_EMAILS = 200;

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const AllowedEmailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.maxLength(254),
  v.email(),
);

export const AllowedEmailsSchema = v.pipe(
  v.array(AllowedEmailSchema),
  v.transform((emails) => [...new Set(emails)]),
  v.maxLength(MAX_ALLOWED_EMAILS),
);

export const CreateAppInputSchema = v.object({
  slug: SlugSchema,
  name: AppNameSchema,
  shareMode: ShareModeSchema,
});
export type CreateAppInput = v.InferOutput<typeof CreateAppInputSchema>;

export const UpdateAppInputSchema = v.pipe(
  v.object({
    name: v.optional(AppNameSchema),
    shareMode: v.optional(ShareModeSchema),
    allowedEmails: v.optional(AllowedEmailsSchema),
  }),
  v.check(
    (i) => i.name !== undefined || i.shareMode !== undefined || i.allowedEmails !== undefined,
    "Provide a name, shareMode, or allowedEmails to update",
  ),
);
export type UpdateAppInput = v.InferOutput<typeof UpdateAppInputSchema>;

export const CreateLinkInputSchema = v.object({
  label: LabelSchema,
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type CreateLinkInput = v.InferOutput<typeof CreateLinkInputSchema>;
