import test from 'node:test'
import assert from 'node:assert/strict'
import { horizontalPosition, intersectionOverUnion, nonMaxSuppression } from '../src/lib/geometry.js'

test('horizontalPosition divides the image into thirds', () => {
  assert.equal(horizontalPosition({ x1: 0, x2: 20 }, 90), 'Left')
  assert.equal(horizontalPosition({ x1: 35, x2: 55 }, 90), 'Center')
  assert.equal(horizontalPosition({ x1: 70, x2: 90 }, 90), 'Right')
})

test('intersectionOverUnion returns expected overlap', () => {
  const result = intersectionOverUnion({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 15, y2: 15 })
  assert.equal(result, 25 / 175)
})

test('NMS suppresses overlapping boxes of the same class only', () => {
  const boxes = [
    { x1: 0, y1: 0, x2: 10, y2: 10, score: .9, classId: 0 },
    { x1: 1, y1: 1, x2: 11, y2: 11, score: .8, classId: 0 },
    { x1: 1, y1: 1, x2: 11, y2: 11, score: .7, classId: 1 },
  ]
  const result = nonMaxSuppression(boxes, .45)
  assert.equal(result.length, 2)
  assert.deepEqual(result.map((box) => box.classId), [0, 1])
})
