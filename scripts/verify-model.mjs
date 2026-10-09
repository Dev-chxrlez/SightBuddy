import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as ort from 'onnxruntime-web'
import { RUNTIME_SMOKE_MODEL } from '../src/lib/runtimeSmokeModel.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
ort.env.wasm.wasmPaths = `${pathToFileURL(join(root, 'node_modules', 'onnxruntime-web', 'dist')).href}/`
ort.env.wasm.numThreads = 1

const bytes = await readFile(join(root, 'public', 'models', 'yolov5n.onnx'))
const smokeSession = await ort.InferenceSession.create(RUNTIME_SMOKE_MODEL, { executionProviders: ['wasm'] })
const smokeResult = await smokeSession.run({
  input: new ort.Tensor('float32', new Float32Array([42]), [1]),
})
if (smokeResult.output.data[0] !== 42) throw new Error('Runtime smoke model returned an unexpected value.')
await smokeSession.release()
console.log(`Runtime smoke model passed (${RUNTIME_SMOKE_MODEL.byteLength} bytes).`)

const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
const inputName = session.inputNames[0]
const outputName = session.outputNames[0]
const input = Array.isArray(session.inputMetadata)
  ? session.inputMetadata[0]
  : session.inputMetadata[inputName]
const output = Array.isArray(session.outputMetadata)
  ? session.outputMetadata[0]
  : session.outputMetadata[outputName]
const inputDimensions = input.shape ?? input.dimensions

if (input.type !== 'float32') throw new Error(`Expected float32 input, received ${input.type}.`)
const elementCount = inputDimensions.reduce((total, dimension) => total * dimension, 1)
const result = await session.run({
  [inputName]: new ort.Tensor('float32', new Float32Array(elementCount), inputDimensions),
})
const actualOutput = result[outputName]

console.log(JSON.stringify({
  input: { name: inputName, type: input.type, dimensions: inputDimensions },
  declaredOutput: { name: outputName, type: output.type, dimensions: output.shape ?? output.dimensions },
  actualOutput: { type: actualOutput.type, dimensions: actualOutput.dims, values: actualOutput.size },
}, null, 2))
