import { execSync } from "node:child_process";

/**
 * Applies pending migrations to the isolated test database (non-destructive). Tests create their own
 * uniquely-named users and never depend on an empty database, so runs can accumulate data safely;
 * global invariants (ledger ↔ custodian reconciliation, audit chain) are asserted over everything.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://wasitx:wasitx_dev_only@127.0.0.1:5544/wasitx_test";
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
