import { describe, expect, it } from "vite-plus/test";

import { selectConvexDeployPlan } from "./build-cloudflare.ts";
import { selectConvexEnvironmentArgs } from "./ensure-convex-auth.ts";

describe("build-cloudflare", () => {
  it("requires the Workers branch during Workers builds", () => {
    expect(() => selectConvexDeployPlan({ WORKERS_CI: "1" })).toThrow("Set WORKERS_CI_BRANCH");
  });

  it("uses the production trigger key on main", () => {
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "prod-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toEqual({
      kind: "deploy",
      deployKey: "prod-key",
      args: [
        "exec",
        "convex",
        "deploy",
        "--cmd",
        "vp run build:app && node ./scripts/verify-current-branch-head.ts",
      ],
    });
  });

  it("uses the preview trigger key and branch name", () => {
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "preview-key",
        WORKERS_CI: "1",
        WORKERS_CI_BRANCH: "feature-branch",
      }),
    ).toEqual({
      kind: "previewDeploy",
      deployKey: "preview-key",
      args: [
        "exec",
        "convex",
        "deploy",
        "--preview-name",
        "feature-branch",
        "--cmd",
        "vp run build:app && node ./scripts/verify-current-branch-head.ts",
      ],
    });
  });

  it("requires the same-named key on each trigger", () => {
    for (const branch of ["main", "feature-branch"]) {
      expect(() =>
        selectConvexDeployPlan({
          PREVIEW_CONVEX_DEPLOY_KEY: "obsolete-key",
          WORKERS_CI: "1",
          WORKERS_CI_BRANCH: branch,
        }),
      ).toThrow("Set CONVEX_DEPLOY_KEY");
    }
  });

  it("keeps local builds free of Convex deployment side effects", () => {
    expect(selectConvexDeployPlan({})).toEqual({ kind: "frontendOnly" });
    expect(
      selectConvexDeployPlan({
        CONVEX_DEPLOY_KEY: "local-key",
        WORKERS_CI_BRANCH: "main",
      }),
    ).toEqual({ kind: "frontendOnly" });
  });

  it("selects the named preview for auth environment operations", () => {
    expect(selectConvexEnvironmentArgs({ WORKERS_CI_BRANCH: "feature-branch" })).toEqual([
      "--preview-name",
      "feature-branch",
    ]);
    expect(selectConvexEnvironmentArgs({ WORKERS_CI_BRANCH: "main" })).toEqual([]);
    expect(selectConvexEnvironmentArgs({})).toEqual([]);
  });
});
