import { httpRouter } from "convex/server";
import { routeAll } from "@samebase/convex-hosting";
import { components } from "./_generated/api";
import { auth } from "./auth";
import { assets } from "../.convex-hosting/version.js";

const http = httpRouter();

auth.addHttpRoutes(http);

// Every method, every path, as a Cloudflare Worker with static assets: the uploaded file for a
// path that has one, else the SPA shell. `pnpm run deploy` writes the version file. Convex picks
// an exact path, then the longest prefix, so the routes of auth.addHttpRoutes keep winning over "/".
routeAll({ http, component: components.hosting, assets });

export default http;
