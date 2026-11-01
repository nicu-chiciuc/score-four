// Stage `prod` is the production deployment of the Convex project of this
// repository. Any other stage, such as `pr-42` for a pull request, is a
// preview deployment named after the stage, which `alchemy destroy` deletes.
// The push is the `deploy` script: convex-hosting builds the site, sets the
// Convex Auth keys of a new deployment, uploads the site, and pushes the
// functions.
//
// The stack is named after the repository, `owner/name`. The state of every
// stage is in the `alchemy-state-store` project of the team, which
// Convex.state() creates on the first run. Every run needs the team token
// CONVEX_ACCESS_TOKEN, or a Convex CLI login (`npx convex login`) on a laptop;
// it mints the deploy keys itself.
import { execFileSync } from "node:child_process";
import * as GitHub from "@alchemy.run/github";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** The Convex team that holds the project and the state. */
const team = "nicu";

/** The slug of the Convex project of this app, which predates the stack. */
const projectSlug = "score-four";

/** The GitHub repository, `owner/name`: GITHUB_REPOSITORY in Actions, else the origin remote. */
const repository =
  process.env["GITHUB_REPOSITORY"] ??
  /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(
    execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim(),
  )?.[1];
if (repository === undefined) {
  throw new Error("Set GITHUB_REPOSITORY to owner/name: the origin remote names no repository.");
}

export default Alchemy.Stack(
  repository,
  {
    providers: Layer.mergeAll(GitHub.providers(), Convex.providers()),
    state: Convex.state({ team }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const source = {
      path: "./convex",
      command: ["node", "--run", "deploy"],
      // The build inputs. The functions, package.json, and the lockfile are always hashed.
      include: [
        "src/**",
        "public/**",
        "scripts/**",
        "alchemy.run.ts",
        "vite.config.ts",
        "tsconfig*.json",
      ],
    } satisfies Convex.Source;
    // The stage `prod` owns the project, which holds the production data. With `slug`, the resource
    // never creates or renames a project, and it keeps the default removal policy, retain:
    // `alchemy destroy --stage prod` forgets the project, and Convex keeps it. A preview stage reads
    // the project from the state of `prod`.
    const project =
      stage === "prod"
        ? yield* Convex.Project("Project", { team, slug: projectSlug })
        : yield* Convex.Project.ref("Project", { stage: "prod" });
    const deployment =
      stage === "prod"
        ? yield* Convex.Deployment("Deployment", { project, type: "prod", source })
        : yield* Convex.Deployment("Deployment", {
            project,
            type: "preview",
            name: stage,
            source,
          }).pipe(RemovalPolicy.destroy());

    const github = yield* GitHub.GitHubEnv;
    if (github?.pr) {
      // Retained: a closed pull request keeps the comment, as a record of what was deployed; the
      // preview's URL stops answering when the stage is destroyed.
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`Preview \`${stage}\`: ${deployment.siteUrl}`,
      }).pipe(RemovalPolicy.retain());
    }
    return { url: deployment.siteUrl };
  }),
);
