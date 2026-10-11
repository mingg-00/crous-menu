// Cloudflare Worker for the web app. Pages are static assets (served before this code runs); the only job here is
// the cron in wrangler.jsonc: ping the API so the free Render instance never falls asleep (it sleeps after ~15 min
// idle and the next visitor then waits 30-60 s). ponytail: free-tier workaround; drop it on a paid Render plan.
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(fetch(env.KEEP_AWAKE_URL));
  },
};
