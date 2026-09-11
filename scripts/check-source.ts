#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { TSAsExpression, TSTypeAssertion } from "@oxc-project/types";
import { parseSync, Visitor } from "oxc-parser";

type Violation = {
  file: string;
  line: number;
  col: number;
  rule: "no-bare-as";
  message: string;
};

const args = process.argv.slice(2);

const collectFiles = (): string[] => {
  if (args.length > 0) return args;
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const out: string[] = [];
  for (const f of glob.scanSync(".")) {
    if (/(^|\/)(node_modules|dist|build|coverage|drizzle|\.git)\//.test(f)) continue;
    if (f.endsWith(".d.ts")) continue;
    out.push(f);
  }
  return out;
};

const isAsConst = (typeAnnotation: TSAsExpression["typeAnnotation"]): boolean =>
  typeAnnotation.type === "TSTypeReference" &&
  typeAnnotation.typeName.type === "Identifier" &&
  typeAnnotation.typeName.name === "const";

// oxc reports byte offsets. Positions land on ASCII syntax (`as`, `<`), so a
// byte offset is always also a valid split point between UTF-8 characters.
const lineAndColumnAt = (buf: Buffer, byteOffset: number): { line: number; col: number } => {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < byteOffset; i++) {
    if (buf[i] === 0x0a) {
      line++;
      lineStart = i + 1;
    }
  }
  const col = buf.subarray(lineStart, byteOffset).toString("utf8").length + 1;
  return { line, col };
};

const checkFile = (file: string): Violation[] => {
  const buf = readFileSync(file);
  const result = parseSync(file, buf.toString("utf8"), { sourceType: "module" });

  if (result.errors.length > 0) {
    const messages = result.errors.map((e) => e.message).join("; ");
    throw new Error(`${file}: failed to parse for check-source: ${messages}`);
  }

  const violations: Violation[] = [];

  const visitor = new Visitor({
    TSAsExpression(node: TSAsExpression) {
      if (isAsConst(node.typeAnnotation)) return;
      const pos = lineAndColumnAt(buf, node.typeAnnotation.start);
      violations.push({
        file,
        ...pos,
        rule: "no-bare-as",
        message: "'as' type assertion forbidden; only 'as const' is allowed",
      });
    },
    TSTypeAssertion(node: TSTypeAssertion) {
      const pos = lineAndColumnAt(buf, node.start);
      violations.push({
        file,
        ...pos,
        rule: "no-bare-as",
        message: "angle-bracket type assertion forbidden",
      });
    },
  });
  visitor.visit(result.program);

  return violations;
};

const files = collectFiles();
const all: Violation[] = [];
for (const file of files) {
  all.push(...checkFile(file));
}

const cwd = process.cwd();
for (const v of all) {
  const rel = relative(cwd, v.file);
  console.error(`${rel}:${v.line}:${v.col}  [${v.rule}]  ${v.message}`);
}

if (all.length > 0) {
  console.error(`\ncheck-source: ${all.length} violation(s) across ${files.length} file(s)`);
  process.exit(1);
}

console.log(`check-source: ok (${files.length} files)`);
