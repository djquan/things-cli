import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const GROUP_CONTAINER = "JLMPQHK86H.com.culturedcode.ThingsMac";
const DATABASE_BUNDLE = "Things Database.thingsdatabase";
const DATABASE_FILE = "main.sqlite";

export function expandHome(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return path.join(homedir(), input.slice(2));
  }

  return input;
}

export function findThingsDatabasePath(explicitPath = process.env.THINGS_DB_PATH): string {
  if (explicitPath) {
    const expanded = expandHome(explicitPath);
    if (existsSync(expanded)) {
      return expanded;
    }

    throw new Error(`Things database not found at THINGS_DB_PATH: ${expanded}`);
  }

  const base = path.join(homedir(), "Library", "Group Containers", GROUP_CONTAINER);
  if (!existsSync(base)) {
    throw new Error(`Things group container not found: ${base}`);
  }

  const candidates = readdirSync(base)
    .filter((entry) => entry.startsWith("ThingsData-"))
    .map((entry) => path.join(base, entry, DATABASE_BUNDLE, DATABASE_FILE))
    .filter((candidate) => existsSync(candidate))
    .sort();

  const newest = candidates.at(-1);
  if (!newest) {
    throw new Error(`Things database not found under ${base}`);
  }

  return newest;
}
