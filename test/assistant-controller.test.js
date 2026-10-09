import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT_STATES, assistantStatus, isAssistantBusy } from '../src/lib/assistant-controller.js'

test('exposes accessible state labels', () => {
  assert.equal(assistantStatus(ASSISTANT_STATES.CAPTURING), 'Looking')
  assert.equal(assistantStatus(ASSISTANT_STATES.SEARCHING, 'phone'), 'Searching for phone')
})

test('blocks overlapping capture, inference, and speech states', () => {
  assert.equal(isAssistantBusy(ASSISTANT_STATES.THINKING), true)
  assert.equal(isAssistantBusy(ASSISTANT_STATES.SPEAKING), true)
  assert.equal(isAssistantBusy(ASSISTANT_STATES.LISTENING), false)
})
