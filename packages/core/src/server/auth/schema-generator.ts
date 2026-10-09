import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initGetFieldName, initGetModelName } from "better-auth/adapters";
import { getAuthTables } from "better-auth/db";
import { createDb } from "../db/index.ts";
import { createAuth } from "./index.ts";

export type AuthTables = ReturnType<typeof getAuthTables>;
type FieldAttribute = AuthTables[string]["fields"][string];
type ScalarFieldType = Extract<FieldAttribute["type"], string>;

export type ExtraIndex = {
  readonly name: string;
  readonly unique: boolean;
  readonly fields: readonly string[];
};

const here = dirname(fileURLToPath(import.meta.url));

export const AUTH_SCHEMA_PATH = resolve(here, "schema.ts");

const BIOME_BIN = resolve(here, "../../../../../node_modules/.bin/biome");

// better-auth's field model only declares single-column indexes; composite ones live here.
export const AUTH_SCHEMA_EXTRA_INDEXES: Readonly<Record<string, readonly ExtraIndex[]>> = {
  account: [
    { name: "accounts_provider_account_unique", unique: true, fields: ["providerId", "accountId"] },
  ],
};

const SQLITE_COLUMN = {
  string: (name) => `text("${name}")`,
  number: (name) => `integer("${name}")`,
  boolean: (name) => `integer("${name}", { mode: "boolean" })`,
  date: (name) => `integer("${name}", { mode: "timestamp_ms" })`,
  json: (name) => `text("${name}", { mode: "json" })`,
  "string[]": (name) => `text("${name}", { mode: "json" })`,
  "number[]": (name) => `text("${name}", { mode: "json" })`,
} satisfies Record<ScalarFieldType, (name: string) => string>;

// Same word split as better-auth's own `toSnakeCase` (@better-auth/core/utils/string),
// which upstream's generator uses for table and column names.
const WORD = /[\p{Ll}\d]+|\p{Lu}+(?!\p{Ll})|\p{Lu}[\p{Ll}\d]+|\p{Lo}+/gu;

export const toSnakeCase = (name: string): string =>
  (name.replace(/['\u2019]/g, "").match(WORD) ?? []).map((w) => w.toLowerCase()).join("_");

const renderColumnType = (name: string, attr: FieldAttribute): string =>
  typeof attr.type === "string"
    ? SQLITE_COLUMN[attr.type](name)
    : `text("${name}", { enum: ${JSON.stringify(attr.type)} })`;

// Function defaults and onUpdate are applied by better-auth's adapter on every write
// (`withApplyDefault`, @better-auth/core/dist/db/adapter/utils.mjs), so only literal
// defaults need a SQL DEFAULT. `$onUpdate` also covers writes that bypass better-auth.
const renderDefault = (attr: FieldAttribute): string =>
  attr.defaultValue === undefined ||
  attr.defaultValue === null ||
  typeof attr.defaultValue === "function"
    ? ""
    : `.default(${JSON.stringify(attr.defaultValue)})`;

const renderOnUpdate = (attr: FieldAttribute): string =>
  attr.onUpdate !== undefined && attr.type === "date" ? ".$onUpdate(() => new Date())" : "";

export const renderAuthSchema = (
  tables: AuthTables,
  extraIndexes: Readonly<Record<string, readonly ExtraIndex[]>> = AUTH_SCHEMA_EXTRA_INDEXES,
): string => {
  const getModelName = initGetModelName({ schema: tables, usePlural: true });
  const getFieldName = initGetFieldName({ schema: tables, usePlural: true });
  const imports = new Set(["sqliteTable", "text"]);
  const blocks: string[] = [];

  for (const model of Object.keys(extraIndexes)) {
    if (tables[model] === undefined) throw new Error(`extra index on unknown model "${model}"`);
  }

  for (const [model, { fields, disableMigrations }] of Object.entries(tables)) {
    if (disableMigrations === true) continue;
    const tableKey = getModelName(model);
    const columns = [`id: text("id").primaryKey()`];
    const indexes: string[] = [];

    for (const [field, attr] of Object.entries(fields)) {
      const key = getFieldName({ model, field });
      const type = renderColumnType(toSnakeCase(key), attr);
      if (type.startsWith("integer")) imports.add("integer");
      const reference =
        attr.references === undefined
          ? ""
          : `.references(() => ${getModelName(attr.references.model)}.${getFieldName({
              model: attr.references.model,
              field: attr.references.field,
            })}, { onDelete: "${attr.references.onDelete ?? "cascade"}" })`;
      columns.push(
        `${key}: ${type}${renderDefault(attr)}${renderOnUpdate(attr)}` +
          `${attr.required !== false ? ".notNull()" : ""}${attr.unique === true ? ".unique()" : ""}` +
          reference,
      );
      if (attr.index === true && attr.unique !== true) {
        imports.add("index");
        indexes.push(`index("${tableKey}_${key}_idx").on(table.${key})`);
      }
    }

    for (const extra of extraIndexes[model] ?? []) {
      const on = extra.fields.map((field) => {
        if (fields[field] === undefined) {
          throw new Error(`extra index "${extra.name}" on unknown field ${model}.${field}`);
        }
        return `table.${getFieldName({ model, field })}`;
      });
      const kind = extra.unique ? "uniqueIndex" : "index";
      imports.add(kind);
      indexes.push(`${kind}("${extra.name}").on(${on.join(", ")})`);
    }

    const extraConfig = indexes.length === 0 ? "" : `, (table) => [${indexes.join(", ")}]`;
    blocks.push(
      `export const ${tableKey} = sqliteTable("${toSnakeCase(tableKey)}", {${columns.join(", ")}}${extraConfig});`,
    );
  }

  return [
    `import { ${[...imports].sort().join(", ")} } from "drizzle-orm/sqlite-core";`,
    ...blocks,
  ].join("\n\n");
};

export const formatWithBiome = (code: string, filePath: string): string => {
  const result = Bun.spawnSync([BIOME_BIN, "check", "--write", `--stdin-file-path=${filePath}`], {
    stdin: new TextEncoder().encode(code),
  });
  if (result.exitCode !== 0) {
    throw new Error(`biome failed on generated ${filePath}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
};

export const generateAuthSchema = (): string => {
  const auth = createAuth({
    db: createDb({ path: ":memory:" }),
    baseURL: "http://localhost",
    secret: "schema-generation-placeholder-secret-not-used-at-runtime",
    google: { clientId: "placeholder", clientSecret: "placeholder" },
    allowedEmails: new Set(),
    useSecureCookies: false,
    mcpResource: "http://localhost/mcp",
  });
  return formatWithBiome(renderAuthSchema(getAuthTables(auth.options)), AUTH_SCHEMA_PATH);
};
