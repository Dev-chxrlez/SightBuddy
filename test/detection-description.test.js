import test from 'node:test'
import assert from 'node:assert/strict'
import { describeDetections, describeSceneDetections, describeWalkingView, NO_DETECTIONS_MESSAGE } from '../src/lib/detection-description.js'

test('describes multiple supported classes naturally', () => {
  assert.equal(describeDetections([
    { label: 'cell phone', score: 0.91 },
    { label: 'chair', score: 0.82 },
  ]), 'I can see a cell phone and a chair.')
})

test('groups repeated detections without inventing details', () => {
  assert.equal(describeDetections([
    { label: 'person', score: 0.94 },
    { label: 'person', score: 0.88 },
    { label: 'bottle', score: 0.75 },
  ]), 'I can see 2 people and a bottle.')
})

test('returns the uncertainty phrase when nothing is detected', () => {
  assert.equal(describeDetections([]), NO_DETECTIONS_MESSAGE)
})

test('adds useful left, center, and right positions without claiming distance', () => {
  assert.equal(describeSceneDetections([
    { label: 'chair', score: 0.9, x1: 0, x2: 100 },
    { label: 'person', score: 0.85, x1: 250, x2: 390 },
    { label: 'bottle', score: 0.8, x1: 520, x2: 620 },
  ], 640), 'I can see a chair on the left, a person in the center, and a bottle on the right.')
})

test('warns naturally when an object is centered in the walking view', () => {
  assert.equal(describeWalkingView([
    { label: 'chair', score: 0.9, x1: 250, x2: 390 },
  ], 640), 'I can see a chair in front of you. Stop and check your path before moving.')
})

test('does not claim an empty detection means the path is clear', () => {
  assert.equal(describeWalkingView([], 640), "I can't confirm the path is clear. Slowly move the camera left or right, then ask me again.")
})
