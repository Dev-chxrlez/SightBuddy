import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import * as mobilenet from '@tensorflow-models/mobilenet'

export const CLASSIFIER_MODEL_PATH = '/models/mobilenet-v2-050/model.json'

let classifierPromise
let classifierModel

export function loadClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const backendSelected = await tf.setBackend('webgl')
      await tf.ready()
      if (!backendSelected || tf.getBackend() !== 'webgl') {
        throw new Error('TensorFlow.js could not initialize its WebGL backend.')
      }
      classifierModel = await mobilenet.load({
        version: 2,
        alpha: 0.5,
        modelUrl: CLASSIFIER_MODEL_PATH,
        inputRange: [0, 1],
      })
      return {
        name: 'MobileNetV2 0.5',
        backend: tf.getBackend(),
      }
    })()
  }
  return classifierPromise
}

export async function classifyFrame(video) {
  if (!video?.videoWidth || !video?.videoHeight) throw new Error('Camera video is not ready.')
  await loadClassifier()
  const startedAt = performance.now()
  const predictions = await classifierModel.classify(video, 3)
  return {
    predictions: predictions.map((prediction) => ({
      label: prediction.className,
      score: prediction.probability,
    })),
    inferenceMs: performance.now() - startedAt,
    width: video.videoWidth,
    height: video.videoHeight,
  }
}

export function resetClassifierForRetry() {
  classifierPromise = undefined
}
