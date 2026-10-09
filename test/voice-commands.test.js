import test from 'node:test'
import assert from 'node:assert/strict'
import { COMMAND_GRAMMAR, identifyCommand } from '../src/lib/voice-commands.js'

test('keeps existing describe, repeat, and stop commands', () => {
  assert.deepEqual(identifyCommand("what's in front of me"), { type: 'describe' })
  assert.deepEqual(identifyCommand('what do you see'), { type: 'describe' })
  assert.deepEqual(identifyCommand('what is ahead of me'), { type: 'describe' })
  assert.deepEqual(identifyCommand('repeat'), { type: 'repeat' })
  assert.deepEqual(identifyCommand('stop'), { type: 'stop' })
})

test('recognizes conversational wake, thanks, and retry turns', () => {
  assert.deepEqual(identifyCommand('hey buddy'), { type: 'wake' })
  assert.deepEqual(identifyCommand('thank you'), { type: 'thanks' })
  assert.deepEqual(identifyCommand('okay'), { type: 'retry' })
})

test('recognizes safety-related navigation questions without approving movement', () => {
  assert.deepEqual(identifyCommand('can i walk straight'), { type: 'navigation' })
  assert.deepEqual(identifyCommand('is the way clear'), { type: 'navigation' })
  assert.deepEqual(identifyCommand('is it safe to walk here'), { type: 'navigation' })
})

test('parses controlled visual questions and find-object commands', () => {
  assert.deepEqual(identifyCommand('can you see my guitar'), {
    type: 'question',
    question: 'can you see my guitar',
  })
  assert.deepEqual(identifyCommand('do you see my bag'), {
    type: 'question',
    question: 'do you see my bag',
  })
  assert.deepEqual(identifyCommand('where is the guitar'), {
    type: 'question',
    question: 'where is the guitar',
  })
  assert.deepEqual(identifyCommand('find my phone'), { type: 'find', object: 'phone' })
  assert.ok(COMMAND_GRAMMAR.includes('find the chair'))
})

test('recognizes relationship and color questions for connected vision', () => {
  assert.deepEqual(identifyCommand('what is beside the chair'), { type: 'question', question: 'what is beside the chair' })
  assert.deepEqual(identifyCommand('what color is the backpack'), { type: 'question', question: 'what color is the backpack' })
})

test('recognizes connected-vision follow-up questions', () => {
  assert.deepEqual(identifyCommand('tell me more'), { type: 'followup', question: 'tell me more' })
  assert.deepEqual(identifyCommand('what color is it'), { type: 'followup', question: 'what color is it' })
  assert.ok(COMMAND_GRAMMAR.includes('where exactly is it'))
})
