import { spawnSync } from "node:child_process";
import { ThingsStore } from "./db";

export type MutationCommand = "add" | "update" | "update-project" | "show" | "search" | "json";

export interface MutationPlan {
  command: MutationCommand;
  params: Record<string, string | boolean | number | null | undefined>;
  execute: boolean;
  url: string;
  redactedUrl: string;
}

const AUTH_REQUIRED = new Set<MutationCommand>(["update", "update-project", "json"]);

export function buildThingsUrl(
  command: MutationCommand,
  params: Record<string, string | boolean | number | null | undefined>
): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value == null ? "" : String(value))}`)
    .join("&");

  return `things:///${command}${query ? `?${query}` : ""}`;
}

export function redactThingsUrl(url: string): string {
  return url.replace(/([?&]auth-token=)[^&]+/g, "$1[redacted]");
}

export async function runMutation(
  store: ThingsStore,
  command: MutationCommand,
  params: Record<string, string | boolean | number | null | undefined>,
  execute: boolean
): Promise<Record<string, unknown>> {
  const nextParams = { ...params };
  if (AUTH_REQUIRED.has(command) && !nextParams["auth-token"]) {
    const token = store.authToken();
    if (!token) {
      throw new Error("Things URL auth token is required but was not found in TMSettings");
    }
    nextParams["auth-token"] = token;
  }

  const url = buildThingsUrl(command, nextParams);
  const plan: MutationPlan = {
    command,
    params: redactParams(nextParams),
    execute,
    url,
    redactedUrl: redactThingsUrl(url)
  };

  if (!execute) {
    return {
      ok: true,
      dryRun: true,
      plan: {
        command: plan.command,
        params: plan.params,
        url: plan.redactedUrl
      }
    };
  }

  const before = typeof nextParams.id === "string" ? store.show(nextParams.id) : null;
  const result = spawnSync("open", [url], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `open exited with status ${result.status}`);
  }

  await Bun.sleep(1200);
  const after = typeof nextParams.id === "string" ? store.show(nextParams.id) : null;

  return {
    ok: true,
    dryRun: false,
    command,
    url: plan.redactedUrl,
    verified: typeof nextParams.id === "string" ? Boolean(after) : null,
    before,
    after
  };
}

function redactParams(
  params: Record<string, string | boolean | number | null | undefined>
): Record<string, string | boolean | number | null | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, key === "auth-token" ? "[redacted]" : value])
  );
}
