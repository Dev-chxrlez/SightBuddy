import * as ort from 'onnxruntime-web/wasm'
import { COCO_CLASSES } from './coco.js'
import { horizontalPosition, nonMaxSuppression } from './geometry.js'
import { RUNTIME_SMOKE_MODEL } from './runtimeSmokeModel.js'

export const MODEL_SIZE = 640
export const MODEL_PATH = '/models/yolov5n.onnx'
export const WASM_PATH = '/ort/ort-wasm-simd-threaded.wasm'
const SCORE_THRESHOLD = 0.35
const MAX_CANDIDATES = 300
const DIAGNOSTIC_STORAGE_KEY = 'sightbuddy:last-model-stage'
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

let sessionPromise
let workCanvas
let workContext
const diagnosticListeners = new Set()

function readPreviousStage() {
  try {
    const value = JSON.parse(window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY))
    return value?.runId !== runId ? value : null
  } catch {
    return null
  }
}

const previousStage = readPreviousStage()
let diagnosticEntries = previousStage ? [{
  time: previousStage.time,
  stage: 'previous-run',
  status: 'info',
  message: `Previous page ended after: ${previousStage.stage} (${previousStage.status})`,
  detail: previousStage,
}] : []

function absoluteUrl(path) {
  return new URL(path, window.location.href).href
}

function errorDetails(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || 'No stack available',
  }
}

function reportDiagnostic(stage, status, message, detail = {}) {
  const entry = {
    time: new Date().toISOString(),
    stage,
    status,
    message,
    detail,
  }
  diagnosticEntries = [...diagnosticEntries, entry]
  try {
    window.localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify({
      runId,
      time: entry.time,
      stage,
      status,
      message: String(message).slice(0, 500),
    }))
  } catch {
    // Diagnostics must never block model initialization when storage is denied.
  }
  diagnosticListeners.forEach((listener) => listener([...diagnosticEntries]))
}

export function subscribeToDetectorDiagnostics(listener) {
  diagnosticListeners.add(listener)
  listener([...diagnosticEntries])
  return () => diagnosticListeners.delete(listener)
}

export function resetDetectorForRetry() {
  sessionPromise = undefined
  diagnosticEntries = []
  reportDiagnostic('manual-retry', 'info', 'User requested one clean model initialization retry')
}

async function preflightAsset(path, kind) {
  const url = absoluteUrl(path)
  reportDiagnostic(`${kind}-preflight`, 'pending', `Checking ${kind} headers`, { url })

  let response
  try {
    response = await fetch(url, {
      method: 'HEAD',
      cache: import.meta.env.DEV ? 'no-store' : 'default',
    })
  } catch (error) {
    reportDiagnostic(`${kind}-preflight`, 'error', 'Header request failed', {
      url,
      ...errorDetails(error),
    })
    throw new Error(`${kind} preflight failed: ${error?.message || error}`)
  }

  const contentType = response.headers.get('content-type') || '(missing)'
  const contentLength = response.headers.get('content-length') || '(missing)'
  reportDiagnostic(`${kind}-preflight`, response.ok ? 'success' : 'error',
    `HTTP ${response.status} ${response.statusText || ''}`.trim(), {
      url: response.url || url,
      contentType,
      contentLength,
    })

  if (!response.ok) throw new Error(`${kind} returned HTTP ${response.status} at ${url}`)
  if (contentType.toLowerCase().includes('text/html')) {
    throw new Error(`${kind} URL returned HTML instead of the required asset: ${url}`)
  }
  return { url, contentType, contentLength }
}

export function loadDetector() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      reportDiagnostic('initialization-start', 'pending', 'Starting the single model initialization attempt', {
        runId,
        navigationType: performance.getEntriesByType('navigation')[0]?.type || 'unknown',
      })
      reportDiagnostic('browser', 'info', 'Browser environment captured', {
        userAgent: navigator.userAgent,
        secureContext: window.isSecureContext,
        crossOriginIsolated: window.crossOriginIsolated,
        wasmAvailable: typeof WebAssembly !== 'undefined',
        wasmSimdDetection: 'Delegated to ONNX Runtime Web',
        hardwareConcurrency: navigator.hardwareConcurrency || '(unavailable)',
        pageUrl: window.location.href,
      })

      if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly is not available in this browser.')

      ort.env.wasm.numThreads = 1
      ort.env.wasm.proxy = false
      // `true` asks ONNX Runtime to perform its own fixed-width SIMD feature
      // detection. Any real compilation/feature error is captured below.
      ort.env.wasm.simd = true
      ort.env.wasm.initTimeout = 60_000
      // The package's bundled loader contains the matching Emscripten factory.
      // Only override the binary URL; no external .mjs import is required.
      ort.env.wasm.wasmPaths = { wasm: absoluteUrl(WASM_PATH) }
      reportDiagnostic('wasm-config', 'success', 'WASM configured for single-threaded execution; SIMD detection delegated to ONNX Runtime', {
        executionProvider: 'wasm',
        numThreads: ort.env.wasm.numThreads,
        proxy: ort.env.wasm.proxy,
        simd: ort.env.wasm.simd,
        moduleLoader: 'onnxruntime-web/wasm bundled Emscripten factory',
        binaryUrl: absoluteUrl(WASM_PATH),
      })

      await preflightAsset(WASM_PATH, 'WASM binary')
      const modelAsset = await preflightAsset(MODEL_PATH, 'ONNX model')
      reportDiagnostic('runtime-smoke-test', 'pending', 'Initializing WASM with a minimal Identity model', {
        smokeModelBytes: RUNTIME_SMOKE_MODEL.byteLength,
      })
      const runtimeStartedAt = performance.now()
      const smokeSession = await ort.InferenceSession.create(RUNTIME_SMOKE_MODEL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'disabled',
      })
      await smokeSession.release()
      reportDiagnostic('runtime-smoke-test', 'success', 'WASM backend initialized with the minimal model', {
        durationMs: Math.round(performance.now() - runtimeStartedAt),
      })

      reportDiagnostic('session-create', 'pending', 'Creating ONNX inference session', {
        modelUrl: modelAsset.url,
        declaredModelBytes: modelAsset.contentLength,
        memoryStrategy: 'Direct URL loading; no duplicate JavaScript asset buffers',
      })

      const startedAt = performance.now()
      const session = await ort.InferenceSession.create(modelAsset.url, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })
      reportDiagnostic('session-create', 'success', 'ONNX inference session created', {
        durationMs: Math.round(performance.now() - startedAt),
        inputs: session.inputNames,
        outputs: session.outputNames,
      })
      return session
    })().catch((error) => {
      reportDiagnostic('initialization', 'error', 'Detector initialization failed', errorDetails(error))
      throw error
    })
  }
  return sessionPromise
}

function prepareInput(video) {
  if (!workCanvas) {
    workCanvas = document.createElement('canvas')
    workCanvas.width = MODEL_SIZE
    workCanvas.height = MODEL_SIZE
    workContext = workCanvas.getContext('2d', { willReadFrequently: true })
  }

  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const scale = Math.min(MODEL_SIZE / sourceWidth, MODEL_SIZE / sourceHeight)
  const drawnWidth = Math.round(sourceWidth * scale)
  const drawnHeight = Math.round(sourceHeight * scale)
  const padX = Math.floor((MODEL_SIZE - drawnWidth) / 2)
  const padY = Math.floor((MODEL_SIZE - drawnHeight) / 2)

  workContext.fillStyle = '#727272'
  workContext.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
  workContext.drawImage(video, padX, padY, drawnWidth, drawnHeight)
  const pixels = workContext.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const plane = MODEL_SIZE * MODEL_SIZE
  const input = new Float32Array(plane * 3)

  for (let pixel = 0; pixel < plane; pixel += 1) {
    const rgbaIndex = pixel * 4
    input[pixel] = pixels[rgbaIndex] / 255
    input[plane + pixel] = pixels[rgbaIndex + 1] / 255
    input[plane * 2 + pixel] = pixels[rgbaIndex + 2] / 255
  }

  return {
    tensor: new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    sourceWidth,
    sourceHeight,
    scale,
    padX,
    padY,
  }
}

function decodeOutput(output, image) {
  const { data, dims } = output
  const rowSize = dims[dims.length - 1]
  if (rowSize !== 85) {
    throw new Error(`Unexpected model output shape [${dims.join(', ')}]; expected [..., 85].`)
  }

  const candidates = []
  const rows = data.length / rowSize
  for (let row = 0; row < rows; row += 1) {
    const offset = row * rowSize
    const objectness = data[offset + 4]
    if (objectness < SCORE_THRESHOLD) continue

    let classId = 0
    let classProbability = data[offset + 5]
    for (let classIndex = 1; classIndex < COCO_CLASSES.length; classIndex += 1) {
      const probability = data[offset + 5 + classIndex]
      if (probability > classProbability) {
        classProbability = probability
        classId = classIndex
      }
    }

    const score = objectness * classProbability
    if (score < SCORE_THRESHOLD) continue

    const centerX = data[offset]
    const centerY = data[offset + 1]
    const width = data[offset + 2]
    const height = data[offset + 3]
    const x1 = Math.max(0, (centerX - width / 2 - image.padX) / image.scale)
    const y1 = Math.max(0, (centerY - height / 2 - image.padY) / image.scale)
    const x2 = Math.min(image.sourceWidth, (centerX + width / 2 - image.padX) / image.scale)
    const y2 = Math.min(image.sourceHeight, (centerY + height / 2 - image.padY) / image.scale)
    if (x2 <= x1 || y2 <= y1) continue

    candidates.push({ x1, y1, x2, y2, score, classId, label: COCO_CLASSES[classId] })
  }

  candidates.sort((a, b) => b.score - a.score)
  return nonMaxSuppression(candidates.slice(0, MAX_CANDIDATES)).map((detection) => ({
    ...detection,
    position: horizontalPosition(detection, image.sourceWidth),
  }))
}

export async function detectObjects(video) {
  if (!video.videoWidth || !video.videoHeight) throw new Error('Camera video is not ready.')
  const session = await loadDetector()
  const image = prepareInput(video)
  const startedAt = performance.now()
  const results = await session.run({ [session.inputNames[0]]: image.tensor })
  const inferenceMs = performance.now() - startedAt
  const detections = decodeOutput(results[session.outputNames[0]], image)
  return { detections, inferenceMs, width: image.sourceWidth, height: image.sourceHeight }
}
