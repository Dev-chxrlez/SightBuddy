import { open, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = join(root, 'public', 'models', 'voice', 'vosk-model-small-en-us-0.15.tar.gz')
const details = await stat(modelPath)
if (!details.isFile() || details.size < 1000000) throw new Error('The local Vosk model is missing or incomplete.')

const handle = await open(modelPath, 'r')
const header = Buffer.alloc(2)
await handle.read(header, 0, header.length, 0)
await handle.close()
if (header[0] !== 0x1f || header[1] !== 0x8b) throw new Error('The local Vosk model is not a gzip archive.')

console.log(JSON.stringify({
  path: 'public/models/voice/vosk-model-small-en-us-0.15.tar.gz',
  bytes: details.size,
  format: 'gzip tar archive',
}, null, 2))
