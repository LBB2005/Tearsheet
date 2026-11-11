## What this changes

<!-- One or two sentences. Link the issue: "Fixes #12". -->

## Why

## How I tested it

- [ ] `cd engine && uv run ruff check . ../scripts && uv run ruff format --check . ../scripts && uv run pytest`
- [ ] `cd app && npm run typecheck && npm run coverage && npm run build`
- [ ] No test or check ran a live report on a real company (offline fakes, or a copy of the data with stand-in AI tools)

## Checklist

- [ ] If a number, score or the rating changed: a test shows it, and stored runs still replay identically
- [ ] If the engine's protocol changed: `npm run gen-types` and `app/src/shared/protocol.ts` committed
- [ ] Screenshots for anything you can see in the app
- [ ] No keys, tokens, personal email addresses or home-folder paths in the diff
