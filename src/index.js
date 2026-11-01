const SOURCE =
  "https://panchangya.com/en/ical/atlanta-us/festivals.ics";

// Strings keep the upstream name; [upstream name, display name] pairs rename it.
const FESTIVALS = [
  "Diwali",
  "Holi",
  "Karva Chauth",
  ["Naraka Chaturdashi", "Choti Diwali"],
  ["Raksha Bandhan", "Rakhi"],
  ["Sharad Navratri", "Navratri"],
];

const festivalNames = new Map(FESTIVALS.map(festival =>
  typeof festival === "string" ? [festival, festival] : festival
));

// Find the value separator without treating colons inside quoted parameters as separators.
function property(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === ":" && !quoted) {
      return {
        prefix: line.slice(0, i),
        name: line.slice(0, i).split(";")[0].toUpperCase(),
        value: line.slice(i + 1),
      };
    }
  }
  throw new Error("Source returned invalid calendar data");
}

function parseCalendar(raw) {
  const lines = raw.replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "").trimEnd().split("\n");
  const stack = [];
  let root;
  for (const line of lines) {
    const { name, value } = property(line);
    if (name === "BEGIN") {
      const component = { name: value.toUpperCase(), entries: [] };
      if (stack.length) stack.at(-1).entries.push(component);
      else if (root) throw new Error("Source returned invalid calendar data");
      else root = component;
      stack.push(component);
    } else if (name === "END") {
      if (!stack.length || stack.pop().name !== value.toUpperCase()) {
        throw new Error("Source returned invalid calendar data");
      }
    } else {
      if (!stack.length) throw new Error("Source returned invalid calendar data");
      stack.at(-1).entries.push(line);
    }
  }
  if (stack.length || root?.name !== "VCALENDAR") {
    throw new Error("Source returned invalid calendar data");
  }
  return root;
}

function summaryValue(event) {
  // Only direct VEVENT properties count, never properties inside VALARM.
  const summary = event.entries.find(entry =>
    typeof entry === "string" && property(entry).name === "SUMMARY"
  );
  if (!summary) return null;
  return property(summary).value
    .replace(/\\([nN,;\\])/g, (_, character) =>
      /[nN]/.test(character) ? "\n" : character)
    .trim();
}

function serialize(component) {
  return [
    `BEGIN:${component.name}`,
    ...component.entries.flatMap(entry =>
      typeof entry === "string" ? [entry] : serialize(entry)),
    `END:${component.name}`,
  ];
}

function renameSummary(event, name) {
  const escaped = name.replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[,;]/g, character => "\\" + character);
  event.entries = event.entries.map(entry => {
    if (typeof entry !== "string") return entry;
    const parsed = property(entry);
    return parsed.name === "SUMMARY" ? `${parsed.prefix}:${escaped}` : entry;
  });
}

// Fold at 75 UTF-8 octets, including the continuation space, without splitting characters.
function foldLine(line) {
  const encoder = new TextEncoder();
  let output = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      output += "\r\n ";
      bytes = 1;
    }
    output += character;
    bytes += size;
  }
  return output;
}

export default {
  async fetch(request) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", {
        status: 405,
        headers: { "Allow": "GET, HEAD" },
      });
    }

    // Browser navigation requests HTML; calendar clients still receive the ICS feed.
    if (request.headers.get("Accept")?.split(",").some(type =>
      type.split(";")[0].trim().toLowerCase() === "text/html"
    )) {
      return new Response(
        request.method === "HEAD" ? null : "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Filtered Indian Festivals!</title></head><body><h1>Filtered Indian Festivals!</h1></body></html>",
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Vary": "Accept",
          },
        }
      );
    }

    try {
      const upstream = await fetch(SOURCE, {
        headers: {
          "Accept": "text/calendar, text/plain;q=0.9, */*;q=0.8",
          "User-Agent": "IndianFestivalsCalendarSync/1.0",
        },
      });
      if (!upstream.ok) {
        throw new Error(`Source returned HTTP ${upstream.status}`);
      }

      const calendar = parseCalendar(await upstream.text());
      let count = 0;
      calendar.entries = calendar.entries.filter(entry => {
        if (typeof entry === "string" || entry.name !== "VEVENT") return true;
        const summary = summaryValue(entry);
        const selected = festivalNames.has(summary);
        if (selected) {
          count++;
          const displayName = festivalNames.get(summary);
          if (displayName !== summary) renameSummary(entry, displayName);
        }
        return selected;
      });
      if (count === 0) throw new Error("No matching festival events found");

      const metadata = {
        "X-WR-CALNAME": "Indian Festivals",
        "X-WR-CALDESC": "Filtered Indian Festivals (Atlanta, GA)",
      };
      calendar.entries = calendar.entries.filter(entry =>
        typeof entry !== "string" || !Object.hasOwn(metadata, property(entry).name));
      calendar.entries.unshift(...Object.entries(metadata).map(([name, value]) => `${name}:${value}`));
      const output = serialize(calendar).map(foldLine).join("\r\n") + "\r\n";

      return new Response(request.method === "HEAD" ? null : output, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": "inline; filename=\"indian-festivals.ics\"",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
          "X-Festival-Count": String(count),
          "Vary": "Accept",
        },
      });
    } catch (error) {
      return new Response(
        request.method === "HEAD" ? null : "Calendar sync failed: " + error.message,
        {
          status: 502,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Vary": "Accept",
          },
        }
      );
    }
  }
};
