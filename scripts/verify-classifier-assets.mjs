import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelDirectory = join(root, 'public', 'models', 'mobilenet-v2-050')
const manifest = JSON.parse(await readFile(join(modelDirectory, 'model.json'), 'utf8'))

if (manifest.format !== 'graph-model') throw new Error(`Unexpected model format: ${manifest.format}`)
const paths = manifest.weightsManifest.flatMap((group) => group.paths)
if (paths.length === 0) throw new Error('MobileNet manifest has no weight shards.')

let totalBytes = 0
for (const path of paths) {
  const details = await stat(join(modelDirectory, path))
  if (!details.isFile() || details.size === 0) throw new Error(`Invalid weight shard: ${path}`)
  totalBytes += details.size
}

console.log(JSON.stringify({
  format: manifest.format,
  generatedBy: manifest.generatedBy,
  shards: paths,
  weightBytes: totalBytes,
}, null, 2))
