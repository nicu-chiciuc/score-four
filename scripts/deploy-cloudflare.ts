/// <reference types="node" />
import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const modes = {
  deploy: ["deploy"],
  preview: ["preview"],
} as const;

function isDryRunFlag(value: string) {
  return value === "--dry-run" || value === "--dry-run=true";
}

function run(command: string, args: readonly string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`));
    });
  });
}

type CloudflareDeployPlan = {
  buildArgs: readonly string[] | null;
  wranglerArgs: readonly string[];
};

export function selectCloudflareDeployPlan(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): CloudflareDeployPlan {
  const [modeArg, ...extraArgs] = args;

  if (modeArg !== "deploy" && modeArg !== "preview") {
    throw new Error("Usage: node ./scripts/deploy-cloudflare.ts <deploy|preview> [wrangler flags]");
  }

  if (extraArgs.includes("--")) {
    throw new Error(
      "Do not pass a standalone -- to Wrangler. Pass Wrangler flags directly after the deploy command.",
    );
  }

  const isWorkersBuild = env["WORKERS_CI"] === "1" || env["WORKERS_CI"] === "true";
  const isDryRun = extraArgs.some(isDryRunFlag);
  if (modeArg === "preview" && extraArgs.some((arg) => arg.startsWith("--dry-run"))) {
    throw new Error(
      "Worker Previews does not support --dry-run. Use deploy:dry-run for package validation.",
    );
  }

  return {
    buildArgs: isWorkersBuild ? null : ["run", isDryRun ? "build:app" : "build:cloudflare"],
    wranglerArgs: [...modes[modeArg], ...extraArgs],
  };
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
) {
  const plan = selectCloudflareDeployPlan(args, env);

  if (plan.buildArgs) {
    await run("vp", plan.buildArgs);
  }

  await run("wrangler", plan.wranglerArgs);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
