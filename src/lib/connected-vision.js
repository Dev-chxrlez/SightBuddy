const CONNECTED_VISION_TIMEOUT_MS = 20_000

export async function askConnectedVision({ image, question, localDetections = [], context = null }) {
  if (!navigator.onLine) throw new Error('The device is offline.')

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), CONNECTED_VISION_TIMEOUT_MS)
  try {
    const response = await fetch('/api/vision', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, question, localDetections, context }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || typeof payload.answer !== 'string' || !payload.answer.trim()) {
      throw new Error(payload.error || 'Connected vision is unavailable.')
    }
    return payload.answer.trim()
  } finally {
    window.clearTimeout(timeout)
  }
}
