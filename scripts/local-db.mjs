#!/usr/bin/env node
// Starts/stops a project-local PostgreSQL cluster for development, using the
// PostgreSQL binaries already installed on the machine. The cluster lives in
// ./.pgdata, listens on 127.0.0.1 only, and uses SCRAM password auth with a
// development-only password. Production uses a managed Postgres (see docs/DEPLOYMENT.md).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PORT = process.env.WASITX_PG_PORT ?? "5544";
const USER = "wasitx";
const PASSWORD = "wasitx_dev_only"; // matches .env.example; never used outside local dev
const DATA = join(process.cwd(), ".pgdata");

function findBin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [
    process.env.PG_BIN && join(process.env.PG_BIN, exe),
    ...["17", "16", "15"].map((v) => `C:\\Program Files\\PostgreSQL\\${v}\\bin\\${exe}`),
    `/usr/lib/postgresql/16/bin/${exe}`,
    `/opt/homebrew/bin/${exe}`,
    `/usr/local/bin/${exe}`,
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Cannot find ${name}. Set PG_BIN to your PostgreSQL bin directory.`);
  return found;
}

function init() {
  if (existsSync(join(DATA, "PG_VERSION"))) return;
  const dir = mkdtempSync(join(tmpdir(), "wasitx-pg-"));
  const pwfile = join(dir, "pw");
  writeFileSync(pwfile, PASSWORD);
  try {
    execFileSync(
      findBin("initdb"),
      ["-D", DATA, "-U", USER, "--auth=scram-sha-256", `--pwfile=${pwfile}`, "-E", "UTF8", "--locale=C"],
      { stdio: "inherit" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function status() {
  return spawnSync(findBin("pg_ctl"), ["-D", DATA, "status"], { encoding: "utf8" }).status === 0;
}

function start() {
  init();
  if (status()) {
    console.log(`Postgres already running on 127.0.0.1:${PORT}`);
  } else {
    execFileSync(
      findBin("pg_ctl"),
      ["-D", DATA, "-l", join(DATA, "server.log"), "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`, "-w", "start"],
      // "ignore": on Windows the postmaster inherits stdio handles and would block us
      { stdio: "ignore" },
    );
  }
  for (const db of ["wasitx", "wasitx_test"]) {
    const env = { ...process.env, PGPASSWORD: PASSWORD };
    const exists = spawnSync(
      findBin("psql"),
      ["-h", "127.0.0.1", "-p", PORT, "-U", USER, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${db}'`],
      { encoding: "utf8", env },
    ).stdout.trim();
    if (exists !== "1") {
      execFileSync(findBin("createdb"), ["-h", "127.0.0.1", "-p", PORT, "-U", USER, db], { stdio: "inherit", env });
      console.log(`Created database ${db}`);
    }
  }
  console.log(`DATABASE_URL=postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/wasitx`);
}

function stop() {
  if (!status()) return console.log("Postgres not running");
  execFileSync(findBin("pg_ctl"), ["-D", DATA, "-m", "fast", "stop"], { stdio: "inherit" });
}

const cmd = process.argv[2];
if (cmd === "start") start();
else if (cmd === "stop") stop();
else console.log("usage: local-db.mjs start|stop");
