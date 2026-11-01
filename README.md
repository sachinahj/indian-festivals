# Indian Festivals Calendar

A Cloudflare Worker that filters the [Panchangya Atlanta calendar](https://panchangya.com/en/ical/atlanta-us/festivals.ics) to Diwali, Holi, Karva Chauth, Naraka Chaturdashi (displayed as Choti Diwali), Raksha Bandhan (Rakhi), and Sharad Navratri (Navratri).

## Local development

Install Node.js 22 or newer, then run:

```sh
npm install
npm run dev
```

Open `http://localhost:8787/indian-festivals.ics` in Chrome to see “Filtered Indian Festivals!”. Requests accepting `text/html` receive this page; calendar clients receive the ICS feed at the same URL. Every path supports this behavior. HEAD returns headers without a body. Other methods return 405. The browser message does not check upstream calendar availability.

## Deploy

```sh
npx wrangler login
npm run check
npm run deploy
```

Wrangler prints the deployed URL. Subscribe in your calendar application using:

```text
https://indian-festivals.<your-subdomain>.workers.dev/indian-festivals.ics
```

Use a calendar subscription (subscribe by URL) for ongoing updates. Importing a downloaded file only creates a snapshot. Calendar applications control their own refresh intervals.

The Worker name is configured in `wrangler.jsonc`. No secrets, database, or scheduled trigger are required. See Cloudflare's [Wrangler configuration documentation](https://developers.cloudflare.com/workers/wrangler/configuration/) for account and routing options.

## Deploy from a Git repository

Push this project to GitHub or GitLab and connect it through Cloudflare Workers Builds. Use the repository root as the root directory, leave the build command empty, and set the deploy command to:

```sh
npx wrangler deploy --var "COMMIT_SHA:$WORKERS_CI_COMMIT_SHA"
```

This passes Cloudflare's build-time commit SHA to the Worker as a runtime variable. See the [Workers Builds configuration documentation](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Behavior and customization

The browser page displays `env.COMMIT_SHA` below the heading. Without a valid full commit SHA, it displays `local development`. No custom build step is needed.

Edit `SOURCE` and `FESTIVALS` in `src/index.js` to change the source or selected festivals. Matching is exact and case-sensitive on the event's `SUMMARY`; descriptions and locations do not affect selection. Edit the calendar name and description in the same file if changing cities.

`FESTIVALS` controls both selection and renaming. Use a string such as `"Holi"` to keep a name or a two-item array such as `["Naraka Chaturdashi", "Choti Diwali"]` to rename it. Remove an entry to exclude that festival. Renaming changes only the event summary; dates, UID, descriptions, locations, and alarm summaries stay unchanged.

Each request fetches the upstream feed; successful responses advertise a one-hour public cache lifetime. Invalid calendars, no matching events, and upstream failures return 502 with `Cache-Control: no-store`. HEAD responses never include a body, including on errors.

Summary parameters (such as `LANGUAGE=en`) and folded lines are supported. Only the event's own summary is matched; alarm summaries are ignored. Calendar components such as timezones are preserved, and output lines are folded to at most 75 UTF-8 bytes with CRLF line endings.

`npm test` runs regression tests without network access. `npm run check` performs a deployment dry run without publishing. `npm run tail` streams logs from the deployed Worker.
