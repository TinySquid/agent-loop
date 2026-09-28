import { describe, expect, it } from "vitest";
import {
  AuthConfigError,
  resolveApiKey,
  type CredentialEnv
} from "../src/credentials.js";

const WORKSPACE_AUTH_FILE = "/project/.agent-loop/auth.yaml";
const HOME_AUTH_FILE = "/home/tester/.config/agent-loop/auth.yaml";

function fakeEnv(
  files: Record<string, string> = {},
  envVars: Record<string, string> = {}
): CredentialEnv {
  return {
    getEnv: (name) => envVars[name],
    cwd: () => "/project",
    homeDir: () => "/home/tester",
    exists: (filepath) => filepath in files,
    readFile: (filepath) => files[filepath] ?? ""
  };
}

describe("resolveApiKey", () => {
  it("returns the env key when set", () => {
    const { apiKey, source } = resolveApiKey(
      fakeEnv({}, { OPENROUTER_API_KEY: "env-key" })
    );

    expect(apiKey).toBe("env-key");
    expect(source).toBe("env");
  });

  it("prefers env over the auth file", () => {
    const env = fakeEnv(
      { [WORKSPACE_AUTH_FILE]: "apiKey: file-key" },
      { OPENROUTER_API_KEY: "env-key" }
    );
    expect(resolveApiKey(env)).toEqual({ apiKey: "env-key", source: "env" });
  });

  it("reads the auth file from the workspace dir", () => {
    const env = fakeEnv({ [WORKSPACE_AUTH_FILE]: "apiKey: workspace-key" });
    expect(resolveApiKey(env)).toEqual({
      apiKey: "workspace-key",
      source: "workspace"
    });
  });

  it("prefers the workspace auth file over the home auth file", () => {
    const env = fakeEnv({
      [WORKSPACE_AUTH_FILE]: "apiKey: workspace-key",
      [HOME_AUTH_FILE]: "apiKey: home-key"
    });
    expect(resolveApiKey(env)).toEqual({
      apiKey: "workspace-key",
      source: "workspace"
    });
  });

  it("falls back to the home auth file", () => {
    const env = fakeEnv({ [HOME_AUTH_FILE]: "apiKey: home-key" });
    expect(resolveApiKey(env)).toEqual({ apiKey: "home-key", source: "home" });
  });

  it("throws AuthConfigError listing searched paths when no auth file exists", () => {
    expect(() => resolveApiKey(fakeEnv())).toThrow(AuthConfigError);

    expect(() => resolveApiKey(fakeEnv())).toThrow(
      /'\/project\/\.agent-loop\/auth\.yaml' or '\/home\/tester\/\.config\/agent-loop\/auth\.yaml'/
    );
  });

  it("throws on an empty auth file", () => {
    const env = fakeEnv({ [WORKSPACE_AUTH_FILE]: "   \n" });

    expect(() => resolveApiKey(env)).toThrow(/is empty/);
  });

  it("throws on an unparseable auth file", () => {
    const env = fakeEnv({ [WORKSPACE_AUTH_FILE]: "apiKey: [unclosed" });

    expect(() => resolveApiKey(env)).toThrow(AuthConfigError);

    expect(() => resolveApiKey(env)).toThrow(/could not be parsed/);
  });

  it("throws on a structurally invalid auth file", () => {
    const env = fakeEnv({ [WORKSPACE_AUTH_FILE]: "just a string" });

    expect(() => resolveApiKey(env)).toThrow(/structure invalid/);
  });

  it("throws when the auth file has no apiKey entry", () => {
    const env = fakeEnv({ [WORKSPACE_AUTH_FILE]: "other: value" });

    expect(() => resolveApiKey(env)).toThrow(/missing a usable 'apiKey'/);
  });

  it("throws when the apiKey entry is not a string", () => {
    const env = fakeEnv({ [WORKSPACE_AUTH_FILE]: "apiKey: 123" });

    expect(() => resolveApiKey(env)).toThrow(/missing a usable 'apiKey'/);
  });

  it("throws when the apiKey entry is an empty string", () => {
    const env = fakeEnv({ [WORKSPACE_AUTH_FILE]: 'apiKey: ""' });

    expect(() => resolveApiKey(env)).toThrow(/missing a usable 'apiKey'/);
  });
});
