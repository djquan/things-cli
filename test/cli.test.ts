import { expect, test } from "bun:test";
import { ThingsStore } from "../src/db";
import { helpText, main, parseArgs, runCommand } from "../src/cli";
import { buildThingsUrl, redactThingsUrl } from "../src/mutate";
import { createFixtureDatabase } from "./helpers/fixture-db";

test("parses flags and positionals", () => {
  expect(parseArgs(["show", "task-1", "--raw", "--db", "/tmp/main.sqlite"])).toEqual({
    command: "show",
    positionals: ["task-1"],
    flags: {
      raw: true,
      db: "/tmp/main.sqlite"
    }
  });
});

test("help explains LLM-facing Things semantics", () => {
  const help = helpText();

  expect(help).toContain("All command output is JSON");
  expect(help).toContain("completed [--since YYYY-MM-DD]");
  expect(help).toContain("lists                 Built-in list memberships");
  expect(help).toContain("scheduledDate");
  expect(help).toContain("context is not audit-safe");
  expect(help).toContain("Deadline alone does not make an item Today");
  expect(help).toContain("The CLI never writes directly to the Things SQLite database");
});

test("help command exits successfully", async () => {
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (value?: unknown) => {
    logs.push(String(value));
  };

  try {
    const status = await main(["help"]);
    expect(status).toBe(0);
    expect(logs.join("\n")).toContain("things-cli");
  } finally {
    console.log = originalLog;
  }
});

test("runs read commands against a real SQLite fixture", async () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const output = await runCommand(store, parseArgs(["today"]));
  store.close();

  expect(Array.isArray(output)).toBe(true);
  expect(JSON.stringify(output)).toContain("Write launch memo");
});

test("runs completed command with date filters", async () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const output = await runCommand(store, parseArgs(["completed", "--since", "2026-05-01", "--until", "2026-05-10"]));
  store.close();

  expect(JSON.stringify(output)).toContain("Completed task");
  expect(JSON.stringify(output)).not.toContain("Earlier completed task");
  expect(JSON.stringify(output)).not.toContain("Canceled task");
});

test("builds and redacts Things URLs", () => {
  const url = buildThingsUrl("update", {
    id: "task-1",
    "auth-token": "secret-token",
    "append-notes": "hello world"
  });

  expect(url).toContain("things:///update?");
  expect(url).toContain("append-notes=hello%20world");
  expect(redactThingsUrl(url)).toContain("auth-token=[redacted]");
  expect(redactThingsUrl(url)).not.toContain("secret-token");
});

test("mutation commands dry-run by default", async () => {
  const store = new ThingsStore({ databasePath: createFixtureDatabase() });
  const output = await runCommand(store, parseArgs(["complete", "--id", "task-today"]));
  store.close();

  expect(JSON.stringify(output)).toContain("\"dryRun\":true");
  expect(JSON.stringify(output)).toContain("auth-token=[redacted]");
  expect(JSON.stringify(output)).not.toContain("secret-token");
});
