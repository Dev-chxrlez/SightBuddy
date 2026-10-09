process.loadEnvFile('.env.local')

const apiKey = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_VISION_MODEL || 'gpt-6-luna'
if (!apiKey) throw new Error('OPENAI_API_KEY is not configured in .env.local.')

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    store: false,
    max_output_tokens: 40,
    ...(/^gpt-[56]/.test(model) ? { reasoning: { effort: 'none' } } : {}),
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: 'Briefly confirm that you received an image.' },
        { type: 'input_image', image_url: image, detail: 'low' },
      ],
    }],
  }),
})

const payload = await response.json().catch(() => ({}))
const hasOutput = Array.isArray(payload.output) && payload.output.some((item) => (
  Array.isArray(item.content) && item.content.some((part) => part.type === 'output_text' && part.text)
))

console.log(JSON.stringify({
  status: response.status,
  ok: response.ok,
  hasOutput,
  errorType: payload.error?.type || null,
  errorCode: payload.error?.code || null,
}, null, 2))

if (!response.ok || !hasOutput) process.exitCode = 1
