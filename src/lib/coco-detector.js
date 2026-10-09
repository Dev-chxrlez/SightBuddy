import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import * as cocoSsd from '@tensorflow-models/coco-ssd'

export const COCO_MODEL_PATH = '/models/coco-ssd-mobilenet-v2/model.json'

const configuredThreshold = Number(import.meta.env.VITE_COCO_CONFIDENCE_THRESHOLD)
export const COCO_CONFIDENCE_THRESHOLD = configuredThreshold > 0 && configuredThreshold < 1
  ? configuredThreshold
  : 0.55

let detectorPromise
let detectorModel

function classColorIndex(label) {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) hash = ((hash << 5) - hash + label.charCodeAt(index)) | 0
  return Math.abs(hash)
}

export function loadCocoDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const startedAt = performance.now()
      const backendSelected = await tf.setBackend('webgl')
      await tf.ready()
      if (!backendSelected || tf.getBackend() !== 'webgl') {
        throw new Error('TensorFlow.js could not initialize its WebGL backend.')
      }
      detectorModel = await cocoSsd.load({
        base: 'mobilenet_v2',
        modelUrl: COCO_MODEL_PATH,
      })
      return {
        name: 'COCO-SSD MobileNetV2',
        backend: tf.getBackend(),
        loadMs: performance.now() - startedAt,
      }
    })().catch((error) => {
      detectorPromise = undefined
      detectorModel = undefined
      throw error
    })
  }
  return detectorPromise
}

export async function detectCocoObjects(video) {
  if (!video?.videoWidth || !video?.videoHeight) throw new Error('Camera video is not ready.')
  await loadCocoDetector()
  const startedAt = performance.now()
  const predictions = await detectorModel.detect(video, 20, COCO_CONFIDENCE_THRESHOLD)
  return {
    detections: predictions.map((prediction) => {
      const [x, y, width, height] = prediction.bbox
      return {
        classId: classColorIndex(prediction.class),
        label: prediction.class,
        score: prediction.score,
        x1: x,
        y1: y,
        x2: x + width,
        y2: y + height,
      }
    }),
    inferenceMs: performance.now() - startedAt,
    width: video.videoWidth,
    height: video.videoHeight,
  }
}

export function resetCocoDetectorForRetry() {
  detectorPromise = undefined
  detectorModel = undefined
}
