// electron-builder's afterPack hook (electron-builder.cjs). A test build — `npm run package:test`,
// which sets TEARSHEET_TEST_BUILD=1 for the whole build — gets Contents/Resources/test-build.txt,
// so scripts/try-new-user.sh and the hidden checks can refuse to start a release build with test
// switches. Every other build is checked to have none. It runs before the fuses are flipped and
// the bundle is signed, so the file is part of the signature.
const { existsSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const MARKER = 'test-build.txt'

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const marker = join(app, 'Contents', 'Resources', MARKER)
  if (process.env.TEARSHEET_TEST_BUILD === '1') {
    writeFileSync(
      marker,
      'A Tearsheet test build: it honours the development and test switches (docs/test-builds.md).\n' +
        'Never hand this copy to anyone. Release builds come from `npm run package`.\n'
    )
    console.log(`  • test build: wrote ${MARKER}`)
  } else if (existsSync(marker)) {
    rmSync(marker)
  }
}
