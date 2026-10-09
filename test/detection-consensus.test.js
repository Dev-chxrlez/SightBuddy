import test from 'node:test'
import assert from 'node:assert/strict'
import { consensusDetections } from '../src/lib/detection-consensus.js'

const detection = (label, score, x = 0) => ({ label, score, x1: x, y1: 0, x2: x + 100, y2: 100, classId: 1 })

test('rejects a confident-looking label that appears in only one frame', () => {
  assert.deepEqual(consensusDetections([
    [detection('bed', 0.9)],
    [],
    [],
  ]), [])
})

test('accepts a stable high-confidence detection across fresh frames', () => {
  const result = consensusDetections([
    [detection('person', 0.8, 10)],
    [detection('person', 0.76, 20)],
    [],
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].label, 'person')
  assert.equal(result[0].x1, 15)
})

test('applies a stricter threshold to frequent scene-level false labels', () => {
  assert.deepEqual(consensusDetections([
    [detection('bed', 0.8)],
    [detection('bed', 0.82)],
    [detection('bed', 0.81)],
  ]), [])
})
