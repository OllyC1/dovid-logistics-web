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
  console.error("The isolated local Supabase stack is not available. Start it before running local authenticated acceptance tests.");
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
  console.error("Refusing to run destructive acceptance fixtures against a non-local Supabase API.");
  process.exit(1);
}

const environment = {
  ...process.env,
  DOVID_LOCAL_E2E: "true",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3102",
  PLAYWRIGHT_LOCAL_BASE_URL: "http://127.0.0.1:3102",
  ENABLE_PUBLIC_BOOKINGS: "false",
  ENABLE_ASSISTED_BOOKINGS: "false",
  ENABLE_LIVE_PAYMENTS: "false",
};
delete environment.PLAYWRIGHT_BASE_URL;

const testArguments = process.argv.slice(2);
const skipBuild = testArguments[0] === "--skip-build";
if (skipBuild) testArguments.shift();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
if (!skipBuild) {
  const build = spawnSync(npm, ["run", "build"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
    shell,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const playwright = spawnSync(npx, ["playwright", "test", ...testArguments], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
  shell,
});

process.exit(playwright.status ?? 1);
