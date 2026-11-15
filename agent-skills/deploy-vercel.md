# Deploying to Vercel (GAHONSH)

1. Confirm the build works locally first: `npm ci && npm run build`. A broken build never deploys.
2. For monorepos deploy from the repository root with a `vercel.json`; do not point the project at a subfolder unless the app needs it.
3. API routes need `export const maxDuration` when they call slow upstreams (Overpass, scraping, mail sends). 10s default is the usual silent failure.
4. Set env vars in Vercel, never in the repo. After adding a var, redeploy: existing deployments keep old env.
5. Verify with real requests, not the dashboard: `curl -s -o /dev/null -w "%{http_code}" <url>`, then hit one cron route with the bearer token.
6. Cron routes must be idempotent and must reject calls without `CRON_SECRET`.
7. Record the deployed URL in the repo README so the next session does not guess.
