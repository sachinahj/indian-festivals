import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

const event = (uid, properties) => [
  "BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20261031T000000Z",
  "DTSTART;VALUE=DATE:20261108", ...properties, "END:VEVENT",
];
const calendar = (...entries) => [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN",
  ...entries.flat(), "END:VCALENDAR", "",
].join("\r\n");
const request = (method = "GET") => new Request("https://example.com/festivals.ics", { method });

test("browser navigation shows a message without fetching the calendar", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Browser navigation should not fetch upstream");
  });
  for (const method of ["GET", "HEAD"]) {
    const response = await worker.fetch(new Request("https://example.com/festivals.ics", {
      method,
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("Vary"), "Accept");
    const body = await response.text();
    if (method === "HEAD") assert.equal(body, "");
    else assert.match(body, /<h1>Filtered Indian Festivals!<\/h1>/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("filters only event summaries, supporting parameters and folded values", async t => {
  const input = calendar(
    event("keep-1", ['SUMMARY;ALTREP="https://example.com/title";LANGUAGE=en:Diwali']),
    event("keep-2", ["SUMMARY:Raksha ", " Bandhan"]),
    event("drop-1", ["SUMMARY:Other", "DESCRIPTION:Holi", "LOCATION:Diwali"]),
    event("drop-2", ["SUMMARY;LANGUAGE=en:Other", "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT1H", "SUMMARY:Diwali", "DESCRIPTION:Reminder", "END:VALARM"]),
    event("drop-3", ["SUMMARY:diwali"]),
  );
  t.mock.method(globalThis, "fetch", async () => new Response(input));
  const response = await worker.fetch(request());
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Festival-Count"), "2");
  assert.match(body, /UID:keep-1/);
  assert.match(body, /UID:keep-2/);
  assert.doesNotMatch(body, /UID:drop/);
});

test("folds UTF-8 lines without changing values and preserves timezones after events", async t => {
  const description = "DESCRIPTION:" + "🪔हिन्दी".repeat(30);
  const input = calendar(event("keep", ["SUMMARY:Diwali", description]), [
    "BEGIN:VTIMEZONE", "TZID:Test/Zone", "BEGIN:STANDARD",
    "DTSTART:19700101T000000", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0500",
    "END:STANDARD", "END:VTIMEZONE",
  ]);
  t.mock.method(globalThis, "fetch", async () => new Response(input));
  const body = await (await worker.fetch(request())).text();
  for (const line of body.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  assert.doesNotMatch(body, /(?<!\r)\n/);
  assert.ok(body.replace(/\r\n[ \t]/g, "").includes(description));
  assert.match(body, /BEGIN:VTIMEZONE/);
  assert.match(body, /X-WR-CALNAME:Indian Festivals - Atlanta/);
});

test("upstream failures return uncached 502 without exposing upstream body", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("upstream diagnostic", { status: 503 }));
  const response = await worker.fetch(request());
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "Calendar sync failed: Source returned HTTP 503");
  const head = await worker.fetch(request("HEAD"));
  assert.equal(head.status, 502);
  assert.equal(await head.text(), "");
});

test("rejects malformed calendars and calendars without matching summaries", async t => {
  for (const input of [
    "not a calendar",
    calendar(event("drop", ["SUMMARY:Other"])),
    calendar(event("keep", ["SUMMARY:Diwali"])).replace("END:VEVENT", "END:VALARM"),
    calendar(event("keep", ["SUMMARY:Diwali"])).replace("END:VCALENDAR", ""),
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response(input));
    assert.equal((await worker.fetch(request())).status, 502);
    mock.mock.restore();
  }
});

test("HEAD has GET headers without a body, and unsupported methods do not fetch", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(calendar(event("keep", ["SUMMARY:Holi"]))));
  const get = await worker.fetch(request());
  const head = await worker.fetch(request("HEAD"));
  assert.equal(head.status, 200);
  assert.deepEqual([...head.headers], [...get.headers]);
  assert.equal(await head.text(), "");
  const post = await worker.fetch(request("POST"));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD");
  assert.equal(fetchMock.mock.callCount(), 2);
});
