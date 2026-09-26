# agent-loop

A one-shot terminal agent: takes a prompt, calls a model through OpenRouter, and iterates tool calls until a final answer.

## Language

### Tools

**Tool spec**:
The wire-safe model half of a tool: the OpenRouter function schema (name, description, parameters, and any schema-only fields) that crosses the wire. Every tool carries its spec alongside its implementation; the projection onto the wire lives in one place, so an implementation half never reaches the model.
_Avoid_: tool definition, wire shape, bare schema

**Tool parameter**:
A per-call input the model passes inside a tool call's arguments, declared in the tool's schema (e.g. `timeout_ms`, `offset`, `limit`).
_Avoid_: option, flag, setting

**Tool option**:
A construction-time knob fixed for the whole run, injected by code and invisible to the model (e.g. `capMs`, `maxBytes`). Every tool is built by a factory that takes an options object; options exist so tests can scale timings and sizes down — production always uses the defaults.
_Avoid_: config, environment setting

**Truncation**:
The head-truncation every bounding tool applies to its own output: first N lines subject to a byte cap, whichever limit is hit first, never partial lines. Oversized lines are cut inline to the per-line char cap. The tool, not the model, is responsible for keeping tool output bounded.
_Avoid_: clipping, cutting, pruned output

**Bounded output**:
The seam every bounding tool funnels raw text through: it returns the kept lines plus the continuation notice already built (or empty when nothing was cut). Tools hand in text and caps; the notice format and its character budget live in one place, so a new bounding tool needs zero new truncation code.
_Avoid_: truncation helper, truncate call

**Continuation notice**:
The message appended to truncated tool output telling the model exactly what it saw and how to get more (e.g. `[Showing lines 1–2000 of 3500 (lines limit). Use offset=2001 to continue.]`). Makes paging self-healing: the model never guesses the next offset.
_Avoid_: ellipsis, "..." marker

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
