import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { validateUpstream } from "../scripts/validate-upstream.js";
import { SOURCE, festivalNames } from "../src/index.js";

const names = [...festivalNames.keys()];
const event = name => `BEGIN:VEVENT\r\nSUMMARY:${name}\r\nEND:VEVENT`;
const calendar = entries => ["BEGIN:VCALENDAR", "VERSION:2.0", ...entries, "END:VCALENDAR", ""].join("\r\n");

async function run(fetch) {
    const messages = [];
    const code = await validateUpstream({ fetch, log: message => messages.push(message), error: message => messages.push(message) });
    return { code, output: messages.join("\n") };
}

test("validates every upstream name with one fetch", async () => {
    let calls = 0;
    const result = await run(async url => {
        calls++;
        assert.equal(url, SOURCE);
        return new Response(calendar(names.map(event)));
    });
    assert.equal(calls, 1);
    assert.equal(result.code, 0);
    assert.equal(result.output, `Success: ${names.length}/${names.length} festivals matched`);
});

test("duplicates and display aliases cannot fill missing matches", async () => {
    const missing = ["Naraka Chaturdashi", "Holi"];
    const events = names.filter(name => !missing.includes(name)).map(event);
    events.push(event("Diwali"), event("Choti Diwali"));
    const result = await run(async () => new Response(calendar(events)));
    assert.equal(result.code, 1);
    assert.match(result.output, new RegExp(`${names.length - 2}/${names.length} festivals matched`));
    assert.match(result.output, /Missing: Holi, Naraka Chaturdashi/);
});

test("fetch, HTTP and parsing failures return a failing result", async () => {
    const cases = [
        [async () => { throw new Error("Network unavailable"); }, /Network unavailable/],
        [async () => new Response("private upstream diagnostic", { status: 503 }), /HTTP 503/],
        [async () => new Response("not a calendar"), /invalid calendar data/],
    ];
    for (const [fetch, message] of cases) {
        const result = await run(fetch);
        assert.equal(result.code, 1);
        assert.match(result.output, /Unable to validate upstream calendar/);
        assert.match(result.output, message);
        assert.doesNotMatch(result.output, /private upstream diagnostic/);
    }
});

test("CLI exits successfully only for complete coverage, without real network access", () => {
    for (const [body, expected] of [[calendar(names.map(event)), 0], [calendar([]), 1]]) {
        const preload = `globalThis.fetch = async () => new Response(${JSON.stringify(body)});`;
        const result = spawnSync(process.execPath, [
            "--import", `data:text/javascript,${encodeURIComponent(preload)}`,
            new URL("../scripts/validate-upstream.js", import.meta.url).pathname,
        ], { encoding: "utf8" });
        assert.ifError(result.error);
        assert.equal(result.status, expected, result.stderr);
        assert.match(result.stdout + result.stderr, expected === 0 ? /Success:/ : /Failure:|Unable to validate/);
    }
});
