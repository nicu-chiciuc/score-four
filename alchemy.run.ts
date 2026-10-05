// Setup stack for Score Four. It declares what already exists and keeps
// Workers Builds as the deployer: the Worker shell, its Builds link to this
// repository, and the Convex deploy keys that the builds use. It never
// uploads Worker code; wrangler.jsonc stays the source of truth for that.
//
// .github/workflows/infra.yml runs it: a plan on every pull request that
// touches this file, a deploy on main. Locally it needs CLOUDFLARE_API_TOKEN
// (a user token with Workers Scripts edit, Workers Builds Configuration edit,
// Secrets Store edit, Account Settings read), CLOUDFLARE_ACCOUNT_ID, and the
// Convex CLI login:
//   npx alchemy plan --stage prod
import * as WorkersBuilds from "@samebase/alchemy-cloudflare-workers-builds";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const WORKER_NAME = "score-four";
const CONVEX_TEAM_ID = 38516;
const CONVEX_PROJECT_ID = 2814366;
const CONVEX_PROD_DEPLOYMENT = "insightful-crow-151";

// Samebase reads this build variable to link the Worker to its Convex
// project in the dashboard. Same format Samebase writes itself.
const SAMEBASE_CONVEX_PROJECT = `version=1&teamId=${CONVEX_TEAM_ID}&projectId=${CONVEX_PROJECT_ID}`;

export default Alchemy.Stack(
  "ScoreFour",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      WorkersBuilds.providers(),
      Convex.providers(),
    ),
    // State lives in the Cloudflare state store (an encrypted Durable Object in
    // the account), so the laptop and .github/workflows/infra.yml share it.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // Only the name: every other Worker setting stays with wrangler.jsonc.
    const worker = yield* WorkersBuilds.Worker("Worker", { name: WORKER_NAME });

    // Convex lists each key under its name plus a hash of the resource, such
    // as "workers-builds-3f2a1b0c9d8e". A key cannot change, so a changed prop
    // replaces it, and the Builds variables below take the new secret. A
    // replaced key made by alchemy-convex 0.1.x stays in Convex with a
    // warning: delete it in the Convex dashboard.
    //
    // The production key gets only what scripts/build-cloudflare.ts needs.
    // Without allowedActions, Convex grants every deployment action,
    // including data writes and backup deletes.
    const deployKey = yield* Convex.DeployKey("DeployKey", {
      deployment: CONVEX_PROD_DEPLOYMENT,
      name: "workers-builds",
      allowedActions: [
        "deployment:deploy",
        "deployment:env:view",
        "deployment:env:write",
        "deployment:data:view",
      ],
    });
    const previewKey = yield* Convex.PreviewDeployKey("PreviewDeployKey", {
      projectId: CONVEX_PROJECT_ID,
      name: "workers-builds",
    });

    const builds = yield* WorkersBuilds.Repository("Builds", {
      worker: worker.workerId,
      repository: { owner: "nicu-chiciuc", name: "score-four", branch: "main" },
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      buildCachingEnabled: false,
      // scripts/build-cloudflare.ts reads CONVEX_DEPLOY_KEY: the production
      // key on main, the project preview key on every other branch.
      variables: {
        CONVEX_DEPLOY_KEY: deployKey.deployKey,
        SAMEBASE_CONVEX_PROJECT,
      },
      previewVariables: { CONVEX_DEPLOY_KEY: previewKey.previewDeployKey },
    });

    return { url: worker.url, previewsEnabled: builds.previewsEnabled };
  }),
);
