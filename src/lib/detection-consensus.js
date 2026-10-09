const LABEL_THRESHOLDS = Object.freeze({
  bed: 0.85,
  couch: 0.82,
  'dining table': 0.78,
})

export function consensusDetections(
  frames,
  { minimumFrames = 2, minimumAverageScore = 0.72 } = {},
) {
  const byLabel = new Map()

  frames.forEach((detections) => {
    const bestInFrame = new Map()
    detections.forEach((detection) => {
      const current = bestInFrame.get(detection.label)
      if (!current || detection.score > current.score) bestInFrame.set(detection.label, detection)
    })
    bestInFrame.forEach((detection, label) => {
      const entries = byLabel.get(label) || []
      entries.push(detection)
      byLabel.set(label, entries)
    })
  })

  return [...byLabel.entries()]
    .filter(([label, entries]) => {
      const average = entries.reduce((sum, item) => sum + item.score, 0) / entries.length
      return entries.length >= minimumFrames
        && average >= Math.max(minimumAverageScore, LABEL_THRESHOLDS[label] || 0)
    })
    .map(([, entries]) => {
      const count = entries.length
      return {
        ...entries[0],
        score: entries.reduce((sum, item) => sum + item.score, 0) / count,
        x1: entries.reduce((sum, item) => sum + item.x1, 0) / count,
        y1: entries.reduce((sum, item) => sum + item.y1, 0) / count,
        x2: entries.reduce((sum, item) => sum + item.x2, 0) / count,
        y2: entries.reduce((sum, item) => sum + item.y2, 0) / count,
      }
    })
    .sort((left, right) => right.score - left.score)
}
