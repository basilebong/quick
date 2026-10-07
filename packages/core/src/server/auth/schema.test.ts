import { describe, expect, test } from "bun:test";
import { initGetFieldName, initGetModelName } from "better-auth/adapters";
import { getAuthTables } from "better-auth/db";
import { getTableColumns, is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { withTestAuth } from "../test/with-test-auth.ts";
import * as authSchema from "./schema.ts";

type AuthTables = ReturnType<typeof getAuthTables>;
type FieldAttribute = AuthTables[string]["fields"][string];

const SQLITE_COLUMN_TYPE = {
  string: "SQLiteText",
  number: "SQLiteInteger",
  boolean: "SQLiteBoolean",
  date: "SQLiteTimestamp",
  json: "SQLiteTextJson",
  "string[]": "SQLiteTextJson",
  "number[]": "SQLiteTextJson",
} as const;

const expectedColumnType = (attr: FieldAttribute): string =>
  typeof attr.type === "string" ? SQLITE_COLUMN_TYPE[attr.type] : "SQLiteText";

const schemaTables = new Map(
  Object.entries(authSchema).flatMap(([key, value]): [string, SQLiteTable][] =>
    is(value, SQLiteTable) ? [[key, value]] : [],
  ),
);

const tableName = (table: SQLiteTable): string => getTableConfig(table).name;

const diffAgainstBetterAuth = (tables: AuthTables): string[] => {
  const getModelName = initGetModelName({ schema: tables, usePlural: true });
  const getFieldName = initGetFieldName({ schema: tables, usePlural: true });
  const problems: string[] = [];
  const expectedTableKeys = new Set<string>();

  for (const [model, { fields, disableMigrations }] of Object.entries(tables)) {
    if (disableMigrations === true) continue;
    const tableKey = getModelName(model);
    expectedTableKeys.add(tableKey);
    const table = schemaTables.get(tableKey);
    if (table === undefined) {
      problems.push(`${tableKey}: table missing (better-auth model "${model}")`);
      continue;
    }

    const columns = getTableColumns(table);
    const { foreignKeys, indexes } = getTableConfig(table);
    const expectedColumnKeys = new Set(["id"]);

    const { id } = columns;
    if (id?.primary !== true) problems.push(`${tableKey}.id: must be the primary key`);

    for (const [field, attr] of Object.entries(fields)) {
      const key = getFieldName({ model, field });
      expectedColumnKeys.add(key);
      const column = columns[key];
      const at = `${tableKey}.${key}`;
      if (column === undefined) {
        problems.push(`${at}: column missing (${JSON.stringify(attr.type)})`);
        continue;
      }

      const type = expectedColumnType(attr);
      if (column.columnType !== type) {
        problems.push(`${at}: expected ${type}, schema has ${column.columnType}`);
      }
      if (type === "SQLiteTimestamp" && !("mode" in column && column.mode === "timestamp_ms")) {
        problems.push(`${at}: expected { mode: "timestamp_ms" }`);
      }
      if (Array.isArray(attr.type) && column.enumValues?.join() !== attr.type.join()) {
        problems.push(`${at}: expected enum [${attr.type.join(", ")}]`);
      }

      const required = attr.required !== false;
      if (column.notNull !== required) {
        problems.push(`${at}: better-auth ${required ? "requires NOT NULL" : "allows NULL"}`);
      }
      if (column.isUnique !== (attr.unique === true)) {
        problems.push(`${at}: better-auth unique=${attr.unique === true}`);
      }

      const fk = foreignKeys.find((f) => f.reference().columns.some((c) => c.name === column.name));
      if (attr.references === undefined) {
        if (fk !== undefined) problems.push(`${at}: unexpected foreign key`);
      } else {
        const { model: refModel, field: refField, onDelete = "cascade" } = attr.references;
        const refTable = schemaTables.get(getModelName(refModel));
        const refColumn =
          refTable === undefined
            ? undefined
            : getTableColumns(refTable)[getFieldName({ model: refModel, field: refField })];
        const ref = fk?.reference();
        if (
          ref === undefined ||
          refTable === undefined ||
          refColumn === undefined ||
          tableName(ref.foreignTable) !== tableName(refTable) ||
          ref.foreignColumns[0]?.name !== refColumn.name
        ) {
          problems.push(`${at}: expected foreign key to ${refModel}.${refField}`);
        } else if (fk?.onDelete !== onDelete) {
          problems.push(`${at}: expected ON DELETE ${onDelete}, schema has ${fk?.onDelete}`);
        }
      }

      const indexed = indexes.some((i) => {
        const [first] = i.config.columns;
        return first !== undefined && "name" in first && first.name === column.name;
      });
      if (attr.index === true && attr.unique !== true && !indexed) {
        problems.push(`${at}: better-auth expects an index`);
      }
    }

    for (const key of Object.keys(columns)) {
      if (!expectedColumnKeys.has(key)) {
        problems.push(`${tableKey}.${key}: column unknown to better-auth`);
      }
    }
  }

  for (const key of schemaTables.keys()) {
    if (!expectedTableKeys.has(key)) problems.push(`${key}: table unknown to better-auth`);
  }

  return problems;
};

describe("auth schema", () => {
  test("matches the tables better-auth and its plugins expect", async () => {
    await withTestAuth({}, async ({ auth }) => {
      expect(diffAgainstBetterAuth(getAuthTables(auth.options))).toEqual([]);
    });
  });

  test("keeps one account row per provider identity", () => {
    const unique = getTableConfig(authSchema.accounts).indexes.find(
      (i) => i.config.name === "accounts_provider_account_unique",
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns.map((c) => ("name" in c ? c.name : ""))).toEqual([
      "provider_id",
      "account_id",
    ]);
  });
});
