import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CatalogRefreshError,
  createModelCatalog,
  freeModelSlugs,
  isFreeModel,
  paidModelSlugs,
  type FetchFn,
  type ModelCatalogEnv
} from "../src/model-catalog.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function makeEnv(
  fetchFn: FetchFn
): Promise<{ env: ModelCatalogEnv; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-loop-catalog-"));
  tmpDirs.push(dir);
  return { env: { fetch: fetchFn, catalogDir: () => dir }, dir };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Internal Server Error"
  });
}

const API_BODY = {
  data: [
    { id: "qwen/qwen3.8-27b:free" },
    { id: "fireworks/ember-1" },
    { id: "inclusionai/ling-3.0-flash-fin:free" }
  ]
};

describe("read", () => {
  it("returns null when no cache exists", async () => {
    const { env } = await makeEnv(() => {
      throw new Error("should not fetch");
    });
    const catalog = createModelCatalog(env);
    expect(await catalog.read()).toBeNull();
  });

  it("reads a cached catalog array", async () => {
    const { env, dir } = await makeEnv(() => {
      throw new Error("should not fetch");
    });
    await writeFile(
      path.join(dir, "models.json"),
      JSON.stringify([{ id: "fireworks/ember-1" }])
    );
    const catalog = createModelCatalog(env);
    expect(await catalog.read()).toEqual([{ id: "fireworks/ember-1" }]);
  });

  it("returns null for a corrupt cache", async () => {
    const { env, dir } = await makeEnv(() => {
      throw new Error("should not fetch");
    });
    await writeFile(path.join(dir, "models.json"), "not json{");
    const catalog = createModelCatalog(env);
    expect(await catalog.read()).toBeNull();
  });

  it("returns null for a cache that is not an array", async () => {
    const { env, dir } = await makeEnv(() => {
      throw new Error("should not fetch");
    });
    await writeFile(path.join(dir, "models.json"), JSON.stringify({ a: 1 }));
    const catalog = createModelCatalog(env);
    expect(await catalog.read()).toBeNull();
  });
});

describe("refresh", () => {
  it("fetches the API, writes the cache, and returns the models", async () => {
    const requested: string[] = [];
    const { env, dir } = await makeEnv(async (url) => {
      requested.push(url);
      return jsonResponse(API_BODY);
    });
    const catalog = createModelCatalog(env);

    const models = await catalog.refresh();

    expect(requested).toEqual(["https://openrouter.ai/api/v1/models"]);
    expect(models).toHaveLength(3);
    const cached = JSON.parse(
      await readFile(path.join(dir, "models.json"), "utf-8")
    );
    expect(cached).toHaveLength(3);
    expect(await catalog.read()).toEqual(API_BODY.data);
  });

  it("creates the cache dir when missing", async () => {
    const { env, dir } = await makeEnv(async () => jsonResponse(API_BODY));
    const nested = path.join(dir, "a", "b");
    const catalog = createModelCatalog({
      fetch: env.fetch,
      catalogDir: () => nested
    });
    await catalog.refresh();
    expect(await catalog.read()).toEqual(API_BODY.data);
  });

  it("unwraps the { data: [...] } envelope", async () => {
    const { env } = await makeEnv(async () => jsonResponse(API_BODY));
    const models = await createModelCatalog(env).refresh();
    expect(models).toEqual(API_BODY.data);
  });

  it("fails hard on an HTTP error and leaves the cache untouched", async () => {
    const { env, dir } = await makeEnv(async () => jsonResponse({}, 500));
    const existing = [{ id: "old/model" }];
    await writeFile(path.join(dir, "models.json"), JSON.stringify(existing));

    await expect(createModelCatalog(env).refresh()).rejects.toThrow(
      CatalogRefreshError
    );
    await expect(createModelCatalog(env).read()).resolves.toEqual(existing);
  });

  it("fails hard when the network is unreachable", async () => {
    const { env } = await makeEnv(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(createModelCatalog(env).refresh()).rejects.toThrow(
      /ECONNREFUSED/
    );
  });

  it("fails hard on invalid JSON from the API", async () => {
    const { env } = await makeEnv(
      async () =>
        new Response("<html>gateway error</html>", {
          status: 200,
          statusText: "OK"
        })
    );
    await expect(createModelCatalog(env).refresh()).rejects.toThrow(
      CatalogRefreshError
    );
  });

  it("fails hard on an unexpected response shape", async () => {
    const { env } = await makeEnv(async () => jsonResponse({ nope: true }));
    await expect(createModelCatalog(env).refresh()).rejects.toThrow(
      /unexpected response shape/
    );
  });
});

describe("slug filters", () => {
  it("identifies free models by the :free suffix", () => {
    expect(isFreeModel({ id: "a/b:free" })).toBe(true);
    expect(isFreeModel({ id: "a/b" })).toBe(false);
  });

  it("freeModelSlugs filters and sorts", () => {
    expect(freeModelSlugs(API_BODY.data)).toEqual([
      "inclusionai/ling-3.0-flash-fin:free",
      "qwen/qwen3.8-27b:free"
    ]);
  });

  it("paidModelSlugs excludes free models and sorts", () => {
    expect(paidModelSlugs(API_BODY.data)).toEqual(["fireworks/ember-1"]);
  });
});
