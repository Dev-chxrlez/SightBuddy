function varint(value) {
  const bytes = []
  let remaining = value
  while (remaining > 0x7f) {
    bytes.push((remaining & 0x7f) | 0x80)
    remaining >>>= 7
  }
  bytes.push(remaining)
  return bytes
}

function field(number, wireType, payload) {
  return [...varint((number << 3) | wireType), ...payload]
}

function messageField(number, message) {
  return field(number, 2, [...varint(message.length), ...message])
}

function stringField(number, value) {
  return messageField(number, [...new TextEncoder().encode(value)])
}

// Minimal ONNX Identity graph: float32[1] input -> float32[1] output.
// It initializes the WASM backend without allocating or parsing YOLOv5n.
function valueInfo(name) {
  const dimension = field(1, 0, varint(1))
  const shape = messageField(1, dimension)
  const tensorType = [...field(1, 0, varint(1)), ...messageField(2, shape)]
  const type = messageField(1, tensorType)
  return [...stringField(1, name), ...messageField(2, type)]
}

const node = [
  ...stringField(1, 'input'),
  ...stringField(2, 'output'),
  ...stringField(4, 'Identity'),
]
const graph = [
  ...messageField(1, node),
  ...stringField(2, 'sightbuddy-runtime-smoke'),
  ...messageField(11, valueInfo('input')),
  ...messageField(12, valueInfo('output')),
]
const opset = field(2, 0, varint(13))
const model = [
  ...field(1, 0, varint(8)),
  ...stringField(2, 'SightBuddy'),
  ...messageField(7, graph),
  ...messageField(8, opset),
]

export const RUNTIME_SMOKE_MODEL = new Uint8Array(model)
