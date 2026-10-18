// Renders build/icon.svg (and build/icon-small.svg for tiny sizes) into build/icon.png, icon.icns and icon.ico.
// Run with `node scripts/make-icons.mjs`. Needs macOS for the .icns step (iconutil).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const big = readFileSync('build/icon.svg', 'utf8')
const small = readFileSync('build/icon-small.svg', 'utf8')

// Electron is already a dev dependency, so it draws the SVGs: one hidden transparent window, captured per size.
const entry = join(tmpdir(), 'ledger-lift-icons-main.cjs')
writeFileSync(entry, "require('electron').app.on('window-all-closed', () => {})")
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env
const app = await electron.launch({ args: ['--force-color-profile=srgb', entry], env })

async function png(svg, size) {
  const sized = svg.replace('width="128" height="128"', `width="${size}" height="${size}"`)
  const base64 = await app.evaluate(async ({ BrowserWindow }, { html, size }) => {
    const win = new BrowserWindow({ show: false, transparent: true, frame: false, width: size, height: size, useContentSize: true, webPreferences: { offscreen: false } })
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
    await new Promise((resolve) => setTimeout(resolve, 150))
    const image = await win.webContents.capturePage()
    win.destroy()
    return image.resize({ width: size, height: size }).toPNG().toString('base64')
  }, { html: `<body style="margin:0;background:transparent">${sized}</body>`, size })
  return Buffer.from(base64, 'base64')
}

writeFileSync('build/icon.png', await png(big, 1024))

const iconset = 'build/icon.iconset'
mkdirSync(iconset, { recursive: true })
for (const [name, size] of [['16x16', 16], ['16x16@2x', 32], ['32x32', 32], ['32x32@2x', 64], ['128x128', 128], ['128x128@2x', 256], ['256x256', 256], ['256x256@2x', 512], ['512x512', 512], ['512x512@2x', 1024]]) {
  writeFileSync(`${iconset}/icon_${name}.png`, await png(size <= 32 ? small : big, size))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', 'build/icon.icns'])
rmSync(iconset, { recursive: true })

// Windows .ico: a directory of PNG images.
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = []
for (const size of sizes) images.push(await png(size <= 32 ? small : big, size))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i
  header.writeUInt8(size === 256 ? 0 : size, entry)
  header.writeUInt8(size === 256 ? 0 : size, entry + 1)
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(images[i].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += images[i].length
})
writeFileSync('build/icon.ico', Buffer.concat([header, ...images]))

await app.close()
