import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import envPaths from "env-paths";

const CATALOG_FILENAME = "models.json";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface CatalogModel {
  id: string;
}

/** Thrown when a refresh cannot produce a fresh catalog. Refresh fails hard; there is no stale fallback. */
export class CatalogRefreshError extends Error {}

export type FetchFn = (url: string) => Promise<Response>;

/**
 * The environment facts the catalog module needs, as a seam: the production
 * adapter below is the default, tests pass fakes.
 */
export interface ModelCatalogEnv {
  fetch: FetchFn;
  catalogDir(): string;
}

const defaultEnv: ModelCatalogEnv = {
  fetch: (url) => fetch(url),
  catalogDir: () => envPaths("agent-loop").cache
};

/**
 * The model catalog: OpenRouter's model list, cached in the user's cache
 * dir so the list commands work without hitting the API. Nothing outside
 * this module knows the cache file's name, format, or location.
 */
export interface ModelCatalog {
  /** Path of the cache file, for error messages only. */
  readonly filepath: string;
  /** The cached catalog, or null when no usable cache exists. Never hits the network. */
  read(): Promise<CatalogModel[] | null>;
  /** Fetch the current catalog from OpenRouter, replace the cache, return it. Fails hard. */
  refresh(): Promise<CatalogModel[]>;
}

function isCatalogModel(value: unknown): value is CatalogModel {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CatalogModel).id === "string"
  );
}

function parseCatalog(content: string): CatalogModel[] | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter(isCatalogModel);
  } catch {
    return null;
  }
}

function extractModels(body: unknown): CatalogModel[] {
  const data =
    typeof body === "object" && body !== null
      ? (body as { data?: unknown }).data
      : undefined;
  if (!Array.isArray(data) || !data.every(isCatalogModel)) {
    throw new CatalogRefreshError(
      "Model catalog refresh failed: unexpected response shape from the OpenRouter API."
    );
  }
  return data;
}

export function createModelCatalog(
  env: ModelCatalogEnv = defaultEnv
): ModelCatalog {
  const filepath = path.join(env.catalogDir(), CATALOG_FILENAME);

  async function read(): Promise<CatalogModel[] | null> {
    let content: string;
    try {
      content = await readFile(filepath, "utf-8");
    } catch {
      return null;
    }
    return parseCatalog(content);
  }

  async function refresh(): Promise<CatalogModel[]> {
    let response: Response;
    try {
      response = await env.fetch(OPENROUTER_MODELS_URL);
    } catch (error) {
      throw new CatalogRefreshError(
        `Model catalog refresh failed: could not reach the OpenRouter API (${
          error instanceof Error ? error.message : String(error)
        }).`
      );
    }

    if (!response.ok) {
      throw new CatalogRefreshError(
        `Model catalog refresh failed: OpenRouter API returned ${response.status} ${response.statusText}.`
      );
    }

    let models: CatalogModel[];
    try {
      models = extractModels(await response.json());
    } catch (error) {
      if (error instanceof CatalogRefreshError) {
        throw error;
      }
      throw new CatalogRefreshError(
        `Model catalog refresh failed: invalid JSON from the OpenRouter API (${
          error instanceof Error ? error.message : String(error)
        }).`
      );
    }

    await mkdir(env.catalogDir(), { recursive: true });
    await writeFile(filepath, JSON.stringify(models));
    return models;
  }

  return { filepath, read, refresh };
}

/** A model is free exactly when its slug ends in the `:free` suffix. */
export function isFreeModel(model: CatalogModel): boolean {
  return model.id.endsWith(":free");
}

/** Sorted slugs of the free models. */
export function freeModelSlugs(models: readonly CatalogModel[]): string[] {
  return models
    .filter(isFreeModel)
    .map((m) => m.id)
    .sort();
}

/** Sorted slugs of all models, excluding free ones. */
export function paidModelSlugs(models: readonly CatalogModel[]): string[] {
  return models
    .filter((m) => !isFreeModel(m))
    .map((m) => m.id)
    .sort();
}
