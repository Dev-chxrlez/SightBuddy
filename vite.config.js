import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(fileURLToPath(import.meta.url))
const localAddress = process.env.SIGHTBUDDY_HOST || '0.0.0.0'

function localPreviewHttps() {
  if (process.env.SIGHTBUDDY_HTTPS !== '1') return undefined
  return {
    cert: readFileSync(join(projectDirectory, '.cert', `${localAddress}.pem`)),
    key: readFileSync(join(projectDirectory, '.cert', `${localAddress}-key.pem`)),
  }
}

function binaryAssetMimeTypes() {
  const middleware = (request, response, next) => {
    const pathname = request.url?.split('?', 1)[0]
    if (pathname?.endsWith('.onnx')) response.setHeader('Content-Type', 'application/octet-stream')
    if (pathname?.endsWith('.tar.gz')) response.setHeader('Content-Type', 'application/gzip')
    if (/\/models\/coco-ssd-mobilenet-v2\/group1-shard\d+of17$/.test(pathname || '')) {
      response.setHeader('Content-Type', 'application/octet-stream')
    }
    next()
  }

  return {
    name: 'sightbuddy-binary-asset-mime',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

function readJsonBody(request, maximumBytes = 3_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maximumBytes) {
        reject(new Error('Request is too large.'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Request body must be valid JSON.'))
      }
    })
    request.on('error', reject)
  })
}

function responseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text.trim()
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(' ')
}

function connectedVisionApi(environment) {
  const apiKey = environment.OPENAI_API_KEY
  const model = environment.OPENAI_VISION_MODEL || 'gpt-6-luna'

  const middleware = async (request, response, next) => {
    const pathname = request.url?.split('?', 1)[0]
    if (pathname !== '/api/vision') return next()

    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method !== 'POST') {
      response.statusCode = 405
      response.end(JSON.stringify({ error: 'Method not allowed.' }))
      return
    }
    if (!apiKey) {
      response.statusCode = 503
      response.end(JSON.stringify({ error: 'Connected vision is not configured.' }))
      return
    }

    try {
      const body = await readJsonBody(request)
      const image = typeof body.image === 'string' ? body.image : ''
      const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
      const detections = Array.isArray(body.localDetections)
        ? body.localDetections.slice(0, 10).map((item) => String(item).slice(0, 80))
        : []
      const previousQuestion = typeof body.context?.question === 'string' ? body.context.question.slice(0, 500) : ''
      const previousAnswer = typeof body.context?.answer === 'string' ? body.context.answer.slice(0, 1200) : ''
      const conversationContext = previousQuestion && previousAnswer
        ? `\nPrevious visual exchange for follow-up context:\nQuestion: ${previousQuestion}\nAnswer: ${previousAnswer}`
        : ''
      if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(image) || !question) {
        response.statusCode = 400
        response.end(JSON.stringify({ error: 'A camera image and question are required.' }))
        return
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 18_000)
      let upstream
      try {
        upstream = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            store: false,
            ...(/^gpt-[56]/.test(model) ? { reasoning: { effort: 'low' } } : {}),
            max_output_tokens: 260,
            instructions: 'You are SightBuddy, a visual companion for a blind user. Directly answer the current question using only clearly visible evidence in the current camera frame. Never merely acknowledge receiving visual input, and never give a generic answer such as "I see an image", "this is a photo", or "the camera shows a scene". Use concrete details that help without sight: object names, counts, colors, readable text, and positions or relationships such as left, right, center, above, below, beside, or on top of. Mention a detail only when visually clear. For a broad description, give the most useful details in two or three short natural sentences. For a follow-up, answer the requested detail consistently with the previous exchange but prioritize the current frame. If uncertain, say exactly what is unclear and suggest slowly moving the camera. Never invent precision, identities, text, objects, relationships, distances, hazards, or navigation safety. Never declare that walking is safe.',
            input: [{
              role: 'user',
              content: [
                { type: 'input_text', text: `Current question: ${question}${conversationContext}\nLocal detector hints (may be wrong): ${detections.join(', ') || 'none'}` },
                { type: 'input_image', image_url: image, detail: 'high' },
              ],
            }],
          }),
        })
      } finally {
        clearTimeout(timeout)
      }

      const payload = await upstream.json().catch(() => ({}))
      const answer = responseText(payload)
      if (!upstream.ok || !answer) {
        console.error(`Connected vision request failed (${upstream.status}).`)
        response.statusCode = 502
        response.end(JSON.stringify({ error: 'Connected vision is temporarily unavailable.' }))
        return
      }
      response.statusCode = 200
      response.end(JSON.stringify({ answer, model }))
    } catch (error) {
      console.error(`Connected vision proxy error: ${error.name || 'Error'}.`)
      response.statusCode = error.message === 'Request is too large.' ? 413 : 502
      response.end(JSON.stringify({ error: 'Connected vision is temporarily unavailable.' }))
    }
  }

  return {
    name: 'sightbuddy-connected-vision',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, projectDirectory, '')
  return {
  plugins: [react(), binaryAssetMimeTypes(), connectedVisionApi(environment)],
  optimizeDeps: {
    // Keep ORT out of Vite's dev prebundle. Its bundled WASM entry must retain
    // its own import.meta.url handling, especially on Safari.
    exclude: ['onnxruntime-web', 'onnxruntime-web/wasm'],
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      '.trycloudflare.com',
    ],
  },
  preview: {
    host: localAddress,
    port: 4173,
    strictPort: true,
    https: localPreviewHttps(),
    allowedHosts: [
      localAddress,
      '.trycloudflare.com',
    ],
  },
  }
})
