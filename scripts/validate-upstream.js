import { pathToFileURL } from "node:url";
import { SOURCE, festivalNames, parseCalendar, summaryValue } from "../src/index.js";

export async function validateUpstream({ fetch = globalThis.fetch, log = console.log, error = console.error } = {}) {
    try {
        const response = await fetch(SOURCE, {
            headers: {
                "Accept": "text/calendar, text/plain;q=0.9, */*;q=0.8",
                "User-Agent": "IndianFestivalsCalendarSync/1.0",
            },
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
        const calendar = parseCalendar(await response.text());
        const summaries = new Set(calendar.entries
            .filter(entry => typeof entry !== "string" && entry.name === "VEVENT")
            .map(summaryValue));
        const missing = [...festivalNames.keys()].filter(name => !summaries.has(name));
        const total = festivalNames.size;
        if (missing.length) {
            error(`Failure: ${total - missing.length}/${total} festivals matched. Missing: ${missing.join(", ")}`);
            return 1;
        }
        log(`Success: ${total}/${total} festivals matched`);
        return 0;
    } catch (cause) {
        error(`Unable to validate upstream calendar: ${cause.message}`);
        return 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = await validateUpstream();
}
