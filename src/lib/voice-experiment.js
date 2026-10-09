import { createModel } from 'vosk-browser'
import { COMMAND_GRAMMAR, identifyCommand } from './voice-commands.js'

export const VOICE_MODEL_PATH = '/models/voice/vosk-model-small-en-us-0.15.tar.gz'

let activeSession
let modelPromise
let loadedModel

function readHeapMegabytes() {
  const bytes = performance.memory?.usedJSHeapSize
  return Number.isFinite(bytes) ? Math.round(bytes / 1048576) : null
}

async function loadVoiceModel(onStatus) {
  if (!modelPromise) {
    modelPromise = (async () => {
      const startedAt = performance.now()
      onStatus?.('loading-model', 'Loading the local voice model…')
      loadedModel = await createModel(VOICE_MODEL_PATH, -1)
      return { model: loadedModel, loadMs: performance.now() - startedAt }
    })().catch((error) => {
      modelPromise = undefined
      loadedModel = undefined
      throw error
    })
  }
  return modelPromise
}

export async function startVoiceExperiment({
  onStatus,
  onVad,
  onTranscript,
  onCommand,
  onMetrics,
}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture is not supported in this browser.')
  }
  if (!window.isSecureContext) {
    throw new Error('Microphone capture requires trusted HTTPS.')
  }
  await stopVoiceExperiment()

  const startedAt = performance.now()
  const heapBeforeMb = readHeapMegabytes()
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.')

  const audioContext = new AudioContextClass()
  await audioContext.resume()
  onStatus?.('requesting-microphone', 'Waiting for microphone permission…')

  const microphoneStartedAt = performance.now()
  const microphonePromise = navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 16000 },
    },
  })
  const voiceModelPromise = loadVoiceModel(onStatus)

  let stream
  let recognizer
  let source
  let processor
  try {
    const [mediaStream, modelInfo] = await Promise.all([microphonePromise, voiceModelPromise])
    stream = mediaStream
    const microphoneMs = performance.now() - microphoneStartedAt
    const sampleRate = audioContext.sampleRate
    recognizer = new modelInfo.model.KaldiRecognizer(sampleRate, JSON.stringify(COMMAND_GRAMMAR))
    recognizer.setWords(true)

    let paused = false
    let speaking = false
    let noiseFloor = 0.006
    let lastVoiceAt = 0
    let lastSpeechEndedAt = 0

    recognizer.on('partialresult', (message) => {
      const partial = message.result?.partial?.trim() || ''
      if (partial) onTranscript?.(partial, true)
    })
    recognizer.on('result', (message) => {
      const text = message.result?.text?.trim() || ''
      if (!text) return
      const command = identifyCommand(text)
      const recognitionLatencyMs = lastSpeechEndedAt
        ? performance.now() - lastSpeechEndedAt
        : null
      onTranscript?.(text, false)
      onMetrics?.({ recognitionLatencyMs })
      if (command) onCommand?.(command, text)
    })
    recognizer.on('error', (message) => {
      onStatus?.('error', message.error || 'The local recognizer reported an error.')
    })

    processor = audioContext.createScriptProcessor(4096, 1, 1)
    source = audioContext.createMediaStreamSource(stream)
    processor.onaudioprocess = (event) => {
      if (paused) return
      const samples = event.inputBuffer.getChannelData(0)
      let energy = 0
      for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index]
      const rms = Math.sqrt(energy / samples.length)
      const now = performance.now()
      const threshold = Math.max(0.018, noiseFloor * 3)

      if (rms > threshold) {
        lastVoiceAt = now
        if (!speaking) {
          speaking = true
          onVad?.(true, rms)
        }
      } else {
        noiseFloor = noiseFloor * 0.98 + rms * 0.02
        if (speaking && now - lastVoiceAt > 550) {
          speaking = false
          lastSpeechEndedAt = now
          onVad?.(false, rms)
          recognizer.retrieveFinalResult()
        }
      }

      recognizer.acceptWaveform(event.inputBuffer)
    }
    source.connect(processor)
    processor.connect(audioContext.destination)

    activeSession = {
      audioContext,
      processor,
      recognizer,
      source,
      stream,
      startedAt,
      heapBeforeMb,
      setPaused(value) {
        paused = value
        speaking = false
        onVad?.(false, 0)
      },
    }

    const metrics = {
      startupMs: performance.now() - startedAt,
      modelLoadMs: modelInfo.loadMs,
      microphoneMs,
      sampleRate,
      heapBeforeMb,
      heapAfterMb: readHeapMegabytes(),
      batteryMeasurement: typeof navigator.getBattery === 'function'
        ? 'Available; record a timed physical-device session.'
        : 'Battery API unavailable; measure with iPhone Battery settings or Instruments.',
    }
    onMetrics?.(metrics)
    onStatus?.('listening', 'Listening for your command.')
    return metrics
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop())
    recognizer?.remove()
    source?.disconnect()
    processor?.disconnect()
    await audioContext.close().catch(() => {})
    throw error
  }
}

export function setVoiceInputPaused(paused) {
  activeSession?.setPaused(Boolean(paused))
}

export async function stopVoiceExperiment() {
  if (!activeSession) return null
  const session = activeSession
  activeSession = undefined
  session.processor.onaudioprocess = null
  session.source.disconnect()
  session.processor.disconnect()
  session.stream.getTracks().forEach((track) => track.stop())
  session.recognizer.remove()
  await session.audioContext.close().catch(() => {})
  loadedModel?.terminate()
  loadedModel = undefined
  modelPromise = undefined
  return {
    activeMs: performance.now() - session.startedAt,
    heapBeforeMb: session.heapBeforeMb,
    heapAfterMb: readHeapMegabytes(),
  }
}
