import type {
  BuildBrief,
  BuildQuestion,
  BuildQuestionAnswer,
  BuildQuestionnaireCopy,
  BuildQuestionnaireGenerationResponse
} from './types'

export const BUILD_QUESTIONNAIRE_COPY: BuildQuestionnaireCopy = {
  title: 'Questions',
  selectOne: 'Select one answer',
  selectMultiple: 'Select multiple answers',
  otherLabel: 'Other',
  otherPlaceholder: 'Describe another direction',
  previous: 'Previous question',
  next: 'Next',
  skipAll: 'Skip all',
  submit: 'Submit',
  preparing: 'Preparing questions...',
  errorNotice: 'Questions could not be generated. You can skip and build from the original prompt.'
}

const QUESTION_COUNT = 5
const MIN_OPTIONS = 3
const MAX_OPTIONS = 5

type FallbackCategory = 'website' | 'app' | 'game' | 'generic'

interface FallbackQuestionnaireTemplate {
  category: FallbackCategory
  focus: string
  matches: RegExp
  questions: BuildQuestion[]
}

interface NormalizedQuestions {
  questions: BuildQuestion[]
  acceptedCount: number
  usedFallback: boolean
}

export function shouldTriggerBuildQuestions(prompt: string): boolean {
  const normalized = prompt.toLowerCase().trim()
  if (normalized.length < 8) return false
  return /\b(build|make|create|design|implement|code|generate|prototype|app|tool|website|site|page|landing|game|dashboard|component|bygg|bygga|skapa|gör|gora|designa|hemsida|sida|spel|verktyg)\b/.test(normalized)
}

export function detectPromptLanguage(prompt: string): string {
  const normalized = prompt.toLowerCase()
  if (/[åäö]/.test(normalized) || /\b(jag|vill|bygga|skapa|frågor|språk|hemsida|sida|spel|och|för|med)\b/.test(normalized)) {
    return 'sv'
  }
  if (/[áéíóúñ¿¡]/.test(normalized) || /\b(quiero|crear|hacer|pagina|sitio|juego)\b/.test(normalized)) {
    return 'es'
  }
  if (/[àâçéèêëîïôûùüÿœ]/.test(normalized) || /\b(je veux|creer|faire|site|page|jeu)\b/.test(normalized)) {
    return 'fr'
  }
  if (/[äöüß]/.test(normalized) || /\b(ich|mochte|erstellen|bauen|seite|spiel)\b/.test(normalized)) {
    return 'de'
  }
  return 'en'
}

export function parseQuestionGenerationJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Question generation returned an empty response.')

  for (const candidate of questionGenerationJsonCandidates(trimmed)) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (Array.isArray(parsed)) return { questions: parsed }
      if (isObject(parsed)) return parsed
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error('Question generation did not return JSON.')
}

export function normalizeBuildQuestionnaireGeneration({
  prompt,
  ui,
  parsed,
  warning
}: {
  prompt: string
  ui: BuildQuestionnaireCopy
  parsed?: unknown
  warning?: string
}): BuildQuestionnaireGenerationResponse {
  const fallback = createFallbackBuildQuestionnaire(prompt, ui, warning)
  const parsedObject = Array.isArray(parsed) ? { questions: parsed } : isObject(parsed) ? parsed : {}
  const normalized = normalizeGeneratedQuestions(parsedObject.questions, fallback.questions)
  const source =
    normalized.acceptedCount === 0
      ? 'fallback'
      : normalized.usedFallback
        ? 'mixed'
        : 'model'
  const finalWarning =
    warning ??
    (source === 'mixed' ? 'Questionnaire generation was repaired with fallback content.' : undefined)

  return {
    language:
      typeof parsedObject.language === 'string' && parsedObject.language.trim()
        ? parsedObject.language.trim().slice(0, 24)
        : fallback.language,
    focus: slugishString(parsedObject.focus, fallback.focus),
    questions: normalized.questions,
    ui: validateGeneratedUi(ui, parsedObject.ui),
    source,
    warning: finalWarning
  }
}

export function createFallbackBuildQuestionnaire(
  prompt: string,
  ui: BuildQuestionnaireCopy = BUILD_QUESTIONNAIRE_COPY,
  warning?: string
): BuildQuestionnaireGenerationResponse {
  const template = selectFallbackTemplate(prompt)
  return {
    language: detectPromptLanguage(prompt),
    focus: template.focus,
    questions: template.questions.map(cloneQuestion),
    ui,
    source: 'fallback',
    warning
  }
}

export function createBuildBrief({
  originalPrompt,
  language,
  focus,
  skipped,
  questions,
  answers
}: {
  originalPrompt: string
  language: string
  focus: string
  skipped: boolean
  questions: BuildQuestion[]
  answers: BuildQuestionAnswer[]
}): BuildBrief {
  const meaningfulAnswers = skipped
    ? []
    : answers.filter((answer) => answer.optionIds.length > 0 || !!answer.otherText?.trim())
  return {
    originalPrompt,
    language,
    focus,
    skipped,
    questions: questions.map(cloneQuestion),
    answers: meaningfulAnswers.map((answer) => ({
      questionId: answer.questionId,
      optionIds: [...answer.optionIds],
      otherText: answer.otherText?.trim() || undefined
    })),
    createdAt: Date.now()
  }
}

function normalizeGeneratedQuestions(
  generated: unknown,
  fallbackQuestions: BuildQuestion[]
): NormalizedQuestions {
  const questionIds = new Set<string>()
  const questions: BuildQuestion[] = []
  let usedFallback = false

  if (Array.isArray(generated)) {
    for (const candidate of generated) {
      if (questions.length >= QUESTION_COUNT) break
      const fallback = fallbackQuestions[questions.length]
      const normalized = normalizeGeneratedQuestion(candidate, fallback, questions.length + 1, questionIds)
      if (!normalized) {
        usedFallback = true
        continue
      }
      questions.push(normalized.question)
      usedFallback = usedFallback || normalized.usedFallback
    }
  } else {
    usedFallback = true
  }

  const acceptedCount = questions.length
  while (questions.length < QUESTION_COUNT) {
    const fallback = cloneQuestion(fallbackQuestions[questions.length] ?? fallbackQuestions[0])
    fallback.id = uniqueKebabId(fallback.id, `question-${questions.length + 1}`, questionIds)
    questions.push(fallback)
    usedFallback = true
  }

  return { questions, acceptedCount, usedFallback }
}

function normalizeGeneratedQuestion(
  candidate: unknown,
  fallback: BuildQuestion,
  index: number,
  questionIds: Set<string>
): { question: BuildQuestion; usedFallback: boolean } | null {
  if (!isObject(candidate)) return null

  let usedFallback = false
  const id = uniqueKebabId(candidate.id, fallback.id || `question-${index}`, questionIds)
  const kind =
    candidate.kind === 'multiple' || candidate.kind === 'single'
      ? candidate.kind
      : fallback.kind
  usedFallback = usedFallback || candidate.kind !== 'multiple' && candidate.kind !== 'single'

  const title = firstNonEmptyString(
    candidate.title,
    candidate.question,
    candidate.label,
    candidate.text
  )
  usedFallback = usedFallback || !title

  const normalizedOptions = normalizeGeneratedOptions(id, candidate.options, fallback.options)
  usedFallback = usedFallback || normalizedOptions.usedFallback

  return {
    question: {
      id,
      kind,
      title: title || fallback.title || `Question ${index}`,
      options: normalizedOptions.options,
      otherLabel: optionalString(candidate.otherLabel, fallback.otherLabel ?? 'Other'),
      otherPlaceholder: optionalString(
        candidate.otherPlaceholder,
        fallback.otherPlaceholder ?? 'Describe another direction'
      )
    },
    usedFallback
  }
}

function normalizeGeneratedOptions(
  questionId: string,
  generated: unknown,
  fallbackOptions: BuildQuestion['options']
): { options: BuildQuestion['options']; usedFallback: boolean } {
  const optionIds = new Set<string>()
  const options: BuildQuestion['options'] = []
  let usedFallback = false

  if (Array.isArray(generated)) {
    for (const candidate of generated) {
      if (options.length >= MAX_OPTIONS) break
      const label = typeof candidate === 'string'
        ? candidate.trim()
        : isObject(candidate)
          ? firstNonEmptyString(candidate.label, candidate.title, candidate.name, candidate.text)
          : ''
      if (!label) {
        usedFallback = true
        continue
      }

      const rawId = isObject(candidate) ? candidate.id : label
      options.push({
        id: uniqueKebabId(rawId, `${questionId}-option-${options.length + 1}`, optionIds),
        label,
        description: isObject(candidate) ? optionalString(candidate.description) : undefined
      })
    }
  } else {
    usedFallback = true
  }

  const fallbackTarget = Math.min(MAX_OPTIONS, Math.max(MIN_OPTIONS, fallbackOptions.length))
  for (const fallback of fallbackOptions) {
    if (options.length >= fallbackTarget) break
    const duplicateLabel = options.some((option) => option.label === fallback.label)
    if (duplicateLabel) continue

    options.push({
      ...fallback,
      id: uniqueKebabId(fallback.id, `${questionId}-option-${options.length + 1}`, optionIds)
    })
    usedFallback = true
  }

  while (options.length < MIN_OPTIONS) {
    options.push({
      id: uniqueKebabId(`option-${options.length + 1}`, `${questionId}-option-${options.length + 1}`, optionIds),
      label: `Option ${options.length + 1}`
    })
    usedFallback = true
  }

  return { options, usedFallback }
}

function validateGeneratedUi(
  source: BuildQuestionnaireCopy,
  generated: unknown
): BuildQuestionnaireCopy {
  if (!isObject(generated)) return source
  return {
    title: nonEmptyString(generated.title, source.title),
    selectOne: nonEmptyString(generated.selectOne, source.selectOne),
    selectMultiple: nonEmptyString(generated.selectMultiple, source.selectMultiple),
    otherLabel: nonEmptyString(generated.otherLabel, source.otherLabel),
    otherPlaceholder: nonEmptyString(generated.otherPlaceholder, source.otherPlaceholder),
    previous: nonEmptyString(generated.previous, source.previous),
    next: nonEmptyString(generated.next, source.next),
    skipAll: nonEmptyString(generated.skipAll, source.skipAll),
    submit: nonEmptyString(generated.submit, source.submit),
    preparing: nonEmptyString(generated.preparing, source.preparing),
    errorNotice: nonEmptyString(generated.errorNotice, source.errorNotice)
  }
}

function questionGenerationJsonCandidates(text: string): string[] {
  const candidates = [
    text,
    ...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1].trim())
  ]

  const objectCandidate = extractJsonSpan(text, '{', '}')
  if (objectCandidate) candidates.push(objectCandidate)

  const arrayCandidate = extractJsonSpan(text, '[', ']')
  if (arrayCandidate) candidates.push(arrayCandidate)

  return Array.from(new Set(candidates.filter(Boolean)))
}

function extractJsonSpan(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1).trim()
}

function selectFallbackTemplate(prompt: string): FallbackQuestionnaireTemplate {
  const normalized = prompt.toLowerCase()
  return (
    FALLBACK_TEMPLATES.find((template) => template.matches.test(normalized)) ??
    FALLBACK_TEMPLATES.find((template) => template.category === 'generic')!
  )
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function optionalString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

function uniqueKebabId(value: unknown, fallback: string, usedIds: Set<string>): string {
  const base = kebabId(value, fallback)
  let next = base
  let suffix = 2
  while (usedIds.has(next)) {
    next = `${base}-${suffix}`
    suffix += 1
  }
  usedIds.add(next)
  return next
}

function kebabId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function slugishString(value: unknown, fallback: string): string {
  return kebabId(value, fallback).slice(0, 80) || fallback
}

function cloneQuestion(question: BuildQuestion): BuildQuestion {
  return {
    ...question,
    options: question.options.map((option) => ({ ...option }))
  }
}

const FALLBACK_TEMPLATES: FallbackQuestionnaireTemplate[] = [
  {
    category: 'game',
    focus: 'game-build-questionnaire',
    matches: /\b(game|playable|arcade|puzzle|platformer|rpg|shooter|spel)\b/,
    questions: [
      {
        id: 'gameplay-loop',
        kind: 'single',
        title: 'What should the core gameplay feel like?',
        options: [
          { id: 'quick-arcade', label: 'Quick arcade rounds', description: 'Fast sessions with simple scoring and replayability.' },
          { id: 'puzzle-solving', label: 'Puzzle solving', description: 'Focused challenges that reward planning and logic.' },
          { id: 'exploration', label: 'Exploration', description: 'A small world or scene with discovery and progression.' },
          { id: 'strategy', label: 'Strategy', description: 'Meaningful choices, tradeoffs, and clear win conditions.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the gameplay style'
      },
      {
        id: 'visual-style',
        kind: 'single',
        title: 'Which visual style should guide the game?',
        options: [
          { id: 'clean-modern', label: 'Clean modern', description: 'Crisp UI, readable contrast, and polished motion.' },
          { id: 'retro-pixel', label: 'Retro pixel', description: 'Blocky assets, limited palette, and arcade energy.' },
          { id: 'moody-cinematic', label: 'Moody cinematic', description: 'Dramatic lighting, depth, and atmosphere.' },
          { id: 'playful-colorful', label: 'Playful colorful', description: 'Bright shapes, friendly feedback, and lively animation.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe another style'
      },
      {
        id: 'player-controls',
        kind: 'multiple',
        title: 'Which controls should be supported?',
        options: [
          { id: 'keyboard', label: 'Keyboard', description: 'Arrow/WASD controls for desktop play.' },
          { id: 'mouse', label: 'Mouse', description: 'Pointer actions, aiming, dragging, or menu control.' },
          { id: 'touch', label: 'Touch', description: 'Mobile-friendly taps, swipes, and large hit targets.' },
          { id: 'buttons', label: 'On-screen buttons', description: 'Visible controls for clear interaction.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe control needs'
      },
      {
        id: 'progression',
        kind: 'single',
        title: 'How should progress work?',
        options: [
          { id: 'single-level', label: 'Single polished level', description: 'One complete, tuned experience.' },
          { id: 'increasing-difficulty', label: 'Increasing difficulty', description: 'The challenge ramps as the player improves.' },
          { id: 'score-chasing', label: 'Score chasing', description: 'A high-score loop drives replayability.' },
          { id: 'unlockables', label: 'Unlockables', description: 'New abilities, areas, or rewards appear over time.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe progression'
      },
      {
        id: 'game-feedback',
        kind: 'multiple',
        title: 'What feedback should make actions feel good?',
        options: [
          { id: 'animation', label: 'Animation', description: 'Responsive movement and state transitions.' },
          { id: 'particles', label: 'Particles', description: 'Small bursts, trails, or impact effects.' },
          { id: 'sound-ready', label: 'Sound-ready hooks', description: 'Structure for adding audio cues later.' },
          { id: 'clear-end-state', label: 'Clear end state', description: 'Win, lose, pause, and restart states are obvious.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe feedback details'
      }
    ]
  },
  {
    category: 'website',
    focus: 'website-page-questionnaire',
    matches: /\b(website|site|page|landing|homepage|portfolio|hemsida|sida)\b/,
    questions: [
      {
        id: 'page-goal',
        kind: 'single',
        title: 'What should the page accomplish first?',
        options: [
          { id: 'explain-offer', label: 'Explain the offer', description: 'Make the product, service, or idea clear fast.' },
          { id: 'drive-signups', label: 'Drive sign-ups', description: 'Guide visitors toward a primary conversion.' },
          { id: 'showcase-work', label: 'Showcase work', description: 'Highlight examples, proof, or portfolio pieces.' },
          { id: 'build-trust', label: 'Build trust', description: 'Emphasize credibility, outcomes, and social proof.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the main page goal'
      },
      {
        id: 'audience',
        kind: 'single',
        title: 'Who is the main audience?',
        options: [
          { id: 'consumers', label: 'Consumers', description: 'A broad public audience with quick scanning needs.' },
          { id: 'business-buyers', label: 'Business buyers', description: 'Decision makers comparing value, proof, and risk.' },
          { id: 'creators', label: 'Creators', description: 'Designers, builders, artists, or technical users.' },
          { id: 'local-visitors', label: 'Local visitors', description: 'People looking for a place, service, or event.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the audience'
      },
      {
        id: 'visual-direction',
        kind: 'single',
        title: 'Which visual direction fits best?',
        options: [
          { id: 'quiet-premium', label: 'Quiet premium', description: 'Refined type, restrained color, and confident spacing.' },
          { id: 'bold-editorial', label: 'Bold editorial', description: 'Large imagery, strong hierarchy, and memorable layouts.' },
          { id: 'friendly-bright', label: 'Friendly bright', description: 'Warm color, approachable copy, and clear sections.' },
          { id: 'technical-precise', label: 'Technical precise', description: 'Dense information, sharp grids, and functional polish.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe another direction'
      },
      {
        id: 'page-sections',
        kind: 'multiple',
        title: 'Which sections should be included?',
        options: [
          { id: 'hero', label: 'Hero', description: 'Immediate positioning and primary action.' },
          { id: 'features', label: 'Features', description: 'Key benefits or capabilities.' },
          { id: 'proof', label: 'Proof', description: 'Testimonials, metrics, logos, or examples.' },
          { id: 'pricing-or-contact', label: 'Pricing/contact', description: 'A concrete next step for interested visitors.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'List other sections'
      },
      {
        id: 'primary-action',
        kind: 'single',
        title: 'What should the primary action be?',
        options: [
          { id: 'get-started', label: 'Get started', description: 'A direct conversion-focused CTA.' },
          { id: 'book-call', label: 'Book a call', description: 'A consultative or sales-led next step.' },
          { id: 'view-work', label: 'View work', description: 'Lead users into examples or a gallery.' },
          { id: 'learn-more', label: 'Learn more', description: 'Let visitors explore before committing.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the CTA'
      }
    ]
  },
  {
    category: 'app',
    focus: 'app-tool-dashboard-questionnaire',
    matches: /\b(app|tool|dashboard|crm|saas|editor|planner|tracker|component|verktyg)\b/,
    questions: [
      {
        id: 'core-workflow',
        kind: 'single',
        title: 'What is the primary workflow?',
        options: [
          { id: 'create-manage', label: 'Create and manage', description: 'Users add, edit, organize, and review items.' },
          { id: 'monitor-status', label: 'Monitor status', description: 'Users scan metrics, progress, and exceptions.' },
          { id: 'compare-decide', label: 'Compare and decide', description: 'Users evaluate options and take action.' },
          { id: 'compose-publish', label: 'Compose and publish', description: 'Users draft, preview, and ship content.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the workflow'
      },
      {
        id: 'information-density',
        kind: 'single',
        title: 'How dense should the interface be?',
        options: [
          { id: 'compact', label: 'Compact', description: 'Prioritize scanning and repeated use.' },
          { id: 'balanced', label: 'Balanced', description: 'Mix clarity, whitespace, and useful detail.' },
          { id: 'guided', label: 'Guided', description: 'A calmer step-by-step flow for new users.' },
          { id: 'presentation', label: 'Presentation-like', description: 'More visual, spacious, and demo-friendly.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe density needs'
      },
      {
        id: 'main-views',
        kind: 'multiple',
        title: 'Which views should exist?',
        options: [
          { id: 'overview', label: 'Overview', description: 'A dashboard or summary screen.' },
          { id: 'detail', label: 'Detail view', description: 'Focused editing or inspection for one item.' },
          { id: 'list-table', label: 'List/table', description: 'Structured rows for sorting and scanning.' },
          { id: 'settings', label: 'Settings', description: 'Controls for preferences and configuration.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'List other views'
      },
      {
        id: 'interaction-style',
        kind: 'multiple',
        title: 'Which interactions matter most?',
        options: [
          { id: 'filters-search', label: 'Filters/search', description: 'Find and narrow information quickly.' },
          { id: 'inline-editing', label: 'Inline editing', description: 'Change data without leaving context.' },
          { id: 'drag-drop', label: 'Drag and drop', description: 'Reorder, move, or arrange items directly.' },
          { id: 'charts', label: 'Charts', description: 'Show patterns, totals, or progress visually.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe interactions'
      },
      {
        id: 'app-tone',
        kind: 'single',
        title: 'What tone should the product have?',
        options: [
          { id: 'professional', label: 'Professional', description: 'Quiet, precise, and work-focused.' },
          { id: 'creative', label: 'Creative', description: 'Expressive, visual, and flexible.' },
          { id: 'friendly', label: 'Friendly', description: 'Approachable copy and soft visual cues.' },
          { id: 'technical', label: 'Technical', description: 'Clear structure, exact labels, and dense controls.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the tone'
      }
    ]
  },
  {
    category: 'generic',
    focus: 'custom-build-questionnaire',
    matches: /.*/,
    questions: [
      {
        id: 'build-purpose',
        kind: 'single',
        title: 'What should this build optimize for?',
        options: [
          { id: 'clarity', label: 'Clarity', description: 'Make the idea easy to understand and use.' },
          { id: 'visual-impact', label: 'Visual impact', description: 'Prioritize a memorable first impression.' },
          { id: 'workflow-speed', label: 'Workflow speed', description: 'Make repeated tasks fast and efficient.' },
          { id: 'exploration', label: 'Exploration', description: 'Let users browse, discover, or experiment.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the purpose'
      },
      {
        id: 'target-user',
        kind: 'single',
        title: 'Who should it feel designed for?',
        options: [
          { id: 'general-users', label: 'General users', description: 'Simple language and obvious controls.' },
          { id: 'professionals', label: 'Professionals', description: 'Efficient, credible, and detail-aware.' },
          { id: 'enthusiasts', label: 'Enthusiasts', description: 'Richer detail and personality.' },
          { id: 'internal-team', label: 'Internal team', description: 'Practical layout for known workflows.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe the user'
      },
      {
        id: 'visual-tone',
        kind: 'single',
        title: 'Which visual tone should lead?',
        options: [
          { id: 'minimal', label: 'Minimal', description: 'Simple structure, restrained color, and clean type.' },
          { id: 'premium', label: 'Premium', description: 'Polished spacing, refined contrast, and confident copy.' },
          { id: 'playful', label: 'Playful', description: 'Livelier color, motion, and friendly states.' },
          { id: 'utilitarian', label: 'Utilitarian', description: 'Focused, dense, and optimized for getting work done.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe another tone'
      },
      {
        id: 'must-have-elements',
        kind: 'multiple',
        title: 'What should definitely be included?',
        options: [
          { id: 'primary-action', label: 'Primary action', description: 'A clear next step or command.' },
          { id: 'sample-content', label: 'Sample content', description: 'Real-feeling data, copy, or examples.' },
          { id: 'responsive-layout', label: 'Responsive layout', description: 'Good behavior on desktop and mobile.' },
          { id: 'polished-states', label: 'Polished states', description: 'Hover, empty, loading, or completion states.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'List required elements'
      },
      {
        id: 'complexity-level',
        kind: 'single',
        title: 'How complete should the first version feel?',
        options: [
          { id: 'focused-demo', label: 'Focused demo', description: 'One polished path that proves the concept.' },
          { id: 'feature-complete', label: 'Feature complete', description: 'Several expected controls and states.' },
          { id: 'visual-prototype', label: 'Visual prototype', description: 'Prioritize look and feel over deep behavior.' },
          { id: 'working-tool', label: 'Working tool', description: 'Prioritize functional interactions and data flow.' }
        ],
        otherLabel: 'Other',
        otherPlaceholder: 'Describe completeness'
      }
    ]
  }
]
