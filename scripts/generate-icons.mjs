import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'
import { IconIco } from '@shockpkg/icon-encoder'

const sizes = [16, 32, 48, 64, 128, 256]
const root = new URL('../', import.meta.url)
const [svg, html] = await Promise.all([
  readFile(new URL('public/icon.svg', root)),
  readFile(new URL('index.html', root), 'utf8'),
])

const declaration = html.match(/<link\b[^>]*href="\/favicon\.ico"[^>]*>/)?.[0]
assert.equal(
  declaration?.match(/\bsizes="([^"]*)"/)?.[1],
  sizes.map((size) => `${size}x${size}`).join(' '),
  'index.html 的 ICO 尺寸声明必须与生成尺寸一致',
)

const ico = new IconIco()
for (const size of sizes) {
  const image = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  }).render()
  assert.equal(image.width, size)
  assert.equal(image.height, size, 'public/icon.svg 必须使用正方形画布')
  // 每档直接渲染 SVG，并保留原始 PNG 压缩数据及透明通道。
  await ico.addFromPng(image.asPng(), true, true)
}

const output = ico.encode()
await writeFile(new URL('public/favicon.ico', root), output)
console.log(
  `已生成 public/favicon.ico：${sizes.join(' / ')}px，${(output.byteLength / 1024).toFixed(1)} KiB`,
)
