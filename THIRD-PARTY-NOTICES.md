# Third-party notices

Tearsheet's own code is under the MIT licence (`LICENSE`). The app includes, or adapts, the
software below. In the built app these notices sit in `Tearsheet.app/Contents/Resources/`.

## Realm: adapted code

Tearsheet's AI-tool detection, sign-in check and PATH fix are adapted from Realm
(https://github.com/31Carlton7/realm). The adapted files are `app/src/main/probe.ts`,
`app/src/main/tools.ts` and `app/src/main/loginShellPath.ts`. Realm's licence:

```
MIT License

Copyright (c) 2026 Carlton Aikins

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Electron and Chromium

The app runs on Electron (MIT), which includes Chromium and other open-source software. Their
licence texts ship in the built app as `Contents/Resources/LICENSE.electron.txt` and
`Contents/Resources/LICENSES.chromium.html`.

## React

The window is built with React, React DOM and Scheduler, which are bundled into the app's own
code. Their licence (the same text for all three):

```
MIT License

Copyright (c) Facebook, Inc. and its affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Python and the engine's packages

The engine runs on its own copy of CPython 3.12 (python-build-standalone), under the Python
Software Foundation License; its licence text is `Contents/Resources/engine/lib/python3.12/LICENSE.txt`.

`scripts/build-engine.sh` lists every Python package it installs, with its version and licence,
in `Contents/Resources/engine/PYTHON-PACKAGES.md`. Each package's full licence text ships beside
it, in its `.dist-info` folder under `Contents/Resources/engine/lib/python3.12/site-packages/`.
Most are under the MIT, BSD or Apache 2.0 licences. Some notes:

- **certifi, orjson and tqdm** include code under the Mozilla Public License 2.0. Their source is
  unchanged and available from each project.
- **tld** is offered under MPL 1.1, GPL 2.0 or LGPL 2.1; Tearsheet uses it under MPL 1.1.
- **Unidecode** (GPL 2.0 or later) is a dependency of edgartools, but only edgartools' company-name
  search uses it, and Tearsheet never calls that. The built app therefore ships a small stand-in
  of Tearsheet's own instead (`scripts/bundle/unidecode/`, MIT), and not Unidecode itself.
