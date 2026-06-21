import * as v from "valibot";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: string | null;

  constructor(status: number, message: string, kind: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

const ErrorBodySchema = v.object({
  kind: v.optional(v.string()),
  message: v.optional(v.string()),
  error: v.optional(v.string()),
});

const errorFromBody = (status: number, raw: string): ApiError => {
  try {
    const parsed = v.parse(ErrorBodySchema, JSON.parse(raw));
    const message = parsed.message ?? parsed.error ?? raw ?? `HTTP ${status}`;
    return new ApiError(status, message, parsed.kind ?? parsed.error ?? null);
  } catch {
    return new ApiError(status, raw || `HTTP ${status}`, null);
  }
};

export const parseJson = async <T>(
  res: Response,
  schema: v.GenericSchema<unknown, T>,
): Promise<T> => {
  if (!res.ok) {
    throw errorFromBody(res.status, await res.text());
  }
  const raw: unknown = await res.json();
  return v.parse(schema, raw);
};

export const requestJson = async <T>(
  input: string,
  schema: v.GenericSchema<unknown, T>,
  init?: RequestInit,
): Promise<T> => {
  const res = await fetch(input, { credentials: "include", ...init });
  return parseJson(res, schema);
};

export const jsonBody = (value: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});
