# Test builds and release builds

Since the security audit of 9 Nov 2026, there are two kinds of packaged Tearsheet.app. Both come
out at `app/dist/mac-arm64/Tearsheet.app`.

| | Release build | Test build |
|---|---|---|
| Made by | `cd app && npm run package` (and `scripts/release.sh`) | `cd app && npm run package:test` |
| Development and test switches (below) | Ignored: removed from the environment at start-up, so the engine never sees them either | Honoured, as in `npm run dev` |
| `--remote-debugging-port` / `--remote-debugging-pipe` | Refuses to start | Allowed |
| Node's `--inspect` | Off (fuse) | Allowed |
| `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` | Off (fuses) | Off (fuses) |
| `Contents/Resources/test-build.txt` | None | Present |

`npm run dev` (not packaged) always honours the switches.

## The switches

`ELECTRON_RENDERER_URL`, `TEARSHEET_DATA_DIR`, `TEARSHEET_DOWNLOADS_DIR`, `TEARSHEET_HIDDEN_WINDOW`,
`TEARSHEET_CLAUDE_BIN`, `TEARSHEET_CODEX_BIN`, `TEARSHEET_TEST_TOOLS`, `TEARSHEET_KEYCHAIN_SERVICE`,
`TEARSHEET_SWITCH_URL`, `TEARSHEET_RELEASES_URL` (the update banner's address) and `TEARSHEET_REPO`. The list lives in `app/src/main/devHooks.ts`
(`DEV_VARIABLES`); a test there fails if the main process reads a `TEARSHEET_` variable that isn't
on it.

## How a test build is told apart

`npm run package:test` sets `TEARSHEET_TEST_BUILD=1` for the whole build:

- `electron.vite.config.ts` bakes `__TEARSHEET_TEST_BUILD__ = true` into the main process's code.
  This is what the app itself checks. Nothing at run time can turn it on: not a variable, a
  command-line switch or a file a user adds.
- `app/build/afterPack.cjs` writes `Contents/Resources/test-build.txt` before the bundle is signed.
  The scripts check it: `scripts/try-new-user.sh` won't start a bundle without it (a release build
  would ignore the test folder and open the real data and the real tools), and
  `scripts/release.sh` stops if the file is there or a fuse is on.
- The fuse for Node's `--inspect` is left on (`-c.electronFuses.enableNodeCliInspectArguments=true`).

`npm run package` sets `TEARSHEET_TEST_BUILD=0` itself, so a variable left in the shell can't make
a release build into a test build by accident.

## Hidden checks on a data copy

Build a test build in your own worktree, never in the main checkout (Liam's own app runs from
`~/code/Tearsheet/app/dist/mac-arm64`):

```bash
cd app && npm run package:test
```

Check it is one:

```bash
test -e app/dist/mac-arm64/Tearsheet.app/Contents/Resources/test-build.txt && echo test build
```

Then launch it hidden as before, from a terminal tab, on a data copy, never taking focus:

```bash
open -g -j -n -F -a app/dist/mac-arm64/Tearsheet.app \
  --env TEARSHEET_DATA_DIR=/path/to/data-copy \
  --env TEARSHEET_HIDDEN_WINDOW=1 \
  --env TEARSHEET_CLAUDE_BIN=/path/to/stand-in/claude \
  --env TEARSHEET_CODEX_BIN=/path/to/stand-in/codex \
  --env TEARSHEET_DOWNLOADS_DIR=/path/to/scratch \
  --env PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring \
  --args --use-mock-keychain --remote-debugging-port=9411 --inspect=9412
```

Always check for the marker first. A release build started this way would ignore every `--env`
above except `PYTHON_KEYRING_BACKEND`, so it would open the **real** data folder and the real AI
tools. The `--remote-debugging-port` switch makes it quit at once instead, before it reads
anything; without that switch it would run, and its setup log would record `dev_hooks_ignored`.

## Before handing a copy to anyone

Only ever hand out a release build (`scripts/release.sh` makes the DMG and zip from one).
