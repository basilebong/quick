import * as v from "valibot";
import { SLUG_REGEX } from "./reserved-slugs.ts";

declare const brand: unique symbol;
export type Brand<T, B> = T & { readonly [brand]: B };

export const UserIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("UserId"));
export type UserId = v.InferOutput<typeof UserIdSchema>;
export const parseUserId = (raw: unknown): UserId => v.parse(UserIdSchema, raw);

export const OAuthConsentIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("OAuthConsentId"));
export type OAuthConsentId = v.InferOutput<typeof OAuthConsentIdSchema>;
export const parseOAuthConsentId = (raw: unknown): OAuthConsentId =>
  v.parse(OAuthConsentIdSchema, raw);

export const AppIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("AppId"));
export type AppId = v.InferOutput<typeof AppIdSchema>;
export const parseAppId = (raw: unknown): AppId => v.parse(AppIdSchema, raw);

export const AppSlugSchema = v.pipe(v.string(), v.regex(SLUG_REGEX), v.brand("AppSlug"));
export type AppSlug = v.InferOutput<typeof AppSlugSchema>;
export const parseAppSlug = (raw: unknown): AppSlug => v.parse(AppSlugSchema, raw);

export const DeploymentIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("DeploymentId"));
export type DeploymentId = v.InferOutput<typeof DeploymentIdSchema>;
export const parseDeploymentId = (raw: unknown): DeploymentId => v.parse(DeploymentIdSchema, raw);

export const ShareLinkIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("ShareLinkId"));
export type ShareLinkId = v.InferOutput<typeof ShareLinkIdSchema>;
export const parseShareLinkId = (raw: unknown): ShareLinkId => v.parse(ShareLinkIdSchema, raw);

export const AppRecordIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("AppRecordId"));
export type AppRecordId = v.InferOutput<typeof AppRecordIdSchema>;
export const parseAppRecordId = (raw: unknown): AppRecordId => v.parse(AppRecordIdSchema, raw);

export const AppFileIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("AppFileId"));
export type AppFileId = v.InferOutput<typeof AppFileIdSchema>;
export const parseAppFileId = (raw: unknown): AppFileId => v.parse(AppFileIdSchema, raw);

export const AccessLogIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("AccessLogId"));
export type AccessLogId = v.InferOutput<typeof AccessLogIdSchema>;
export const parseAccessLogId = (raw: unknown): AccessLogId => v.parse(AccessLogIdSchema, raw);

export const AccessTokenIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("AccessTokenId"));
export type AccessTokenId = v.InferOutput<typeof AccessTokenIdSchema>;
export const parseAccessTokenId = (raw: unknown): AccessTokenId => v.parse(AccessTokenIdSchema, raw);

export const SsoCodeIdSchema = v.pipe(v.string(), v.minLength(1), v.brand("SsoCodeId"));
export type SsoCodeId = v.InferOutput<typeof SsoCodeIdSchema>;
export const parseSsoCodeId = (raw: unknown): SsoCodeId => v.parse(SsoCodeIdSchema, raw);
