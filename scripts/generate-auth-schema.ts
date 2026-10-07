#!/usr/bin/env bun
import {
  AUTH_SCHEMA_PATH,
  generateAuthSchema,
} from "../packages/core/src/server/auth/schema-generator.ts";

await Bun.write(AUTH_SCHEMA_PATH, generateAuthSchema());

console.info(`auth:generate: wrote ${AUTH_SCHEMA_PATH}`);
