import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelDirectory = join(root, 'public', 'models', 'coco-ssd-mobilenet-v2')
const manifestPath = join(modelDirectory, 'model.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const shardPaths = manifest.weightsManifest?.flatMap((group) => group.paths) || []
if (shardPaths.length !== 17) throw new Error(`Expected 17 COCO-SSD shards, found ${shardPaths.length}.`)

let bytes = (await stat(manifestPath)).size
let weightBytes = 0
for (const path of shardPaths) {
  const details = await stat(join(modelDirectory, path))
  if (!details.isFile() || details.size === 0) throw new Error(`Missing or empty COCO-SSD shard: ${path}`)
  bytes += details.size
  weightBytes += details.size
}
if (weightBytes !== 67334496) throw new Error(`Unexpected COCO-SSD weight size: ${weightBytes} bytes.`)

console.log(JSON.stringify({
  model: 'COCO-SSD MobileNetV2',
  files: shardPaths.length + 1,
  bytes,
  mebibytes: Number((bytes / 1048576).toFixed(2)),
}, null, 2))
