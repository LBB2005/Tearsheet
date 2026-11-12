Tearsheet writes research reports on S&P 500 companies. Code makes every number from public
data. Your own AI tool reads the filings and writes the cited text.

General research, not personalised investment advice. Tearsheet is free, open-source
software under the MIT licence, provided as is, with no warranty.

## This is a beta

It's for a few friends trying it first, so expect rough edges, and treat ratings and ranges as a
work in progress. When a newer version is out, a line under the app's toolbar says so (turn it off
with Check for updates in Settings → About and help); download it from this page.
To send feedback, choose Help → Send Feedback… in the app, or email lbb.aifinance@gmail.com. For
a bug, paste in Settings → About and help → Copy diagnostics. Nothing is sent until you send it.

## What you need

*   A Mac with Apple Silicon running macOS 15 Sequoia or later. The steps below say how to
    check.
*   A paid Claude plan (like Pro or Max) or a paid ChatGPT plan. Tearsheet's setup screen
    helps with the rest.
*   No GitHub account.

## Which file to download

*   **Tearsheet-{{VERSION}}-arm64.dmg**: use this one.
*   **Tearsheet-{{VERSION}}-arm64.zip**: the same app in a zip, if the .dmg won't open.
*   **SHA256SUMS.txt**: checksums, only if you want to check your download.

## How to open Tearsheet

{{HOW_TO_OPEN}}

## Checksums

```text
{{CHECKSUMS}}
```

To check a download, open Terminal, type `shasum -a 256 ` (with the space at the end), drag the
file into the Terminal window and press Return. The long code it prints should match the line
above.
