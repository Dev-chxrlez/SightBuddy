export function intersectionOverUnion(a, b) {
  const x1 = Math.max(a.x1, b.x1)
  const y1 = Math.max(a.y1, b.y1)
  const x2 = Math.min(a.x2, b.x2)
  const y2 = Math.min(a.y2, b.y2)
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1)
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1)
  const union = areaA + areaB - intersection
  return union > 0 ? intersection / union : 0
}

export function nonMaxSuppression(detections, iouThreshold = 0.45, limit = 20) {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const kept = []

  while (sorted.length && kept.length < limit) {
    const candidate = sorted.shift()
    kept.push(candidate)
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      if (
        sorted[index].classId === candidate.classId &&
        intersectionOverUnion(candidate, sorted[index]) > iouThreshold
      ) {
        sorted.splice(index, 1)
      }
    }
  }
  return kept
}

export function horizontalPosition(box, imageWidth) {
  const center = (box.x1 + box.x2) / 2
  if (center < imageWidth / 3) return 'Left'
  if (center > (imageWidth * 2) / 3) return 'Right'
  return 'Center'
}
