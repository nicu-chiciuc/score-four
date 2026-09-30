# Cloudflare Workers Builds

This app deploys through Cloudflare Workers Builds. The Cloudflare dashboard runs
`pnpm run build`, then runs `pnpm run deploy` for the production branch or
`pnpm run deploy:preview` for other branches.

## Build variables

In Cloudflare Settings > Builds, set `CONVEX_DEPLOY_KEY` separately for Production and Previews Base:

- Production: the Convex production deploy key.
- Previews Base: the Convex project Preview deploy key.

The production key needs `deployment:deploy`, `deployment:env:view`,
`deployment:env:write`, and `deployment:data:view`. Keep these as build secrets.
The build reads only `CONVEX_DEPLOY_KEY`. It requires `WORKERS_CI_BRANCH` in Workers Builds.
Convex supplies `VITE_CONVEX_URL` to the frontend through `convex deploy --cmd`.
The build and auth scripts match the current Samebase base template. Auth environment reads and
writes use the branch's `--preview-name` selector. Existing `JWT_PRIVATE_KEY` and `JWKS` values
stay unchanged on rebuilds. A failed environment read stops the build before any auth key write.

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

Worker Previews has no dry-run mode. After provider setup, build the app before a manual preview:

```sh
pnpm run build
pnpm run deploy:preview --worker-name <connected-worker-name>
```

Wrangler `--name` selects the Preview on this command. Workers Builds supplies the parent
Worker name through `WRANGLER_CI_OVERRIDE_NAME`.

## Migration

Use the [Samebase Worker Previews migration guide](https://samebase.com/docs/cloudflare-previews-migration)
to migrate the connected Worker and verify production and preview builds.

This Worker serves static assets. `wrangler.jsonc` has an empty `previews` block and keeps
`preview_urls` enabled.

## References

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
