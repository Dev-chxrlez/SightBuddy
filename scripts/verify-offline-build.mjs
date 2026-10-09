import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = join(root, 'dist')
const manifest = JSON.parse(await readFile(join(outputDirectory, 'offline-assets.json'), 'utf8'))
const worker = await readFile(join(outputDirectory, 'sw.js'), 'utf8')
new Script(worker, { filename: 'sw.js' })

if (!manifest.assets?.length) throw new Error('Offline asset list is empty.')
if (!worker.includes(manifest.cacheName)) throw new Error('Service worker cache version does not match its asset manifest.')

for (const url of manifest.assets) {
  const details = await stat(join(outputDirectory, url.slice(1)))
  if (!details.isFile() || details.size === 0) throw new Error(`Missing offline asset: ${url}`)
  if (!worker.includes(JSON.stringify(url))) throw new Error(`Service worker does not include: ${url}`)
}

const required = [
  '/index.html',
  '/manifest.webmanifest',
]
for (const url of required) {
  if (!manifest.assets.includes(url)) throw new Error(`Required offline asset is absent: ${url}`)
}
if (manifest.assets.some((url) => /\/assets\/voice-experiment-.*\.js$/.test(url))) {
  throw new Error('The optional voice bundle must not delay the core offline cache.')
}
if (!manifest.optionalVoiceAssets?.includes('/models/voice/vosk-model-small-en-us-0.15.tar.gz')) {
  throw new Error('The Vosk model is absent from the optional voice cache.')
}
if (!manifest.optionalVoiceAssets?.some((url) => /\/assets\/voice-experiment-.*\.js$/.test(url))) {
  throw new Error('The Vosk voice experiment bundle is absent from the optional voice cache.')
}
if (manifest.assets.some((url) => /\/assets\/coco-detector-.*\.js$/.test(url))) {
  throw new Error('The optional COCO detector bundle must not delay the core offline cache.')
}
if (!manifest.optionalDetectorAssets?.some((url) => /\/assets\/coco-detector-.*\.js$/.test(url))) {
  throw new Error('The COCO detector bundle is absent from the optional detector cache.')
}
if (!manifest.optionalDetectorAssets?.includes('/models/coco-ssd-mobilenet-v2/model.json')) {
  throw new Error('The COCO detector manifest is absent from the optional detector cache.')
}
if (manifest.optionalDetectorAssets.filter((url) => /\/models\/coco-ssd-mobilenet-v2\/group1-shard\d+of17$/.test(url)).length !== 17) {
  throw new Error('The optional detector cache does not contain all 17 COCO weight shards.')
}
if (!manifest.assets.some((url) => /\/assets\/.*\.css$/.test(url))) {
  throw new Error('The application stylesheet is absent from the offline cache.')
}
if (manifest.assets.some((url) => url.endsWith('.wasm') || url.includes('/models/yolov5n'))) {
  throw new Error('Experimental ONNX assets must not be part of the MobileNet offline cache.')
}

console.log(JSON.stringify({
  version: manifest.version,
  cacheName: manifest.cacheName,
  essentialAssets: manifest.assets.length,
  optionalVoiceAssets: manifest.optionalVoiceAssets.length,
  optionalDetectorAssets: manifest.optionalDetectorAssets.length,
}, null, 2))
