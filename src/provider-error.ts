/**
 * Formatting for errors thrown by the OpenRouter SDK. The SDK's HTTP errors
 * are duck-typed rather than imported: they carry a numeric `statusCode` and
 * the raw response `body`, and importing SDK error classes here would couple
 * the CLI's error path to generated code.
 */
interface ProviderLikeError {
  statusCode: number;
  body: string;
}

interface ApiErrorEnvelope {
  error?: {
    message?: unknown;
    metadata?: {
      raw?: unknown;
      remedy_hint?: unknown;
    };
  };
}

/**
 * Render an OpenRouter API error as a multi-line, actionable message, or
 * null when the error is not one of the SDK's HTTP errors (plain errors are
 * printed by the CLI as-is).
 */
export function formatProviderError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as Partial<ProviderLikeError>;

  if (
    typeof candidate.statusCode !== "number" ||
    typeof candidate.body !== "string"
  ) {
    return null;
  }

  let detail = candidate.body.trim();
  let parsed: ApiErrorEnvelope | null = null;

  try {
    parsed = JSON.parse(candidate.body) as ApiErrorEnvelope;
  } catch {
    parsed = null;
  }

  if (parsed?.error) {
    const parts: string[] = [];

    if (typeof parsed.error.message === "string") {
      parts.push(parsed.error.message);
    }

    const metadata = parsed.error.metadata;

    if (typeof metadata?.raw === "string") {
      parts.push(metadata.raw);
    }

    if (typeof metadata?.remedy_hint === "string") {
      parts.push(`remedy: ${metadata.remedy_hint}`);
    }

    if (parts.length > 0) {
      detail = parts.join("\n  ");
    }
  }

  return `OpenRouter API error ${candidate.statusCode}\n  ${detail}`;
}
