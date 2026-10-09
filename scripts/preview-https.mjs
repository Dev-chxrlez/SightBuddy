import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(join(root, '.env.local'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const privateAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal && (
    entry.address.startsWith('10.')
    || entry.address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)
  ))?.address
const address = process.env.SIGHTBUDDY_HOST || privateAddress
if (!address) {
  throw new Error('No private LAN IPv4 address was found. Set SIGHTBUDDY_HOST to the address used by the iPhone.')
}
const certificateDirectory = join(root, '.cert')
const requiredFiles = [
  join(certificateDirectory, `${address}.pem`),
  join(certificateDirectory, `${address}-key.pem`),
]

for (const path of requiredFiles) {
  const details = await stat(path).catch(() => null)
  if (!details?.isFile() || details.size === 0) {
    throw new Error(`Missing HTTPS certificate file: ${path}\nGenerate it with mkcert before starting the preview.`)
  }
}

const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const child = spawn(process.execPath, [vite, 'preview'], {
  cwd: root,
  env: { ...process.env, SIGHTBUDDY_HTTPS: '1', SIGHTBUDDY_HOST: address },
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
