# things-cli

LLM-oriented Bun CLI for reading and interacting with Things 3.

The CLI reads the Things SQLite database directly in readonly mode and uses Things'
official URL scheme for mutations. It does not write to the SQLite database.

## Commands

```sh
bun run src/cli.ts doctor
bun run src/cli.ts snapshot
bun run src/cli.ts today
bun run src/cli.ts inbox
bun run src/cli.ts anytime
bun run src/cli.ts upcoming
bun run src/cli.ts projects
bun run src/cli.ts areas
bun run src/cli.ts tags
bun run src/cli.ts show <id>
bun run src/cli.ts search <query>
bun run src/cli.ts context --budget 12000
```

All read commands emit JSON.

## Things List Semantics

Things' built-in lists overlap. A to-do can appear in both `Today` and `Anytime`,
and upcoming repeating/generated items may have no `startDate` while still having
a scheduled display date.

Task JSON exposes:

- `list`: the primary availability bucket derived from Things' `start` field.
- `lists`: all built-in lists the task belongs to, such as `["Today", "Anytime"]`.
- `startDate`: the explicit Things start date when present.
- `scheduledDate`: the date Things uses for Today/Upcoming membership, falling
  back to `todayIndexReferenceDate` when `startDate` is empty.
- `deadline`: the Things deadline. A deadline alone does not place an item in
  Today.

## Mutations

Mutation commands dry-run by default. Add `--execute` to open the generated
Things URL.

```sh
bun run src/cli.ts add --title "Follow up" --when today
bun run src/cli.ts add --title "Follow up" --when today --execute

bun run src/cli.ts update --id <things-id> --append-notes "New note"
bun run src/cli.ts complete --id <things-id>
bun run src/cli.ts cancel --id <things-id>
bun run src/cli.ts reveal <things-id>
```

Update commands automatically read the Things URL auth token from `TMSettings`
and redact it from output.

## Database Discovery

By default, the CLI looks under:

```text
~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-*/Things Database.thingsdatabase/main.sqlite
```

Override it with either:

```sh
THINGS_DB_PATH=/path/to/main.sqlite bun run src/cli.ts doctor
bun run src/cli.ts doctor --db /path/to/main.sqlite
```

## Test

```sh
bun test
```

Tests build real SQLite fixture databases and exercise the reader, CLI parser,
URL builder, and dry-run mutation behavior.

## Sources

- Things URL scheme: https://culturedcode.com/things/support/articles/2803573/
- Things AppleScript support: https://culturedcode.com/things/support/articles/2803572/
- Bun SQLite: https://bun.com/docs/api/sqlite
- Bun test runner: https://bun.com/docs/test
