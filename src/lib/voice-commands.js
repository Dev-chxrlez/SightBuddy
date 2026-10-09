const VISUAL_OBJECTS = [
  'person', 'bottle', 'phone', 'cell phone', 'chair', 'backpack', 'guitar',
  'cup', 'book', 'laptop', 'dog', 'cat', 'table', 'bag', 'handbag', 'suitcase',
  'door', 'keys', 'stick', 'blind stick', 'white cane', 'cane',
]

const FOLLOW_UP_QUESTIONS = [
  'tell me more',
  'describe it in more detail',
  'what else do you see',
  'where exactly is it',
  'what is it next to',
  'what is beside it',
  'what is behind it',
  'what is under it',
  'what color is it',
  'how many are there',
  'is it on the left or right',
  'can you describe it',
]

export const COMMAND_GRAMMAR = [
  'hey buddy',
  'hey sight buddy',
  "what's in front of me",
  'what is in front of me',
  "what's in front",
  'what is ahead of me',
  'what do you see',
  'what can you see',
  'what is around me',
  'describe what you see',
  'can i walk straight',
  'can i walk here',
  'is the way clear',
  'is it safe to walk here',
  'is it safe to walk straight',
  'describe my surroundings',
  'describe surroundings',
  'what objects can you see',
  'what is this',
  'what am i looking at',
  ...FOLLOW_UP_QUESTIONS,
  ...VISUAL_OBJECTS.flatMap((object) => [
    `can you see a ${object}`,
    `can you see my ${object}`,
    `do you see a ${object}`,
    `do you see my ${object}`,
    `do you see ${object} anywhere`,
    `is there a ${object}`,
    `where is the ${object}`,
    `where is my ${object}`,
    `find my ${object}`,
    `find the ${object}`,
    `what is beside the ${object}`,
    `what is next to the ${object}`,
    `what is near the ${object}`,
    `what is on the ${object}`,
    `what is under the ${object}`,
    `what color is the ${object}`,
  ]),
  'repeat',
  'stop',
  'thank you',
  'thanks',
  'okay',
  'ok',
  'try again',
  'now',
  '[unk]',
]

export function identifyCommand(text) {
  const normalized = text.toLowerCase().replace(/[^a-z' ]/g, '').trim()
  if (normalized === 'hey buddy' || normalized === 'hey sight buddy') return { type: 'wake' }
  if (normalized === 'stop') return { type: 'stop' }
  if (normalized.includes('repeat')) return { type: 'repeat' }
  if (normalized === 'thank you' || normalized === 'thanks') return { type: 'thanks' }
  if (['okay', 'ok', 'try again', 'now'].includes(normalized)) return { type: 'retry' }
  if (FOLLOW_UP_QUESTIONS.includes(normalized)) return { type: 'followup', question: normalized }
  if (
    normalized.startsWith('can i walk')
    || normalized === 'is the way clear'
    || normalized.startsWith('is it safe to walk')
  ) return { type: 'navigation' }
  if (
    normalized.includes('front of me')
    || normalized === "what's in front"
    || normalized.includes('ahead of me')
    || normalized.includes('around me')
    || normalized.includes('describe')
    || normalized === 'what do you see'
    || normalized === 'what can you see'
  ) return { type: 'describe' }
  const findMatch = normalized.match(/^find (?:my|the) (.+)$/)
  if (findMatch) return { type: 'find', object: findMatch[1] }
  if (
    normalized === 'what objects can you see'
    || normalized === 'what is this'
    || normalized === 'what am i looking at'
    || normalized.startsWith('can you see ')
    || normalized.startsWith('do you see ')
    || normalized.startsWith('is there ')
    || normalized.startsWith('where is ')
    || normalized.startsWith('what is beside ')
    || normalized.startsWith('what is next to ')
    || normalized.startsWith('what is near ')
    || normalized.startsWith('what is on ')
    || normalized.startsWith('what is under ')
    || normalized.startsWith('what color is ')
  ) return { type: 'question', question: normalized }
  return null
}
