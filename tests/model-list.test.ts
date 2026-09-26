import { describe, expect, it } from "vitest";
import {
  fetchModels,
  freeModelSlugs,
  isFreeModel,
  ModelListError,
  paidModelSlugs,
  type FetchFn,
  type ModelListEnv
} from "../src/model-list.js";

function makeEnv(fetchFn: FetchFn): ModelListEnv {
  return { fetch: fetchFn };
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

describe("fetchModels", () => {
  it("hits the models endpoint and returns the models", async () => {
    const requested: string[] = [];
    const env = makeEnv(async (url) => {
      requested.push(url);
      return jsonResponse(API_BODY);
    });

    const models = await fetchModels(env);

    expect(requested).toEqual(["https://openrouter.ai/api/v1/models"]);
    expect(models).toEqual(API_BODY.data);
  });

  it("unwraps the { data: [...] } envelope", async () => {
    const env = makeEnv(async () => jsonResponse(API_BODY));
    await expect(fetchModels(env)).resolves.toEqual(API_BODY.data);
  });

  it("fails hard on an HTTP error", async () => {
    const env = makeEnv(async () => jsonResponse({}, 500));
    await expect(fetchModels(env)).rejects.toThrow(ModelListError);
  });

  it("fails hard when the network is unreachable", async () => {
    const env = makeEnv(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(fetchModels(env)).rejects.toThrow(/ECONNREFUSED/);
  });

  it("fails hard on invalid JSON from the API", async () => {
    const env = makeEnv(
      async () =>
        new Response("<html>gateway error</html>", {
          status: 200,
          statusText: "OK"
        })
    );
    await expect(fetchModels(env)).rejects.toThrow(ModelListError);
  });

  it("fails hard on an unexpected response shape", async () => {
    const env = makeEnv(async () => jsonResponse({ nope: true }));
    await expect(fetchModels(env)).rejects.toThrow(/unexpected response shape/);
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
