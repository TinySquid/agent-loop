# AGENTS.md

One-shot terminal agent loop: takes `-p "prompt"`, calls a model through OpenRouter, iterates tool calls until a final answer.

## Running the agent

- `./agent.sh -p "what tools are available to you?"` - the wrapper loads `.env` and forwards args verbatim.
- Without the wrapper: `npm run agent -- -p "..."` - npm requires the double dash before flags.

## Code style

- Prettier is the formatter (`npm run format`)
- ESlint (`npm run lint`)

## Testing

- Tests live only in `tests/` - vitest's include is configured accordingly; don't colocate test files in `src/`.
- Add or update tests for the code you change, even if nobody asked.

## After changes

Run the full check set until everything passes: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`.
