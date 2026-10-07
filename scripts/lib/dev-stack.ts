/**
 * How the local-dev scripts find the stack they write to, and the one way any
 * of them may read production.
 *
 * `readLocalStack` is the loopback guard. It used to be copied into each script
 * (`dev-auth`, `dev-buckets`, `dev-demo`, `dev-import-fixture`), four copies of
 * the one check that decides whether a script may write at all; it lives here
 * so there is exactly one to get right.
 */
import { execFileSync } from "node:child_process";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/** PostgREST's row cap on the hosted project. A page this size is always a full page or the last one. */
const PAGE = 1000;

/** The fields of `supabase status -o json` the scripts use. */
export interface StackStatus {
  API_URL: string;
  DB_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

export function isLoopback(hostname: string): boolean {
  return LOOPBACK.has(hostname);
}

/**
 * Reads the running stack's own config rather than hardcoding keys, so no
 * script holds credentials or drifts from the stack it targets.
 *
 * The guard: every remote action needs a real token precisely because this
 * refuses to be one. If the stack under the command is not on loopback, it is
 * not the disposable one, and nothing a dev script does should run against it.
 */
export function readLocalStack(): StackStatus {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
  } catch {
    throw new Error("Local stack is not running. Start it with `npm run db:start`.");
  }
  return assertLoopbackStack(JSON.parse(raw) as StackStatus);
}

/**
 * The guard itself, split out so a test can feed it a status that points at a
 * hosted project. Throws unless both the API and the database address are
 * loopback; returns the status untouched otherwise.
 */
export function assertLoopbackStack(status: StackStatus): StackStatus {
  for (const [label, url] of [
    ["API_URL", status.API_URL],
    ["DB_URL", status.DB_URL],
  ] as const) {
    const host = new URL(url).hostname;
    if (!isLoopback(host)) {
      throw new Error(
        `Refusing to run: ${label} points at ${host}, not loopback. ` +
          `This script only ever addresses the local disposable stack.`,
      );
    }
  }
  return status;
}

/**
 * The Supabase CLI's universal development keys are JWTs whose issuer is
 * `supabase-demo`. A hosted project's service-role key is signed with its own
 * secret and carries a different issuer, so a script that is about to delete
 * accounts can refuse one even if a URL somehow looked local.
 */
export function assertDemoKey(label: string, jwt: string): void {
  let issuer: unknown;
  try {
    const payload = jwt.split(".")[1] ?? "";
    issuer = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iss?: unknown }).iss;
  } catch {
    issuer = undefined;
  }
  if (issuer !== "supabase-demo") {
    throw new Error(`Refusing to run: ${label} is not the Supabase CLI's local development key.`);
  }
}

/**
 * The one way a dev script reaches production: a paged GET against PostgREST.
 * There is deliberately no general-purpose client here, so there is no method
 * to get wrong.
 */
export async function remoteRows(
  remote: URL,
  key: string,
  table: string,
  filter: string,
  orderBy: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const query = filter ? `${filter}&` : "";
  for (let offset = 0; ; offset += PAGE) {
    const url = `${remote.origin}/rest/v1/${table}?${query}select=*&order=${orderBy}&limit=${PAGE}&offset=${offset}`;
    const response = await fetch(url, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) {
      throw new Error(`Could not read ${table} from production (${response.status}): ${await response.text()}`);
    }
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/**
 * The remote side is production, and a dev script may only read it. A local
 * address here means the env file points somewhere unexpected, and reading the
 * "template" from the stack we are about to write to would be a quiet no-op at
 * best.
 */
export function assertRemoteUrl(raw: string | undefined): URL {
  if (!raw) {
    throw new Error("VITE_SUPABASE_URL is not set. Run through the npm script, which loads .env.local.");
  }
  const url = new URL(raw);
  if (url.protocol !== "https:" || isLoopback(url.hostname)) {
    throw new Error(`Refusing to read production from ${url.origin}: expected the hosted project over https.`);
  }
  return url;
}
