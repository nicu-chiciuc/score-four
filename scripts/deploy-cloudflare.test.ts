import { describe, expect, it } from "vite-plus/test";

import { selectCloudflareDeployPlan } from "./deploy-cloudflare.ts";

describe("deploy-cloudflare", () => {
  it("builds the app before a local production dry run", () => {
    for (const flag of ["--dry-run", "--dry-run=true"]) {
      expect(selectCloudflareDeployPlan(["deploy", "--name", "example-app", flag], {})).toEqual({
        buildArgs: ["run", "build:app"],
        wranglerArgs: ["deploy", "--name", "example-app", flag],
      });
    }
  });

  it("builds before a local native preview and forwards its distinct names", () => {
    expect(
      selectCloudflareDeployPlan(
        ["preview", "--worker-name", "example-app", "--name", "test-preview"],
        {},
      ),
    ).toEqual({
      buildArgs: ["run", "build:cloudflare"],
      wranglerArgs: ["preview", "--worker-name", "example-app", "--name", "test-preview"],
    });
  });

  it("lets Wrangler read the connected Worker name during Workers Builds", () => {
    expect(
      selectCloudflareDeployPlan(["preview"], {
        WORKERS_CI: "true",
        WRANGLER_CI_OVERRIDE_NAME: "connected-worker",
      }),
    ).toEqual({
      buildArgs: null,
      wranglerArgs: ["preview"],
    });
  });

  it("rejects unsupported preview dry runs before a build", () => {
    expect(() => selectCloudflareDeployPlan(["preview", "--dry-run"], {})).toThrow(
      "Worker Previews does not support --dry-run",
    );
  });

  it("rejects an option terminator that can hide a later dry-run flag", () => {
    expect(() => selectCloudflareDeployPlan(["deploy", "--", "--dry-run=true"], {})).toThrow(
      "Do not pass a standalone -- to Wrangler",
    );
  });
});
