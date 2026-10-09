let registrationPromise
let detectorCachePromise

function waitForActivation(registration) {
  const pendingWorker = registration.installing || registration.waiting
  if (!pendingWorker || pendingWorker.state === 'activated') return Promise.resolve(registration)

  return new Promise((resolve, reject) => {
    pendingWorker.addEventListener('statechange', () => {
      if (pendingWorker.state === 'activated') resolve(registration)
      if (pendingWorker.state === 'redundant') reject(new Error('The offline worker could not be activated.'))
    })
  })
}

function requestWorkerMessage(registration, type, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const worker = registration.active || navigator.serviceWorker.controller
    if (!worker) {
      reject(new Error('The offline worker is not active yet.'))
      return
    }

    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => {
      channel.port1.close()
      reject(new Error('Offline cache verification timed out.'))
    }, timeoutMs)

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout)
      channel.port1.close()
      resolve(event.data)
    }
    worker.postMessage({ type }, [channel.port2])
  })
}

function requestCacheStatus(registration) {
  return requestWorkerMessage(registration, 'VERIFY_CACHE')
}

export async function prepareOfflineCache() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.')
  }
  if (!window.isSecureContext) {
    throw new Error('Offline installation requires HTTPS.')
  }
  if (import.meta.env.DEV) {
    throw new Error('Offline caching is available in the production build.')
  }

  if (!registrationPromise) {
    const attempt = navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(waitForActivation)
      .then(() => navigator.serviceWorker.ready)
    registrationPromise = attempt
    attempt.catch(() => {
      if (registrationPromise === attempt) registrationPromise = undefined
    })
  }

  const registration = await registrationPromise
  return requestCacheStatus(registration)
}

export async function verifyOfflineCache() {
  if (!registrationPromise) return prepareOfflineCache()
  const registration = await registrationPromise
  return requestCacheStatus(registration)
}

export async function prepareVoiceCache() {
  const registration = registrationPromise
    ? await registrationPromise
    : await prepareOfflineCache().then(() => registrationPromise)
  const status = await requestWorkerMessage(registration, 'CACHE_VOICE_ASSETS', 120000)
  if (!status?.ready) throw new Error(status?.error || 'Voice assets could not be cached.')
  return status
}

export async function prepareDetectorCache() {
  if (!detectorCachePromise) {
    const attempt = (async () => {
      const registration = registrationPromise
        ? await registrationPromise
        : await prepareOfflineCache().then(() => registrationPromise)
      const status = await requestWorkerMessage(registration, 'CACHE_DETECTOR_ASSETS', 180000)
      if (!status?.ready) throw new Error(status?.error || 'Detector assets could not be cached.')
      return status
    })()
    detectorCachePromise = attempt
    attempt.catch(() => {
      if (detectorCachePromise === attempt) detectorCachePromise = undefined
    })
  }
  return detectorCachePromise
}

