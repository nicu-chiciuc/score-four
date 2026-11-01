# Local setup

Use this when you want to run the app from your own computer instead of only
through a deployed preview.

## Install Vite+

On macOS or Linux:

```sh
curl -fsSL https://vite.plus | bash
```

On Windows PowerShell:

```powershell
irm https://vite.plus/ps1 | iex
```

Open a new terminal after installing Vite+, then install dependencies:

```sh
vp install
```

## Run the app

From the repository root:

```sh
vp run dev
```

`vp run dev` starts Convex and TanStack Start together. On the first run,
Convex may ask you to sign in and choose or create a development deployment.
The dev script also creates Convex Auth JWT keys in that development deployment
if they are missing.

Open the local URL printed by Vite.

## First run

On a fresh clone, the first push of `vp run dev` fails: `convex/http.ts` imports
`.convex-hosting/version.js`, and only a deploy writes that file. Keep `vp run dev`
running and run this in a second terminal:

```sh
vp run deploy:dev
```

It builds the app, uploads the site to the development deployment, writes the version
file, and pushes. Stop `vp run dev` and start it again; it works as usual from then on.

## Run worktree mode

Use worktree mode for Codex, Conductor, or a separate git worktree where you
want an isolated local backend.

```sh
vp run dev:worktree
```

This repo's `dev:worktree` script is a TypeScript launcher run by Node instead
of `CONVEX_AGENT_MODE=anonymous ...` shell syntax, so the same command works on
PowerShell, macOS, and Linux.
