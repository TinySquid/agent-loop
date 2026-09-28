import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse } from "yaml";

const AUTH_FILENAME = "auth.yaml";
const WORKSPACE_DIRNAME = ".agent-loop";
const HOME_CONFIG_SUBPATH = path.join(".config", "agent-loop");
const ENV_KEY_NAME = "OPENROUTER_API_KEY";

/**
 * Error thrown for every invalid credentials state: no auth file found,
 * unreadable or unparseable file, or an auth file without a usable `apiKey`.
 */
export class AuthConfigError extends Error {}

/** Where a credential came from, in resolution priority order. */
export type CredentialSource = "env" | "workspace" | "home";

export interface Credentials {
  apiKey: string;
  source: CredentialSource;
}

/**
 * The environment facts the credentials module needs, as a seam: the
 * production adapter below is the default, tests pass an in-memory adapter.
 */
export interface CredentialEnv {
  getEnv(name: string): string | undefined;
  cwd(): string;
  homeDir(): string;
  exists(filepath: string): boolean;
  readFile(filepath: string): string;
}

const realEnv: CredentialEnv = {
  getEnv: (name) => process.env[name],
  cwd: () => process.cwd(),
  homeDir: () => os.homedir(),
  exists: (filepath) => fs.existsSync(filepath),
  readFile: (filepath) => fs.readFileSync(filepath, "utf-8")
};

interface AuthFileSchema {
  apiKey: string;
}

interface AuthLocation {
  source: CredentialSource;
  filepath: string;
}

/**
 * Search locations for the auth file, in priority order.
 * 1. The workspace dir the command runs from (per-project key).
 * 2. The user's config dir (global key).
 */
function getAuthLocations(env: CredentialEnv): AuthLocation[] {
  return [
    {
      source: "workspace",
      filepath: path.join(
        path.resolve(env.cwd(), WORKSPACE_DIRNAME),
        AUTH_FILENAME
      )
    },
    {
      source: "home",
      filepath: path.join(env.homeDir(), HOME_CONFIG_SUBPATH, AUTH_FILENAME)
    }
  ];
}

/**
 * Resolve the credentials for talking to a model provider.
 * Priority order: env var -> workspace auth file -> home auth file.
 * Throws AuthConfigError when nothing usable is found.
 */
export function resolveApiKey(env: CredentialEnv = realEnv): Credentials {
  const envApiKey = env.getEnv(ENV_KEY_NAME);
  if (envApiKey && envApiKey.length) {
    return { apiKey: envApiKey, source: "env" };
  }

  return loadApiKeyFromFile(env);
}

function loadApiKeyFromFile(env: CredentialEnv): Credentials {
  const locations = getAuthLocations(env);

  const location = locations.find((candidate) =>
    env.exists(candidate.filepath)
  );

  if (!location) {
    const searched = locations
      .map((candidate) => `'${candidate.filepath}'`)
      .join(" or ");
    throw new AuthConfigError(
      `Auth file '${AUTH_FILENAME}' is missing. Create one at ${searched}, or set env '${ENV_KEY_NAME}'.`
    );
  }

  const { filepath, source } = location;
  const content = env.readFile(filepath);

  if (!content.trim()) {
    throw new AuthConfigError(`Auth file '${filepath}' is empty.`);
  }

  let parsedData: unknown;
  try {
    parsedData = parse(content);
  } catch (error) {
    throw new AuthConfigError(
      `Auth file '${filepath}' could not be parsed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (parsedData === null || typeof parsedData !== "object") {
    throw new AuthConfigError(`Auth file '${filepath}' structure invalid.`);
  }

  const apiKey = (parsedData as AuthFileSchema).apiKey;
  if (typeof apiKey !== "string" || !apiKey.length) {
    throw new AuthConfigError(
      `Auth file '${filepath}' is missing a usable 'apiKey' entry.`
    );
  }

  return { apiKey, source };
}
