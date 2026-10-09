import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = join(root, 'dist')
const requiredStaticAssets = [
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
]
const optionalVoiceAssets = ['models/voice/vosk-model-small-en-us-0.15.tar.gz']

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(path))
    else files.push(path)
  }
  return files
}

const builtFiles = await listFiles(outputDirectory)
const builtApplicationAssets = builtFiles
  .filter((path) => {
    const extension = extname(path)
    return path.includes(`${sep}assets${sep}`) && (extension === '.js' || extension === '.css')
  })
  .map((path) => relative(outputDirectory, path).split(sep).join('/'))
const voiceBundleAssets = builtApplicationAssets.filter((path) => /(^|\/)voice-experiment-[^/]+\.js$/.test(path))
if (voiceBundleAssets.length !== 1) {
  throw new Error(`Expected one voice experiment bundle, found ${voiceBundleAssets.length}.`)
}
const detectorBundleAssets = builtApplicationAssets.filter((path) => /(^|\/)coco-detector-[^/]+\.js$/.test(path))
if (detectorBundleAssets.length !== 1) {
  throw new Error(`Expected one COCO detector bundle, found ${detectorBundleAssets.length}.`)
}
const applicationAssets = builtApplicationAssets.filter((path) => (
  !voiceBundleAssets.includes(path) && !detectorBundleAssets.includes(path)
))
const optionalDetectorAssets = builtFiles
  .map((path) => relative(outputDirectory, path).split(sep).join('/'))
  .filter((path) => path.startsWith('models/coco-ssd-mobilenet-v2/'))

const assetPaths = [...new Set([...requiredStaticAssets, ...applicationAssets])]
  .sort()
const fingerprints = []
for (const assetPath of assetPaths) {
  const contents = await readFile(join(outputDirectory, assetPath))
  if (contents.length === 0) throw new Error(`Offline asset is empty: ${assetPath}`)
  fingerprints.push(`${assetPath}:${createHash('sha256').update(contents).digest('hex')}`)
}

const version = createHash('sha256').update(fingerprints.join('\n')).digest('hex').slice(0, 16)
const urls = assetPaths.map((path) => `/${path}`)
const voiceAssetPaths = [...optionalVoiceAssets, ...voiceBundleAssets].sort()
const voiceFingerprints = []
for (const assetPath of voiceAssetPaths) {
  const contents = await readFile(join(outputDirectory, assetPath))
  if (contents.length === 0) throw new Error(`Optional voice asset is empty: ${assetPath}`)
  voiceFingerprints.push(`${assetPath}:${createHash('sha256').update(contents).digest('hex')}`)
}
const voiceVersion = createHash('sha256').update(voiceFingerprints.join('\n')).digest('hex').slice(0, 16)
const voiceUrls = voiceAssetPaths.map((path) => `/${path}`)
const cacheName = `sightbuddy-offline-${version}`
const voiceCacheName = `sightbuddy-voice-${voiceVersion}`
const detectorAssetPaths = [...optionalDetectorAssets, ...detectorBundleAssets].sort()
const detectorFingerprints = []
for (const assetPath of detectorAssetPaths) {
  const contents = await readFile(join(outputDirectory, assetPath))
  if (contents.length === 0) throw new Error(`Optional detector asset is empty: ${assetPath}`)
  detectorFingerprints.push(`${assetPath}:${createHash('sha256').update(contents).digest('hex')}`)
}
const detectorVersion = createHash('sha256').update(detectorFingerprints.join('\n')).digest('hex').slice(0, 16)
const detectorUrls = detectorAssetPaths.map((path) => `/${path}`)
const detectorCacheName = `sightbuddy-detector-${detectorVersion}`
const workerSource = `const CACHE_NAME = ${JSON.stringify(cacheName)}
const VOICE_CACHE_NAME = ${JSON.stringify(voiceCacheName)}
const DETECTOR_CACHE_NAME = ${JSON.stringify(detectorCacheName)}
const APP_SHELL = '/index.html'
const ESSENTIAL_ASSETS = ${JSON.stringify(urls, null, 2)}
const VOICE_ASSETS = ${JSON.stringify(voiceUrls, null, 2)}
const DETECTOR_ASSETS = ${JSON.stringify(detectorUrls, null, 2)}
const ESSENTIAL_PATHS = new Set(ESSENTIAL_ASSETS)
const VOICE_PATHS = new Set(VOICE_ASSETS)
const DETECTOR_PATHS = new Set(DETECTOR_ASSETS)

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    for (const asset of ESSENTIAL_ASSETS) {
      const response = await fetch(asset)
      if (!response.ok) throw new Error(\`Failed to cache \${asset}: HTTP \${response.status}\`)
      await cache.put(asset, response)
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter((name) => (
        (name.startsWith('sightbuddy-offline-') && name !== CACHE_NAME) ||
        (name.startsWith('sightbuddy-voice-') && name !== VOICE_CACHE_NAME) ||
        (name.startsWith('sightbuddy-detector-') && name !== DETECTOR_CACHE_NAME) ||
        name.startsWith('sightbuddy-vision-')
      ))
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(APP_SHELL, response.clone())
        }
        return response
      } catch {
        const cached = await caches.match(APP_SHELL)
        if (cached) return cached
        throw new Error('SightBuddy is not cached for offline use yet.')
      }
    })())
    return
  }

  if (ESSENTIAL_PATHS.has(url.pathname) || VOICE_PATHS.has(url.pathname) || DETECTOR_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(url.pathname)
      return cached || fetch(request)
    })())
  }
})

self.addEventListener('message', (event) => {
  if (!event.ports[0]) return
  const type = event.data?.type
  if (type === 'CACHE_VOICE_ASSETS') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(VOICE_CACHE_NAME)
        for (const asset of VOICE_ASSETS) {
          if (await cache.match(asset)) continue
          const response = await fetch(asset)
          if (!response.ok) throw new Error(\`Failed to cache \${asset}: HTTP \${response.status}\`)
          await cache.put(asset, response)
        }
        event.ports[0].postMessage({ type: 'VOICE_CACHE_STATUS', ready: true, cached: VOICE_ASSETS.length, total: VOICE_ASSETS.length })
      } catch (error) {
        event.ports[0].postMessage({ type: 'VOICE_CACHE_STATUS', ready: false, error: error.message })
      }
    })())
    return
  }
  if (type === 'CACHE_DETECTOR_ASSETS') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(DETECTOR_CACHE_NAME)
        for (const asset of DETECTOR_ASSETS) {
          if (await cache.match(asset)) continue
          const response = await fetch(asset)
          if (!response.ok) throw new Error(\`Failed to cache \${asset}: HTTP \${response.status}\`)
          await cache.put(asset, response)
        }
        event.ports[0].postMessage({ type: 'DETECTOR_CACHE_STATUS', ready: true, cached: DETECTOR_ASSETS.length, total: DETECTOR_ASSETS.length })
      } catch (error) {
        event.ports[0].postMessage({ type: 'DETECTOR_CACHE_STATUS', ready: false, error: error.message })
      }
    })())
    return
  }
  if (type !== 'VERIFY_CACHE') return
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const missing = []
    for (const asset of ESSENTIAL_ASSETS) {
      if (!await cache.match(asset)) missing.push(asset)
    }
    event.ports[0].postMessage({
      type: 'CACHE_STATUS',
      ready: missing.length === 0,
      version: ${JSON.stringify(version)},
      cached: ESSENTIAL_ASSETS.length - missing.length,
      total: ESSENTIAL_ASSETS.length,
      missing,
    })
  })())
})
`

await writeFile(join(outputDirectory, 'sw.js'), workerSource)
await writeFile(join(outputDirectory, 'offline-assets.json'), JSON.stringify({
  version,
  cacheName,
  assets: urls,
  voiceCacheName,
  optionalVoiceAssets: voiceUrls,
  detectorCacheName,
  optionalDetectorAssets: detectorUrls,
}, null, 2))
console.log(`Generated offline cache ${cacheName} with ${urls.length} essential, ${voiceUrls.length} voice, and ${detectorUrls.length} detector assets.`)
