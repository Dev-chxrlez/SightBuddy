export const ASSISTANT_STATES = Object.freeze({
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  CAPTURING: 'CAPTURING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  SEARCHING: 'SEARCHING',
  ERROR: 'ERROR',
})

export function assistantStatus(state, searchObject = '') {
  switch (state) {
    case ASSISTANT_STATES.LISTENING: return 'Listening'
    case ASSISTANT_STATES.CAPTURING: return 'Looking'
    case ASSISTANT_STATES.THINKING: return 'Thinking'
    case ASSISTANT_STATES.SPEAKING: return 'Speaking'
    case ASSISTANT_STATES.SEARCHING: return `Searching for ${searchObject || 'an object'}`
    case ASSISTANT_STATES.ERROR: return 'Needs attention'
    default: return 'Ready to start'
  }
}

export function isAssistantBusy(state) {
  return [
    ASSISTANT_STATES.CAPTURING,
    ASSISTANT_STATES.THINKING,
    ASSISTANT_STATES.SPEAKING,
  ].includes(state)
}
