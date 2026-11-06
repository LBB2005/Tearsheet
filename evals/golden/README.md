# Golden set

Twenty companies picked for their hard cases (design item 40). Their inputs are downloaded
once into `~/Tearsheet Golden/` (outside git). After that the check runs offline, with no AI
calls, any time:

```bash
uv run --project engine tearsheet-engine eval golden --freeze        # once, live (slow: Massive's free plan)
uv run --project engine tearsheet-engine eval golden --add-predecessors  # live, SEC only: a newly listed predecessor company
uv run --project engine tearsheet-engine eval golden --draft-checks  # candidate hand checks to verify on EDGAR
uv run --project engine tearsheet-engine eval golden                 # the check
uv run --project engine tearsheet-engine eval golden --update        # after reviewing changes
```

* `tickers.yaml`: the companies, their hard cases and the freeze date.
* `hand_checked.yaml`: numbers checked by hand against EDGAR (within 0.5%; exact for share
  counts and dates).
* `last_run.json`: every rating, score and bear/base/bull value from the last reviewed run.
  Any change since is listed for review.

When a company in the store gets a predecessor listed in `aliases.yaml` (`predecessors`), the
frozen store lacks the old SEC number's data. `--add-predecessors` downloads just that (its
company facts and last two 10-Ks filed by the freeze), and leaves the freeze date alone.
