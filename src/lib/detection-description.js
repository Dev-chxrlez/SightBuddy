export const NO_DETECTIONS_MESSAGE = "I'm not recognizing anything clearly yet. Slowly move the camera left or right, then ask me again."

const IRREGULAR_PLURALS = {
  person: 'people',
  mouse: 'mice',
}

function pluralize(label, count) {
  if (count === 1) return label
  if (IRREGULAR_PLURALS[label]) return IRREGULAR_PLURALS[label]
  if (label.endsWith('s')) return label
  return `${label}s`
}

function joinNaturally(items) {
  if (items.length < 2) return items[0] || ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

export function describeDetections(detections, maximumClasses = 4) {
  if (!detections.length) return NO_DETECTIONS_MESSAGE

  const groups = new Map()
  for (const detection of detections) {
    const current = groups.get(detection.label) || { count: 0, score: 0 }
    current.count += 1
    current.score = Math.max(current.score, detection.score)
    groups.set(detection.label, current)
  }

  const phrases = [...groups.entries()]
    .sort((left, right) => right[1].score - left[1].score)
    .slice(0, maximumClasses)
    .map(([label, details]) => {
      if (details.count > 1) return `${details.count} ${pluralize(label, details.count)}`
      const article = /^[aeiou]/i.test(label) ? 'an' : 'a'
      return `${article} ${label}`
    })

  return `I can see ${joinNaturally(phrases)}.`
}

export function describeSceneDetections(detections, imageWidth, maximumObjects = 4) {
  if (!detections.length) return NO_DETECTIONS_MESSAGE

  const selected = [...detections]
    .sort((left, right) => right.score - left.score)
    .slice(0, maximumObjects)
  const counts = selected.reduce((map, detection) => {
    map.set(detection.label, (map.get(detection.label) || 0) + 1)
    return map
  }, new Map())
  const describedLabels = new Set()
  const phrases = []

  for (const detection of selected) {
    if (describedLabels.has(detection.label)) continue
    describedLabels.add(detection.label)
    const count = counts.get(detection.label)
    if (count > 1) {
      phrases.push(`${count} ${pluralize(detection.label, count)}`)
      continue
    }
    const article = /^[aeiou]/i.test(detection.label) ? 'an' : 'a'
    const center = (detection.x1 + detection.x2) / 2
    const position = !imageWidth
      ? ''
      : center < imageWidth / 3
        ? ' on the left'
        : center > imageWidth * 2 / 3
          ? ' on the right'
          : ' in the center'
    phrases.push(`${article} ${detection.label}${position}`)
  }

  return `I can see ${joinNaturally(phrases)}.`
}

export function describeWalkingView(detections, imageWidth) {
  if (!detections.length) {
    return "I can't confirm the path is clear. Slowly move the camera left or right, then ask me again."
  }

  const description = describeSceneDetections(detections, imageWidth)
  const hasCenteredObject = detections.some((detection) => {
    const center = (detection.x1 + detection.x2) / 2
    return imageWidth && center >= imageWidth / 3 && center <= imageWidth * 2 / 3
  })

  if (hasCenteredObject) {
    return `${description.replaceAll(' in the center', ' in front of you')} Stop and check your path before moving.`
  }
  return `${description} I can't confirm the path is clear, so check before moving.`
}
