# AI signal fixtures

Each JSON file holds one signal, or a list of them, that an AI tool printed for an error:
the tool, the text (`signal`), the engine error it must map to (`expected`) and, for usage
limits, the reset time read from it. `test_ai_client.py` checks every file against the error
table in `src/tearsheet/ai/client.py`.

`claude_drafted.json` is drafted from what Claude Code is believed to print. Phase 0
replaces it with recordings:

*   **Signed out:** `scripts/phase0/signals.py` writes `claude_signed_out_recorded.json`, using an
    empty temporary config folder so the real sign-in is untouched.
*   **Usage limit:** the engine saves each usage-limit message in the data folder's
    `logs/ai-signals/` when one happens. Copy it here in the same shape.

Codex's fixtures arrive with its connector in Phase 2.
