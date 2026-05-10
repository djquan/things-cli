# AGENTS.md

## Project Purpose

This repo is a Bun CLI for Things 3, optimized for LLM ingestion and safe task-list interaction.

The central contract is:

- Read Things data directly from the local SQLite database in readonly mode.
- Mutate Things only through supported Things interfaces, currently the URL scheme.
- Emit deterministic JSON for automation and LLM callers.
- Do not write directly to the Things SQLite database.

## Architecture

Key files:

- `src/cli.ts`: command routing and argument parsing.
- `src/db.ts`: readonly SQLite access and normalized Things model.
- `src/dates.ts`: Things date and reminder-time encoding helpers.
- `src/mutate.ts`: Things URL-scheme mutation planner/executor.
- `src/path.ts`: local Things database discovery.
- `test/helpers/fixture-db.ts`: real SQLite fixture generation for tests.

Read commands should return JSON and avoid prose. Mutation commands should dry-run unless the caller passes `--execute`.

## Things Data Safety

- Open Things SQLite with `readonly: true`.
- Never add direct SQLite writes to Things data without explicit user approval and a new safety design.
- Do not print `uriSchemeAuthenticationToken` or any generated URL containing the raw token.
- Schema drift should fail loudly through `doctor`, not silently produce misleading data.
- If a command reads broad task content, avoid pasting large personal task dumps into chat unless the user asks for the output.

## Commands

Use Bun.

```sh
bun run src/cli.ts doctor
bun run src/cli.ts snapshot
bun run src/cli.ts today
bun run src/cli.ts context --budget 12000
```

Installed/local-linked forms may also work:

```sh
things-cli doctor
things doctor
```

## Testing

The user strongly prefers real unit or e2e tests, not mocks. For this repo, use real SQLite fixture databases.

Run the tests you touched:

```sh
bun test
```

Before changing mutation behavior, add or update tests for:

- dry-run output,
- auth-token redaction,
- URL construction,
- read-back verification behavior where practical.

Only run live `--execute` mutations against the user's Things database when explicitly asked or when the task clearly requires it. If doing so, create disposable data, verify it, and clean it up deliberately.

## Dependency Policy

Avoid dependencies unless they buy clear maintenance value. Bun already provides:

- runtime,
- test runner,
- SQLite driver.

If adding a dependency, research maintained options first and confirm the fit with the user.

## Style

- Keep the CLI boring and machine-friendly.
- Prefer small functions and explicit JSON shapes.
- Avoid comments unless the code is decoding a Things-specific format or making a non-obvious safety choice.
- Do not leave breadcrumbs when deleting or moving code.
