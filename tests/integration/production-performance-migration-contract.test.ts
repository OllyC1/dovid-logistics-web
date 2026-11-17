import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261117021440_production_performance_rls_hardening.sql",
  "utf8",
).toLowerCase();

const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("production performance and RLS hardening migration contract", () => {
  it("adds exactly the advisor-reported foreign-key indexes", () => {
    expect(executableSql.match(/^create index if not exists /gm)).toHaveLength(101);
  });

  it("optimises every advisor-reported auth policy without broadening roles", () => {
    expect(executableSql.match(/^alter policy /gm)).toHaveLength(35);
    expect(executableSql.match(/ to authenticated/g)).toHaveLength(35);
    expect(executableSql).toContain("(select auth.uid())");
    expect(executableSql.replaceAll("(select auth.uid())", "")).not.toContain("auth.uid()");
  });

  it("contains no destructive or data-mutating statements", () => {
    expect(executableSql).not.toMatch(/\b(drop|truncate)\b/);
    expect(executableSql).not.toMatch(/\b(delete|insert|update)\s+/);
    expect(executableSql).not.toContain("alter table");
  });
});
