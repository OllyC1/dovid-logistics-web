import { spawnSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const shell = process.platform === "win32";
const statusResult = spawnSync(npx, ["supabase", "status", "--output", "json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
  shell,
});

if (statusResult.status !== 0) {
  console.error("The isolated local Supabase stack is not available.");
  process.exit(statusResult.status ?? 1);
}

const jsonStart = statusResult.stdout.indexOf("{");
if (jsonStart < 0) {
  console.error("Supabase did not return local connection metadata.");
  process.exit(1);
}

let status;
try {
  status = JSON.parse(statusResult.stdout.slice(jsonStart));
} catch {
  console.error("Supabase returned connection metadata in an unexpected format.");
  process.exit(1);
}

const apiUrl = new URL(status.API_URL);
if (!["127.0.0.1", "localhost"].includes(apiUrl.hostname)) {
  console.error("Refusing to run Auth email fixtures against a non-local Supabase API.");
  process.exit(1);
}

const environment = {
  ...process.env,
  RUN_LOCAL_AUTH_EMAIL_E2E: "true",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const test = spawnSync(npm, ["run", "test", "--", "tests/integration/local-auth-email-delivery.test.ts"], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
  shell,
});

process.exit(test.status ?? 1);
