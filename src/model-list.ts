const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface ModelInfo {
  id: string;
}

/** Thrown when the model list cannot be fetched. Fails hard; no fallback. */
export class ModelListError extends Error {}

export type FetchFn = (url: string) => Promise<Response>;

/**
 * The environment facts the model-list module needs, as a seam: the
 * production adapter below is the default, tests pass fakes.
 */
export interface ModelListEnv {
  fetch: FetchFn;
}

const defaultEnv: ModelListEnv = {
  fetch: (url) => fetch(url)
};

function isModelInfo(value: unknown): value is ModelInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ModelInfo).id === "string"
  );
}

function extractModels(body: unknown): ModelInfo[] {
  const data =
    typeof body === "object" && body !== null
      ? (body as { data?: unknown }).data
      : undefined;
  if (!Array.isArray(data) || !data.every(isModelInfo)) {
    throw new ModelListError(
      "Model list fetch failed: unexpected response shape from the OpenRouter API."
    );
  }
  return data;
}

/**
 * Fetch the current model list from OpenRouter. One-shot: hits the API and
 * returns, with no cache or local state.
 */
export async function fetchModels(
  env: ModelListEnv = defaultEnv
): Promise<ModelInfo[]> {
  let response: Response;
  try {
    response = await env.fetch(OPENROUTER_MODELS_URL);
  } catch (error) {
    throw new ModelListError(
      `Model list fetch failed: could not reach the OpenRouter API (${
        error instanceof Error ? error.message : String(error)
      }).`
    );
  }

  if (!response.ok) {
    throw new ModelListError(
      `Model list fetch failed: OpenRouter API returned ${response.status} ${response.statusText}.`
    );
  }

  try {
    return extractModels(await response.json());
  } catch (error) {
    if (error instanceof ModelListError) {
      throw error;
    }
    throw new ModelListError(
      `Model list fetch failed: invalid JSON from the OpenRouter API (${
        error instanceof Error ? error.message : String(error)
      }).`
    );
  }
}

/** A model is free exactly when its slug ends in the `:free` suffix. */
export function isFreeModel(model: ModelInfo): boolean {
  return model.id.endsWith(":free");
}

/** Sorted slugs of the free models. */
export function freeModelSlugs(models: readonly ModelInfo[]): string[] {
  return models
    .filter(isFreeModel)
    .map((m) => m.id)
    .sort();
}

/** Sorted slugs of all models, excluding free ones. */
export function paidModelSlugs(models: readonly ModelInfo[]): string[] {
  return models
    .filter((m) => !isFreeModel(m))
    .map((m) => m.id)
    .sort();
}
