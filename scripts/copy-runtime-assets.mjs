import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const target = join(root, 'public', 'ort')

await mkdir(target, { recursive: true })
const requiredAssets = new Set(['ort-wasm-simd-threaded.wasm'])
const assets = (await readdir(source)).filter((name) => requiredAssets.has(name))
await Promise.all(assets.map((name) => copyFile(join(source, name), join(target, name))))
console.log(`Copied ${assets.length} ONNX Runtime assets to public/ort.`)
