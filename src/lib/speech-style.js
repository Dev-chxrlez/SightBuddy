const FRIENDLY_VOICE_NAMES = ['samantha', 'ava', 'siri', 'allison', 'zoe', 'enhanced', 'premium']

function voiceScore(voice) {
  const name = voice.name.toLowerCase()
  const language = voice.lang.toLowerCase()
  let score = language === 'en-us' ? 40 : language.startsWith('en-') ? 30 : 0
  if (voice.localService) score += 12
  const preferredIndex = FRIENDLY_VOICE_NAMES.findIndex((candidate) => name.includes(candidate))
  if (preferredIndex >= 0) score += 25 - preferredIndex
  if (name.includes('compact')) score -= 10
  return score
}

export function configureFriendlySpeech(utterance) {
  const voices = getEnglishSpeechVoices()
  const voice = voices.find((candidate) => (
    candidate.name.toLowerCase().includes('karen')
    && candidate.lang.toLowerCase() === 'en-au'
  )) || [...voices]
    .filter((candidate) => candidate.lang.toLowerCase().startsWith('en'))
    .sort((left, right) => voiceScore(right) - voiceScore(left))[0]

  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang || 'en-US'
  utterance.rate = 0.94
  utterance.pitch = 1.02
  utterance.volume = 1
  return utterance
}

export function getEnglishSpeechVoices() {
  return (window.speechSynthesis?.getVoices?.() || [])
    .filter((voice) => voice.lang.toLowerCase().startsWith('en'))
    .sort((left, right) => left.name.localeCompare(right.name))
}
