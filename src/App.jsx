import { useCallback, useEffect, useRef, useState } from 'react'
import CameraView from './components/CameraView.jsx'
import VoiceExperiment from './components/VoiceExperiment.jsx'
import { describeSceneDetections, describeWalkingView } from './lib/detection-description.js'
import { ASSISTANT_STATES, assistantStatus, isAssistantBusy } from './lib/assistant-controller.js'
import { consensusDetections } from './lib/detection-consensus.js'
import { COCO_CLASSES } from './lib/coco.js'
import { configureFriendlySpeech } from './lib/speech-style.js'

const DARK_FRAME_THRESHOLD = 18
const CONSENSUS_FRAME_COUNT = 3
const CONSENSUS_INTERVAL_MS = 180
const OBJECT_ALIASES = {
  phone: 'cell phone',
  mobile: 'cell phone',
  table: 'dining table',
  'blind stick': 'white cane',
  cane: 'white cane',
}
const GROUPED_TARGETS = {
  bag: ['backpack', 'handbag', 'suitcase'],
}

function friendlyCameraError(error) {
  if (!window.isSecureContext) return 'Camera access requires HTTPS or localhost.'
  if (error?.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in Safari settings and try again.'
  if (error?.name === 'NotFoundError') return 'No compatible rear camera was found.'
  if (error?.name === 'NotReadableError') return 'The camera is busy in another app. Close it there and try again.'
  return error?.message || 'The camera could not be started.'
}

export default function App() {
  const cameraRef = useRef(null)
  const voiceRef = useRef(null)
  const streamRef = useRef(null)
  const inferenceRef = useRef(false)
  const stateRef = useRef(ASSISTANT_STATES.IDLE)
  const voiceActiveRef = useRef(false)
  const requestTokenRef = useRef(0)
  const speechAttemptRef = useRef(0)
  const speechTimeoutRef = useRef(null)
  const latestResponseRef = useRef('')
  const pendingObjectRef = useRef('')
  const speechResolveRef = useRef(null)
  const lastConnectedExchangeRef = useRef(null)

  const [assistantState, setAssistantState] = useState(ASSISTANT_STATES.IDLE)
  const [experienceStarted, setExperienceStarted] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [results, setResults] = useState([])
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [latestResponse, setLatestResponse] = useState('Ask what is in front of you when SightBuddy is listening.')
  const [error, setError] = useState('')
  const [speechStatus, setSpeechStatus] = useState('')

  const changeState = useCallback((nextState) => {
    stateRef.current = nextState
    setAssistantState(nextState)
  }, [])

  const listeningState = useCallback(() => (
    voiceActiveRef.current ? ASSISTANT_STATES.LISTENING : ASSISTANT_STATES.IDLE
  ), [])

  useEffect(() => {
    if (import.meta.env.DEV) return
    import('./lib/offline.js')
      .then(({ prepareOfflineCache }) => prepareOfflineCache())
      .catch((offlineError) => setError(`App setup failed: ${offlineError.message}`))
  }, [])

  useEffect(() => () => {
    requestTokenRef.current += 1
    if (speechTimeoutRef.current) window.clearTimeout(speechTimeoutRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    window.speechSynthesis?.cancel()
  }, [])

  async function setVoicePaused(paused) {
    const { setVoiceInputPaused } = await import('./lib/voice-experiment.js')
    setVoiceInputPaused(paused)
  }

  async function startCamera() {
    if (cameraActive) return true
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera access. Use a current version of Safari.')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      cameraRef.current?.setStream(stream)
      await cameraRef.current?.video?.play()
      setDimensions({ width: cameraRef.current.video.videoWidth, height: cameraRef.current.video.videoHeight })
      setCameraActive(true)
      return true
    } catch (cameraError) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setError(friendlyCameraError(cameraError))
      changeState(ASSISTANT_STATES.ERROR)
      return false
    }
  }

  async function startSightBuddy() {
    setExperienceStarted(true)
    setError('')
    // Safari can reject concurrent camera and microphone getUserMedia requests.
    // Keep the single user action, but initialize the two inputs sequentially.
    const voiceReady = await voiceRef.current?.enableVoice() === true
    const cameraReady = await startCamera()
    if (cameraReady && voiceReady) {
      try {
        if (import.meta.env.PROD) {
          const { prepareDetectorCache } = await import('./lib/offline.js')
          await prepareDetectorCache()
        }
        const { loadCocoDetector } = await import('./lib/coco-detector.js')
        await loadCocoDetector()
      } catch (detectorError) {
        const phrase = 'Camera and voice are ready, but local object detection could not start.'
        setError(`Object detector startup failed: ${detectorError.message}`)
        saveResponse(phrase)
        await speakPhrase(phrase)
        return
      }
      const phrase = "SightBuddy is ready. I'm listening."
      saveResponse(phrase)
      await speakPhrase(phrase)
    } else if (!cameraReady && !voiceReady) {
      const phrase = 'Camera and voice could not start. Check camera and microphone permission for this website, then try again.'
      saveResponse(phrase)
      await speakPhrase(phrase)
    } else if (!cameraReady) {
      saveResponse('Voice is ready, but the camera needs permission.')
      await speakPhrase('Voice is ready, but the camera needs permission.')
    } else {
      const phrase = 'The camera is ready, but voice listening could not start. Check microphone permission for this website, then tap Start SightBuddy again.'
      saveResponse(phrase)
      await speakPhrase(phrase)
    }
  }

  function speakPhrase(phrase) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance !== 'function') {
      setSpeechStatus('Speech is not available in this browser.')
      return Promise.resolve(false)
    }
    const attempt = ++speechAttemptRef.current
    if (speechTimeoutRef.current) window.clearTimeout(speechTimeoutRef.current)
    window.speechSynthesis.cancel()
    setVoicePaused(true)
    changeState(ASSISTANT_STATES.SPEAKING)
    setSpeechStatus(phrase)

    return new Promise((resolve) => {
      const utterance = configureFriendlySpeech(new SpeechSynthesisUtterance(phrase))
      const finish = (success) => {
        if (attempt !== speechAttemptRef.current) return
        if (speechTimeoutRef.current) window.clearTimeout(speechTimeoutRef.current)
        speechTimeoutRef.current = null
        setSpeechStatus(success ? 'Finished speaking.' : 'Speech could not be played. Check device volume and voice settings.')
        setVoicePaused(false)
        changeState(listeningState())
        speechResolveRef.current = null
        resolve(success)
      }
      speechResolveRef.current = resolve
      utterance.onend = () => finish(true)
      utterance.onerror = () => finish(false)
      window.speechSynthesis.resume()
      window.speechSynthesis.speak(utterance)
      speechTimeoutRef.current = window.setTimeout(() => finish(true), 20000)
    })
  }

  function saveResponse(phrase) {
    latestResponseRef.current = phrase
    setLatestResponse(phrase)
  }

  async function runCocoFrame(token = requestTokenRef.current, updateDisplay = true) {
    if (import.meta.env.PROD) {
      const { prepareDetectorCache } = await import('./lib/offline.js')
      await prepareDetectorCache()
    }
    const { detectCocoObjects } = await import('./lib/coco-detector.js')
    const output = await detectCocoObjects(cameraRef.current.video)
    if (token !== requestTokenRef.current) return null
    if (updateDisplay) {
      setResults(output.detections)
      setDimensions({ width: output.width, height: output.height })
    }
    return output
  }

  async function runFastCocoRequest(targetObject = '', speakAutomatically = true, navigationSafety = false, connectedQuestion = '', useConversationContext = false) {
    if (!cameraActive) {
      if (speakAutomatically) await speakPhrase('Please start SightBuddy before asking about the camera view.')
      return
    }
    if (inferenceRef.current || isAssistantBusy(stateRef.current)) return

    const token = ++requestTokenRef.current
    inferenceRef.current = true
    setError('')
    setResults([])
    setLatestResponse('Checking the current camera view…')
    setVoicePaused(true)
    changeState(ASSISTANT_STATES.CAPTURING)
    try {
      const frame = cameraRef.current.captureFrame(1024)
      if (frame.brightness < DARK_FRAME_THRESHOLD) {
        const phrase = navigationSafety
          ? "I can't determine whether it's safe to walk. The camera view is too dark. Try pointing the camera toward more light."
          : 'The camera view is too dark. Try pointing the camera toward more light.'
        saveResponse(phrase)
        if (speakAutomatically) await speakPhrase(phrase)
        return
      }
      changeState(ASSISTANT_STATES.THINKING)
      const frames = []
      let output
      for (let index = 0; index < CONSENSUS_FRAME_COUNT; index += 1) {
        output = await runCocoFrame(token, false)
        if (!output) return
        frames.push(output.detections)
        if (index < CONSENSUS_FRAME_COUNT - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, CONSENSUS_INTERVAL_MS))
        }
      }
      const accepted = consensusDetections(frames)
      setResults(accepted)
      setDimensions({ width: output.width, height: output.height })
      const normalizedTarget = OBJECT_ALIASES[targetObject] || targetObject
      const targetLabels = GROUPED_TARGETS[normalizedTarget] || [normalizedTarget]
      const targetIsSupported = targetLabels.some((label) => COCO_CLASSES.includes(label))
      const targetDetection = normalizedTarget
        ? accepted.find((item) => targetLabels.includes(item.label))
        : null
      const targetPosition = targetDetection
        ? (targetDetection.x1 + targetDetection.x2) / 2 < output.width / 3
          ? 'on the left'
          : (targetDetection.x1 + targetDetection.x2) / 2 > output.width * 2 / 3
            ? 'on the right'
            : 'in the center'
        : ''
      const scenePhrase = normalizedTarget
        ? !targetIsSupported
          ? `I don't recognize ${targetObject} yet. Try showing me another view.`
          : targetDetection
            ? `Yes, I can see a ${targetObject} ${targetPosition}.`
            : `I don't see ${targetObject} in this view yet. Slowly move the camera left or right, then say okay.`
        : describeSceneDetections(accepted, output.width)
      let phrase = navigationSafety
        ? describeWalkingView(accepted, output.width)
        : scenePhrase
      if (connectedQuestion && !navigationSafety) {
        try {
          const { askConnectedVision } = await import('./lib/connected-vision.js')
          const connectedAnswer = await askConnectedVision({
            image: frame.dataUrl,
            question: connectedQuestion,
            localDetections: accepted.map((item) => `${item.label} ${Math.round(item.score * 100)}%`),
            context: useConversationContext ? lastConnectedExchangeRef.current : null,
          })
          if (token !== requestTokenRef.current) return
          phrase = connectedAnswer
          lastConnectedExchangeRef.current = { question: connectedQuestion, answer: connectedAnswer }
        } catch {
          if (token !== requestTokenRef.current) return
        }
      }
      if (normalizedTarget) pendingObjectRef.current = !targetDetection ? targetObject : ''
      saveResponse(phrase)
      if (speakAutomatically) await speakPhrase(phrase)
    } catch (detectionError) {
      if (token !== requestTokenRef.current) return
      const phrase = "I couldn't analyze the camera view. Please try again."
      setError(`Object detection failed: ${detectionError.message}`)
      saveResponse(phrase)
      if (speakAutomatically) await speakPhrase(phrase)
    } finally {
      inferenceRef.current = false
      if (token === requestTokenRef.current) {
        setVoicePaused(false)
        if (stateRef.current !== ASSISTANT_STATES.SPEAKING) changeState(listeningState())
      }
    }
  }

  async function describeFromVoice() {
    await speakPhrase('Let me take a look.')
    await runFastCocoRequest('', true, false, "What's in front of me?")
  }

  async function answerVisualQuestion(question) {
    const match = question.match(/^(?:can you see|do you see|is there|where is) (?:a |an |my |the )?(.+?)(?: anywhere)?$/)
    if (!match) {
      await speakPhrase('Let me take a look.')
      await runFastCocoRequest('', true, false, question)
      return
    }
    const requested = match[1].trim()
    await speakPhrase(`Let me check for ${requested}.`)
    await runFastCocoRequest(requested, true, false, question)
  }

  async function answerFollowUp(question) {
    if (!lastConnectedExchangeRef.current) {
      await speakPhrase("Ask me what you want me to look at first.")
      return
    }
    await speakPhrase('Let me look more closely.')
    await runFastCocoRequest('', true, false, question, true)
  }

  async function answerNavigationQuestion() {
    await speakPhrase("I'll take a careful look.")
    await runFastCocoRequest('', true, true)
  }

  function stopCurrentRequest() {
    requestTokenRef.current += 1
    pendingObjectRef.current = ''
    speechAttemptRef.current += 1
    if (speechTimeoutRef.current) window.clearTimeout(speechTimeoutRef.current)
    speechTimeoutRef.current = null
    window.speechSynthesis?.cancel()
    speechResolveRef.current?.(false)
    speechResolveRef.current = null
    setVoicePaused(false)
    setSpeechStatus('Stopped.')
    changeState(listeningState())
  }

  async function repeatLastResponse() {
    await speakPhrase(latestResponseRef.current || "I don't have a response to repeat yet.")
  }

  async function respondToWake() {
    const phrase = 'Hey Charles, how can I help you?'
    saveResponse(phrase)
    await speakPhrase(phrase)
  }

  async function respondToThanks() {
    const phrase = "You're welcome."
    saveResponse(phrase)
    await speakPhrase(phrase)
  }

  async function retryPendingObject() {
    const targetObject = pendingObjectRef.current
    if (!targetObject) {
      await speakPhrase("Tell me what you'd like me to look for.")
      return
    }
    await runFastCocoRequest(targetObject, true, false, `Can you see my ${targetObject}?`)
  }

  async function findObject(requestedObject) {
    if (!cameraActive) {
      await speakPhrase('Please start SightBuddy before asking it to find an object.')
      return
    }
    if (inferenceRef.current || isAssistantBusy(stateRef.current)) return
    const normalized = requestedObject.toLowerCase().replace(/^(?:a|an|the) /, '').trim()
    pendingObjectRef.current = normalized
    const opening = `I'll look for your ${normalized}. Move your camera slowly.`
    saveResponse(opening)
    await speakPhrase(opening)
    await runFastCocoRequest(normalized, true, false, `Can you see my ${normalized}?`)
  }

  const status = assistantStatus(assistantState, '')

  return (
    <main className={experienceStarted ? 'camera-mode' : ''}>
      {!experienceStarted && <>
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false">
            <path d="M6 24C10.5 15.5 16.5 11 24 11s13.5 4.5 18 13c-4.5 8.5-10.5 13-18 13S10.5 32.5 6 24Z" />
            <circle cx="24" cy="24" r="7" />
            <circle className="eye-shine" cx="27" cy="21" r="2" />
          </svg>
        </div>
        <div><h1>SightBuddy</h1><p>Your voice-first visual companion.</p></div>
        <div className="privacy-pill" aria-label="Hybrid AI: local processing with connected vision for explicit questions"><span aria-hidden="true">●</span> Hybrid AI</div>
      </header>

      <section className="assistant-hero" aria-label="Start SightBuddy">
        <p className="sr-only" id="start-help">Hi, I’m SightBuddy. To start, double-tap this large button in the center of the screen.</p>
        <button type="button" className="button primary start-sightbuddy" onClick={startSightBuddy} disabled={cameraActive && voiceActive} autoFocus aria-label="Start SightBuddy" aria-describedby="start-help" aria-pressed={cameraActive && voiceActive}>
          <span className="start-kicker">ONE TAP · THEN USE YOUR VOICE</span>
          <span>{cameraActive && voiceActive ? 'SightBuddy is listening' : 'Start SightBuddy'}</span>
        </button>
      </section>
      {error && <div className="error-banner" role="alert"><strong>Something needs attention.</strong> {error}</div>}
      <footer><span aria-hidden="true">◆</span> Your surroundings, described through voice.</footer>
      </>}

      {experienceStarted && (
        <section className="camera-fullscreen" aria-label="Live rear camera">
          <CameraView ref={cameraRef} active={cameraActive} detections={results.filter((item) => Number.isFinite(item.x1))} dimensions={dimensions} />
          <div className="camera-status">
            <div className={`assistant-state state-${assistantState.toLowerCase()}`} role="status" aria-live="polite" aria-atomic="true">
              <span aria-hidden="true" /><strong>{status}</strong>
            </div>
            <p className="latest-response" aria-live="polite">{latestResponse}</p>
            {speechStatus && <p className="sr-only" role="status">{speechStatus}</p>}
            {error && <div className="error-banner" role="alert"><strong>Something needs attention.</strong> {error}</div>}
          </div>
        </section>
      )}

      <VoiceExperiment
        hidden
        ref={voiceRef}
        onDescribe={describeFromVoice}
        onVisualQuestion={answerVisualQuestion}
        onFollowUp={answerFollowUp}
        onNavigationQuestion={answerNavigationQuestion}
        onFindObject={findObject}
        onWake={respondToWake}
        onThanks={respondToThanks}
        onRetry={retryPendingObject}
        onRepeat={repeatLastResponse}
        onStopCommand={stopCurrentRequest}
        onError={(message) => setError(`Voice startup failed: ${message}`)}
        onActiveChange={(active) => {
          voiceActiveRef.current = active
          setVoiceActive(active)
          if (!isAssistantBusy(stateRef.current)) changeState(active ? ASSISTANT_STATES.LISTENING : ASSISTANT_STATES.IDLE)
        }}
      />

    </main>
  )
}
