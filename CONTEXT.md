# agent-loop

A one-shot terminal agent: takes a prompt, calls a model through OpenRouter, and iterates tool calls until a final answer.

## Language

### Invocation

**Prompt**:
The user's instruction given to the agent loop for a single run.
_Avoid_: question, message, query

### Models

**Model slug**:
The OpenRouter identifier for a model, e.g. `google/gemma-4-31b-it:free`.
_Avoid_: model name, model id (when spoken casually), model key

**Free model**:
A model whose slug ends in `:free` and costs nothing per request.

**Model list**:
The set of models OpenRouter currently offers, fetched from the API each time a list command runs. There is no cache.
_Avoid_: model catalog, cached catalog

### Credentials

**Credential**:
The API key used to talk to a model provider, plus where it came from. Sources, in priority order: the `OPENROUTER_API_KEY` env var, the workspace auth file, then the home auth file. A resolved credential carries its `source`: `env`, `workspace`, or `home`. Every invalid state raises an auth config error.
_Avoid_: API key (when discussing resolution), token
