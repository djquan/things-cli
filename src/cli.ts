#!/usr/bin/env bun
import { ThingsStore } from "./db";
import { runMutation, type MutationCommand } from "./mutate";

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export async function main(argv = Bun.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (!parsed.command || parsed.command === "help" || parsed.flags.help) {
      printHelp();
      return parsed.command || parsed.flags.help ? 0 : 1;
    }

    const dbPath = stringFlag(parsed, "db");
    const store = new ThingsStore({ databasePath: dbPath });
    try {
      const output = await runCommand(store, parsed);
      if (output !== undefined) {
        printJson(output);
      }
      return 0;
    } finally {
      store.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
    return 1;
  }
}

export async function runCommand(store: ThingsStore, parsed: ParsedArgs): Promise<unknown> {
  switch (parsed.command) {
    case "doctor":
      return store.doctor();
    case "snapshot":
      return store.snapshot({ includeTrashed: booleanFlag(parsed, "include-trashed"), raw: booleanFlag(parsed, "raw") });
    case "today":
      return store.today();
    case "inbox":
      return store.inbox();
    case "anytime":
      return store.anytime();
    case "upcoming":
      return store.upcoming();
    case "projects":
      return store.projects();
    case "areas":
      return store.areas();
    case "tags":
      return store.tags();
    case "show":
      return store.show(requiredPositional(parsed, 0, "id"));
    case "search":
      return store.search(parsed.positionals.join(" "));
    case "context":
      return store.context(numberFlag(parsed, "budget", 12000));
    case "add":
      return mutate(store, "add", {
        title: requiredFlag(parsed, "title"),
        notes: stringFlag(parsed, "notes"),
        when: stringFlag(parsed, "when"),
        deadline: stringFlag(parsed, "deadline"),
        tags: stringFlag(parsed, "tags"),
        "list-id": stringFlag(parsed, "list-id"),
        list: stringFlag(parsed, "list"),
        "heading-id": stringFlag(parsed, "heading-id"),
        heading: stringFlag(parsed, "heading"),
        reveal: booleanFlag(parsed, "reveal") || undefined
      }, parsed);
    case "update":
      return mutate(store, "update", {
        id: requiredFlag(parsed, "id"),
        title: stringFlag(parsed, "title"),
        notes: stringFlag(parsed, "notes"),
        "prepend-notes": stringFlag(parsed, "prepend-notes"),
        "append-notes": stringFlag(parsed, "append-notes"),
        when: stringFlag(parsed, "when"),
        deadline: stringFlag(parsed, "deadline"),
        tags: stringFlag(parsed, "tags"),
        "add-tags": stringFlag(parsed, "add-tags"),
        "checklist-items": stringFlag(parsed, "checklist-items"),
        "append-checklist-items": stringFlag(parsed, "append-checklist-items"),
        "list-id": stringFlag(parsed, "list-id"),
        list: stringFlag(parsed, "list"),
        "heading-id": stringFlag(parsed, "heading-id"),
        heading: stringFlag(parsed, "heading"),
        reveal: booleanFlag(parsed, "reveal") || undefined
      }, parsed);
    case "complete":
      return mutate(store, "update", { id: requiredFlag(parsed, "id"), completed: true }, parsed);
    case "cancel":
      return mutate(store, "update", { id: requiredFlag(parsed, "id"), canceled: true }, parsed);
    case "reveal":
      return mutate(store, "show", { id: requiredPositional(parsed, 0, "id") }, { ...parsed, flags: { ...parsed.flags, execute: true } });
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

function mutate(
  store: ThingsStore,
  command: MutationCommand,
  params: Record<string, string | boolean | number | null | undefined>,
  parsed: ParsedArgs
): Promise<Record<string, unknown>> {
  return runMutation(store, command, params, booleanFlag(parsed, "execute"));
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      flags[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[withoutPrefix] = next;
      index += 1;
    } else {
      flags[withoutPrefix] = true;
    }
  }

  return { command, flags, positionals };
}

function requiredFlag(parsed: ParsedArgs, name: string): string {
  const value = stringFlag(parsed, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function requiredPositional(parsed: ParsedArgs, index: number, name: string): string {
  const value = parsed.positionals[index];
  if (!value) {
    throw new Error(`Missing required ${name}`);
  }
  return value;
}

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function numberFlag(parsed: ParsedArgs, name: string, fallback: number): number {
  const value = stringFlag(parsed, name);
  if (!value) {
    return fallback;
  }
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`--${name} must be a number`);
  }
  return parsedValue;
}

function booleanFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags[name] === true || parsed.flags[name] === "true";
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp(): void {
  console.log(helpText());
}

export function helpText(): string {
  return `things-cli

Read-only LLM-oriented access to Things 3, with URL-scheme mutations behind --execute.
All command output is JSON except this help text.

Use this CLI as the source of truth for task ingestion. Prefer focused commands
over snapshot when you only need one list.

Read commands:
  help
  doctor [--db path]
  snapshot [--include-trashed] [--raw] [--db path]
  today | inbox | anytime | upcoming | projects | areas | tags
  show <id>
  search <query>
  context [--budget 12000]

Read command meaning:
  doctor       Validate DB path, schema version, table presence, and URL auth availability.
  snapshot     Full normalized export. Use --raw to include selected source DB fields.
  today        Open to-dos/projects Things shows in Today.
  inbox        Open to-dos/projects in Inbox.
  anytime      Open to-dos/projects Things shows in Anytime.
  upcoming     Open to-dos/projects Things shows in Upcoming.
  projects     All project records.
  areas        Areas with attached tags.
  tags         Tags.
  show <id>    One task/project/heading by Things id, including raw fields.
  search       Case-insensitive search across title, notes, area, project, heading, tags, checklist.
  context      Compact LLM-oriented payload containing today, inbox, anytime, upcoming, projects.

Important JSON fields for LLMs:
  id                    Stable Things id to pass to show/update/complete/cancel/reveal.
  title                 User-visible task title.
  kind                  to-do, project, heading, or unknown.
  status                open, canceled, completed, or unknown.
  list                  Primary availability bucket: Inbox, Anytime, Upcoming, Someday, Unknown.
  lists                 Built-in list memberships. Lists can overlap, e.g. ["Today","Anytime"].
  isToday/isUpcoming    Convenience booleans derived from lists.
  startDate             Explicit Things start/when date when present.
  scheduledDate         Date Things uses for Today/Upcoming display. Falls back to todayIndexReferenceDate.
  deadline              Things deadline. Deadline alone does not make an item Today.
  areaTitle             Direct area on this row, often null for project-contained tasks.
  effectiveAreaTitle    Best area context: direct area, project area, or heading project's area.
  projectTitle          Parent project title when present.
  headingTitle          Parent heading title when present.
  checklist             Checklist items with open/completed status.

Things list caveats:
  Today is an overlay, not a mutually exclusive bucket. A task can be both Today and Anytime.
  Upcoming rows may have startDate=null but scheduledDate set from todayIndexReferenceDate.
  Someday is separate from Upcoming; future scheduled Someday items appear in Upcoming.
  Do not infer Today from deadline alone.

Mutation commands default to dry-run:
  add --title "Task" [--notes text] [--when today] [--list-id id] [--execute]
  update --id id [--title text] [--append-notes text] [--when today] [--execute]
  complete --id id [--execute]
  cancel --id id [--execute]
  reveal <id>

Mutation safety:
  Without --execute, mutation commands only return the redacted Things URL plan.
  With --execute, the CLI opens the Things URL scheme and then reads back the item when possible.
  The CLI never writes directly to the Things SQLite database.
  Auth tokens are read from Things settings and redacted from output.

Environment:
  THINGS_DB_PATH overrides automatic Things database discovery.

Examples:
  things today
  things show <id>
  things update --id <id> --append-notes "New context"
  things update --id <id> --append-notes "New context" --execute
`;
}

if (import.meta.main) {
  process.exit(await main());
}
