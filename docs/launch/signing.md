# Signing, notarization and auto-update

Status (11 Nov 2026): **wired, switched off.** Nothing is signed with a Developer ID yet. Every build
today is signed ad hoc, so macOS asks people to click **Open Anyway** the first time, and the app
can't update itself. It shows an update banner instead.

Everything below switches on from environment variables alone. No code change is needed on the day
you sign.

## What happens with and without the variables

| | No certificate in the environment (today) | `CSC_LINK` or `CSC_NAME` set |
|---|---|---|
| `npm run package` | Same as before: target `dir`, signed ad hoc (`identity: "-"`), no hardened runtime, no notarization, no `publish` block | Signed with your Developer ID, hardened runtime with `app/build/entitlements.mac.plist`, DMG + zip, `latest-mac.yml` |
| Notarized? | No | Yes, if one full set of `APPLE_*` variables is set too (below) |
| `npm run package:test` | Ad hoc | **Still ad hoc.** A test build is never signed with a Developer ID |
| Updates in the app | Update banner (`app/src/main/updates.ts`) | electron-updater (`app/src/main/autoUpdate.ts`): downloads in the background, installs at quit |

Where it lives:

- `app/build/signing.cjs`: reads the variables and picks the settings (tested in `app/src/main/packaging.test.ts`).
- `app/electron-builder.cjs`: the build settings (it replaced `electron-builder.yml`; with no
  certificate it holds the same values, checked by the test).
- `app/build/entitlements.mac.plist`: the hardened runtime's three exceptions (JIT and unsigned
  executable memory for V8 and Python's ctypes, and library validation off so the bundled
  Python can load its extension modules). It goes on the app and on everything inside it,
  including the engine's interpreter.
- The app decides at launch: a packaged release build whose `codesign -dv` shows
  `Authority=Developer ID Application:` uses electron-updater. Every other copy uses the banner.
  "Check for updates" in Settings → About and help turns off both.

## The variables

Signing (pick one):

| Variable | What it is |
|---|---|
| `CSC_NAME` | The name of the Developer ID Application identity in your login keychain, for example `Liam Blackshaw-Brown (ABCDE12345)`. Easiest on your own Mac. |
| `CSC_LINK` + `CSC_KEY_PASSWORD` | A `.p12` export of the certificate (a file path or base64) and its password. For CI later. |

Notarization (pick one full set; a half set is ignored and the build is signed but not notarized):

| Set | Variables |
|---|---|
| Keychain profile (recommended) | `APPLE_KEYCHAIN_PROFILE` (and `APPLE_KEYCHAIN` if the profile isn't in the login keychain) |
| Apple ID | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| App Store Connect API key | `APPLE_API_KEY` (path to the `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |

Publishing (only if you let electron-builder upload): `GH_TOKEN`, a GitHub token with `contents: write`
on the repository.

**Never commit any of these.** Don't put them in the repository, in `package.json`, or in a file inside
the repository. Set them in the terminal for the one release run, or keep them in the Keychain as
below.

## Steps for Liam after buying the Apple Developer Program ($99 a year)

You do these yourself. Claude never signs in, buys or enters a credential.

### 1. Join the program

1. Go to <https://developer.apple.com/programs/enroll/> and enrol as an **individual** with your
   Apple Account. Two-factor authentication must be on.
2. Wait for the confirmation email (often a day or two).
3. Note your **Team ID**: <https://developer.apple.com/account> → Membership details. It looks like
   `ABCDE12345`.

### 2. Make a Developer ID Application certificate

The simplest way, with Xcode installed:

1. Xcode → Settings → Accounts → add your Apple Account if it isn't there.
2. Select the team → **Manage Certificates…** → **+** → **Developer ID Application**.
3. Check it is in the login keychain:

   ```bash
   security find-identity -v -p codesigning
   ```

   You should see a line with `Developer ID Application: <your name> (<Team ID>)`.

Without Xcode: Keychain Access → Certificate Assistant → Request a Certificate From a Certificate
Authority (saved to disk), then <https://developer.apple.com/account/resources/certificates/add> →
Developer ID Application → upload the request → download the `.cer` and double-click it.

Back up the certificate and its private key: Keychain Access → My Certificates → right-click it →
Export → `.p12` with a strong password. Keep that file **outside** the repository (a password
manager is a good place). Losing the key means making a new certificate.

### 3. Make an app-specific password and store it for notarization

1. <https://account.apple.com> → Sign-In and Security → **App-Specific Passwords** → +, name it
   "Tearsheet notarization".
2. Store it in your Keychain once, so no password sits in a file or your shell history:

   ```bash
   xcrun notarytool store-credentials tearsheet --apple-id "<your Apple ID email>" --team-id "<Team ID>"
   ```

   It asks for the app-specific password and saves a profile named `tearsheet`.

### 4. Build a signed, notarized release

From a clean checkout of the commit you are releasing (in a worktree, not the main checkout, whose
`app/dist/mac-arm64` is your running app):

```bash
cd app
CSC_NAME="<your name> (<Team ID>)" APPLE_KEYCHAIN_PROFILE=tearsheet npm run package
```

The first line of electron-builder's output says `Tearsheet signing: signed from CSC_NAME, notarized
with keychain-profile`. Notarization takes a few minutes. Then `app/dist` holds:

- `mac-arm64/Tearsheet.app` (signed, notarized, stapled)
- `Tearsheet-<version>-arm64.dmg` and `Tearsheet-<version>-arm64.zip`, each with a `.blockmap`
- `latest-mac.yml` (electron-updater's feed: version, file names, sizes, SHA-512s)

Check it:

```bash
codesign -dv --verbose=2 dist/mac-arm64/Tearsheet.app 2>&1 | grep -E "Authority=Developer ID|flags=.*runtime"
spctl -a -vvv -t exec dist/mac-arm64/Tearsheet.app
xcrun stapler validate dist/mac-arm64/Tearsheet.app
```

`spctl` should say `accepted` and `source=Notarized Developer ID`.

Then run the app once on a copy of your data, make one report with the stand-in tools, and check the
engine starts (the hardened runtime is what could stop it). If the engine fails with a "library
validation" or "code signature" error in `logs/engine.log`, the entitlements need a look.

### 5. Publish the release

electron-updater finds updates through `latest-mac.yml` on the newest GitHub release, so the release
must have these files, with exactly the names electron-builder gave them:

- `Tearsheet-<version>-arm64.dmg` and its `.blockmap`
- `Tearsheet-<version>-arm64.zip` and its `.blockmap`
- `latest-mac.yml`

Either upload them by hand:

```bash
gh release create v<version> --title "Tearsheet <version>" --notes-file <notes> --prerelease \
  dist/Tearsheet-<version>-arm64.dmg dist/Tearsheet-<version>-arm64.dmg.blockmap \
  dist/Tearsheet-<version>-arm64.zip dist/Tearsheet-<version>-arm64.zip.blockmap \
  dist/latest-mac.yml
```

or let electron-builder upload them to a **draft** release that you then publish by hand:

```bash
GH_TOKEN=<token> CSC_NAME="…" APPLE_KEYCHAIN_PROFILE=tearsheet npx electron-builder --publish always
```

Drop `--prerelease` once a version is a full release. A beta copy is offered the next beta and the
next release; a release copy is offered releases only.

`scripts/release.sh` still makes its own DMG with hdiutil and its own zip with ditto, which don't
match `latest-mac.yml`. Before the first signed release it needs a signed mode that uploads
electron-builder's files instead (and drops "How to open Tearsheet.txt", which a notarized build
doesn't need). That is listed in `docs/launch/prelaunch-checklist.md`.

## What people see

- **On 0.1.0-beta (ad hoc):** the banner, "Tearsheet X is out · Download · What's new · Dismiss".
  They download the signed DMG once by hand.
- **On a signed copy:** no banner. electron-updater downloads the next version in the background and
  installs it when they quit. They never see Gatekeeper's warning again.
- **Keychain:** the first signed copy is a new signer to macOS, so it asks once more whether
  "Tearsheet Engine" may read the Tearsheet Keychain items. **Always Allow** fixes it. Say so in that
  release's notes.

## After the first signed build

- Try removing `com.apple.security.cs.allow-unsigned-executable-memory`, then
  `disable-library-validation`, one at a time, and run a full report each time. Keep only what the
  engine needs.
- Add a release workflow (`.github/workflows/release.yml`, design item 51) with the `.p12` and the
  API key as repository secrets, if you want CI to build releases.
