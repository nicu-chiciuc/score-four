// Setup stack for Score Four. It declares what already exists and keeps
// Workers Builds as the deployer: the Worker shell, its Builds link to this
// repository, and the Convex deploy keys that the builds use. It never
// uploads Worker code; wrangler.jsonc stays the source of truth for that.
//
// Run locally with CLOUDFLARE_API_TOKEN (a user token with Workers Scripts
// edit, Workers Builds Configuration edit, Account Settings read) and the
// Convex CLI login:
//   npx alchemy deploy --adopt
import * as WorkersBuilds from "@samebase/alchemy-cloudflare-workers";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const WORKER_NAME = "score-four";
const CONVEX_PROJECT_ID = 2814366;
const CONVEX_PROD_DEPLOYMENT = "insightful-crow-151";

export default Alchemy.Stack(
  "ScoreFour",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      WorkersBuilds.providers(),
      Convex.providers(),
    ),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    // Only the name: every other Worker setting stays with wrangler.jsonc.
    const worker = yield* WorkersBuilds.Worker("Worker", { name: WORKER_NAME });

    const deployKey = yield* Convex.DeployKey("DeployKey", {
      deployment: CONVEX_PROD_DEPLOYMENT,
      name: "workers-builds",
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
      variables: { CONVEX_DEPLOY_KEY: deployKey.deployKey },
      previewVariables: { CONVEX_DEPLOY_KEY: previewKey.previewDeployKey },
    });

    return { url: worker.url, previewsEnabled: builds.previewsEnabled };
  }),
);
