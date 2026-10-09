import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { configureFriendlySpeech } from '../lib/speech-style.js'

const DESCRIPTION_THROTTLE_MS = 8000

function metric(value, suffix = ' ms') {
  return Number.isFinite(value) ? `${Math.round(value)}${suffix}` : 'Not available'
}

function activateSpeechFromUserGesture() {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance !== 'function') return Promise.resolve()

  return new Promise((resolve) => {
    const utterance = configureFriendlySpeech(new SpeechSynthesisUtterance('Starting SightBuddy.'))
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(finish, 4000)
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.cancel()
    window.speechSynthesis.resume()
    window.speechSynthesis.speak(utterance)
  })
}

const VoiceExperiment = forwardRef(function VoiceExperiment({
  hidden = false,
  onDescribe,
  onVisualQuestion,
  onFollowUp,
  onNavigationQuestion,
  onFindObject,
  onWake,
  onThanks,
  onRetry,
  onRepeat,
  onStopCommand,
  onActiveChange,
  onError,
}, ref) {
  const actionsRef = useRef({ onDescribe, onVisualQuestion, onFollowUp, onNavigationQuestion, onFindObject, onWake, onThanks, onRetry, onRepeat, onStopCommand })
  const lastDescriptionAtRef = useRef(0)
  const startingRef = useRef(false)
  const stopVoiceRef = useRef(null)
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [vadActive, setVadActive] = useState(false)
  const [status, setStatus] = useState('Voice input is off.')
  const [offlineStatus, setOfflineStatus] = useState('Voice assets are not cached yet.')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [metrics, setMetrics] = useState({})

  useEffect(() => {
    actionsRef.current = { onDescribe, onVisualQuestion, onFollowUp, onNavigationQuestion, onFindObject, onWake, onThanks, onRetry, onRepeat, onStopCommand }
  }, [onDescribe, onFindObject, onFollowUp, onNavigationQuestion, onRepeat, onRetry, onStopCommand, onThanks, onVisualQuestion, onWake])

  useEffect(() => () => {
    import('../lib/voice-experiment.js')
      .then(({ stopVoiceExperiment }) => stopVoiceExperiment())
      .catch(() => {})
  }, [])

  async function stopVoice(message = 'Voice input stopped.') {
    if (startingRef.current) return
    actionsRef.current.onStopCommand()
    try {
      const { stopVoiceExperiment } = await import('../lib/voice-experiment.js')
      const finalMetrics = await stopVoiceExperiment()
      if (finalMetrics) setMetrics((current) => ({ ...current, ...finalMetrics }))
    } finally {
      setActive(false)
      onActiveChange?.(false)
      setStarting(false)
      setVadActive(false)
      setStatus(message)
    }
  }

  async function enableVoice() {
    if (active) return true
    if (startingRef.current) return false
    const speechActivation = activateSpeechFromUserGesture()
    startingRef.current = true
    setStarting(true)
    setError('')
    setTranscript('')
    setStatus('Starting the local voice experiment…')
    try {
      await speechActivation
      if (import.meta.env.PROD) {
        setStatus('Caching the local voice model for offline use...')
        const { prepareVoiceCache } = await import('../lib/offline.js')
        const cacheStatus = await prepareVoiceCache()
        setOfflineStatus(`Offline voice ready (${cacheStatus.cached}/${cacheStatus.total} assets).`)
      }
      const { startVoiceExperiment } = await import('../lib/voice-experiment.js')
      const initialMetrics = await startVoiceExperiment({
        onStatus(stage, message) {
          setStatus(message)
          if (stage === 'error') setError(message)
        },
        onVad(speaking) {
          setVadActive(speaking)
        },
        onTranscript(text, partial) {
          setTranscript(partial ? `Hearing: ${text}` : `Heard: ${text}`)
        },
        onMetrics(nextMetrics) {
          setMetrics((current) => ({ ...current, ...nextMetrics }))
        },
        onCommand(command) {
          if (command.type === 'wake') {
            actionsRef.current.onWake()
            return
          }
          if (command.type === 'thanks') {
            actionsRef.current.onThanks()
            return
          }
          if (command.type === 'retry') {
            actionsRef.current.onRetry()
            return
          }
          if (command.type === 'stop') {
            actionsRef.current.onStopCommand()
            setStatus('Stopped. Listening for another command.')
            return
          }
          if (command.type === 'repeat') {
            actionsRef.current.onRepeat()
            return
          }
          if (command.type === 'navigation') {
            actionsRef.current.onNavigationQuestion()
            return
          }
          if (command.type === 'describe' || command.type === 'question' || command.type === 'followup') {
            const now = Date.now()
            if (now - lastDescriptionAtRef.current < DESCRIPTION_THROTTLE_MS) {
              setStatus('Description command throttled. Please wait a moment.')
              return
            }
            lastDescriptionAtRef.current = now
            if (command.type === 'describe') actionsRef.current.onDescribe()
            else if (command.type === 'followup') actionsRef.current.onFollowUp(command.question)
            else actionsRef.current.onVisualQuestion(command.question)
            return
          }
          if (command.type === 'find') actionsRef.current.onFindObject(command.object)
        },
      })
      setMetrics((current) => ({ ...current, ...initialMetrics }))
      setActive(true)
      onActiveChange?.(true)
      return true
    } catch (voiceError) {
      const message = voiceError?.message || 'Unknown voice startup error.'
      setError(message)
      setStatus('Voice experiment unavailable.')
      setActive(false)
      onActiveChange?.(false)
      onError?.(message)
      return false
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  stopVoiceRef.current = stopVoice

  useImperativeHandle(ref, () => ({ enableVoice, stopVoice }))

  useEffect(() => {
    if (!active) return undefined
    const handleVisibility = () => {
      if (document.hidden) stopVoiceRef.current?.('Voice input stopped because SightBuddy left the foreground.')
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [active])

  if (hidden) return null

  return (
    <section className={`panel voice-panel ${active ? 'voice-active' : ''}`} aria-labelledby="voice-title">
      <div className="voice-heading">
        <span className={`voice-indicator ${vadActive ? 'hearing' : ''}`} aria-hidden="true" />
        <div>
          <p className="eyebrow">LOCAL VOICE EXPERIMENT</p>
          <h2 id="voice-title">{active ? (vadActive ? 'Voice detected' : 'Listening locally') : 'Voice input off'}</h2>
          <p className="muted" role="status" aria-live="polite">{status}</p>
          {transcript && <p className="voice-transcript">{transcript}</p>}
        </div>
      </div>

      <div className="voice-controls">
        <button type="button" className="button voice-enable" onClick={enableVoice} disabled={active || starting}>
          {starting ? 'Starting Voice…' : 'Enable Voice Experiment'}
        </button>
        <button type="button" className="button secondary" onClick={() => stopVoice()} disabled={!active}>
          Stop Voice
        </button>
      </div>

      <p className="mode-note warning">
        Experimental and foreground-only. Try “What’s in front of me?”, “Describe my surroundings”, “Repeat”, or “Stop”.
        Audio stays in memory and is not uploaded or recorded.
      </p>
      <p className="mode-note">{offlineStatus}</p>
      {error && <p className="voice-error" role="alert">{error}</p>}

      <details className="voice-metrics">
        <summary>Voice experiment measurements</summary>
        <dl>
          <div><dt>Startup</dt><dd>{metric(metrics.startupMs)}</dd></div>
          <div><dt>Model load</dt><dd>{metric(metrics.modelLoadMs)}</dd></div>
          <div><dt>Microphone</dt><dd>{metric(metrics.microphoneMs)}</dd></div>
          <div><dt>Recognition latency</dt><dd>{metric(metrics.recognitionLatencyMs)}</dd></div>
          <div><dt>Audio sample rate</dt><dd>{metric(metrics.sampleRate, ' Hz')}</dd></div>
          <div><dt>JS heap before/after</dt><dd>{metrics.heapBeforeMb == null ? 'Not exposed by Safari' : `${metrics.heapBeforeMb} / ${metrics.heapAfterMb ?? '—'} MB`}</dd></div>
          <div><dt>Active session</dt><dd>{metric(metrics.activeMs)}</dd></div>
          <div><dt>Battery</dt><dd>{metrics.batteryMeasurement || 'Measure during a timed physical-device test.'}</dd></div>
        </dl>
      </details>
    </section>
  )
})

export default VoiceExperiment
