# Indian Festivals Calendar

A Cloudflare Worker that filters the [Panchangya Atlanta calendar](https://panchangya.com/en/ical/atlanta-us/festivals.ics) to the festivals selected in [`FESTIVALS`](src/index.js).

## Development and checks

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:8787/indian-festivals.ics`. Browsers show the commit SHA (or `local development`) without fetching upstream; calendar clients receive the ICS feed.

| Command | Purpose |
| --- | --- |
| `npm test` | Run offline tests, then live upstream validation if they pass |
| `node --test` | Run only the offline tests |
| `npm run validate:upstream` | Check the live upstream calendar once |
| `npm run check` | Deployment dry run without publishing |
| `npm run tail` | Stream deployed Worker logs |

Run `npm test` before pushing. Live validation checks that every configured upstream name has at least one match anywhere in the feed, reports missing names, and exits nonzero for missing matches, invalid data, or fetch failures. It has a 30-second timeout.

## Deployment

For a manual deploy:

```sh
npx wrangler login
npm run check
npm run deploy
```

For Git deployments, connect the repository through [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/). Use the repository root, leave the build command empty, and set the deploy command to:

```sh
npx wrangler deploy --var "COMMIT_SHA:$WORKERS_CI_COMMIT_SHA"
```

This supplies the commit SHA shown on the browser page.

Subscribe to the deployed feed in your calendar app using your Cloudflare subdomain:

```text
https://indian-festivals.<your-subdomain>.workers.dev/indian-festivals.ics
```

Use a URL subscription for ongoing updates; importing a downloaded file creates a snapshot.

## Customization

Edit `SOURCE` and `FESTIVALS` in [`src/index.js`](src/index.js). Use `"Holi"` to keep a name or `["Naraka Chaturdashi", "Choti Diwali"]` to rename it. Matching is case-sensitive on the upstream event summary; renaming preserves the event's other fields. If changing cities, also update the calendar name and description in that file.

Worker settings, including its deployed name, are in [`wrangler.jsonc`](wrangler.jsonc).
