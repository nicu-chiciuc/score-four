# Cloudflare Workers Builds

This app deploys through Cloudflare Workers Builds. The Cloudflare dashboard runs
`pnpm run build`, then runs `pnpm run deploy` for the production branch or
`pnpm run deploy:preview` for other branches.

## Build variables

In Cloudflare Settings > Builds, set `CONVEX_DEPLOY_KEY` separately for each trigger:

- Production: the Convex production deploy key.
- Previews Base: the Convex project Preview deploy key.

The production key needs `deployment:deploy`, `deployment:env:view`,
`deployment:env:write`, and `deployment:data:view`. Keep these as build secrets.
The build reads only `CONVEX_DEPLOY_KEY`. It requires `WORKERS_CI_BRANCH` in Workers Builds.
Convex supplies `VITE_CONVEX_URL` to the frontend through `convex deploy --cmd`.
Preview auth environment reads and writes use the branch's `--preview-name` selector.

## Build Ordering

Non-production builds pass `WORKERS_CI_BRANCH` to Convex as the stable preview
name, so repeated commits reuse one preview deployment, URL, and data.

Cloudflare may build more than one commit from the same branch concurrently.
Stable naming does not order those builds: without another check, an older build
that finishes last can replace newer Convex functions. After building the app
and immediately before Convex pushes functions, this template compares the
checked-out Git commit with the remote head of `WORKERS_CI_BRANCH`. A stale
build fails without deploying Convex. The checkout is authoritative because a
manual Workers Build can report the branch name in `WORKERS_CI_COMMIT_SHA`. The
check applies to `main` too, where the same overlap could otherwise roll
production back.

The check adds one authenticated `git ls-remote` request to each provider build.
It is not an atomic compare-and-swap. A branch can still advance in the short
interval between the Git check and Convex's internal push. Eliminating that
residual race requires provider-side serialization or a Convex source-commit
concurrency primitive.

## Local checks

A local build does not deploy Convex, even when deployment variables are present.
Validate the production Worker package without publishing it:

```sh
vp run deploy:dry-run --name <connected-worker-name>
```

Worker Previews has no dry-run mode. After provider setup, create a manual preview with:

```sh
pnpm run deploy:preview --worker-name <connected-worker-name>
```

Wrangler `--name` selects the Preview on this command. Workers Builds supplies the parent
Worker name through `WRANGLER_CI_OVERRIDE_NAME`.

## Switch an existing Worker

The repository change does not switch the connected Worker. Confirm the repository, Worker, and
account before the separate, irreversible provider step.

1. Set the trigger-specific `CONVEX_DEPLOY_KEY` values under Settings > Builds.
2. Use Settings > Builds > Set up Worker Previews.
3. Restore `pnpm run build`, `pnpm run deploy`, and `pnpm run deploy:preview` after the switch.
   Keep the current build root and enable non-production branch builds.
4. Build the migrated preview branch. Check its returned URL, backend URL, and authentication.
   Confirm that production is unchanged.
5. After verification, remove the obsolete `PREVIEW_CONVEX_DEPLOY_KEY` from both triggers and
   remove `SAMEBASE_CONVEX_PROJECT` from the preview trigger. Keep the project marker on production.

`wrangler.jsonc` includes an empty `previews` block because this Worker serves static assets.
Runtime variables and resource bindings do not inherit production values. Any future runtime
binding must use an isolated preview resource. Runtime secrets belong in Previews Base runtime
configuration and affect newly created Previews.

## References

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
