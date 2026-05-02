import type {
  BuildBrief,
  BuildQuestion,
  BuildQuestionAnswer,
  BuildQuestionCategory,
  BuildQuestionnaireCopy
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
  translating: 'Preparing questions...',
  fallbackNotice: 'Showing default English questions because translation was unavailable.'
}

const OTHER_PLACEHOLDER = 'Describe another direction'

const LANDING_QUESTIONS: BuildQuestion[] = [
  {
    id: 'business-type',
    kind: 'single',
    title: 'What does your company or project do?',
    options: [
      { id: 'saas', label: 'SaaS / Tech product', description: 'Software, app, or digital tool' },
      { id: 'services', label: 'Agency / Services', description: 'Consulting, design, marketing, etc.' },
      { id: 'commerce', label: 'Physical product / E-commerce', description: 'Sell goods online' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'visual-style',
    kind: 'single',
    title: 'What visual style fits your brand?',
    options: [
      { id: 'minimal-light', label: 'Modern minimal (light)', description: 'Clean, lots of whitespace, subtle accents' },
      { id: 'bold-dark', label: 'Bold dark mode', description: 'Dark background, vibrant accent color' },
      { id: 'playful-colorful', label: 'Playful & colorful', description: 'Gradients, rounded shapes, friendly' },
      { id: 'corporate', label: 'Corporate professional', description: 'Trustworthy, blue tones, structured' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'page-sections',
    kind: 'multiple',
    title: 'Which sections do you want on the page?',
    options: [
      { id: 'hero-features-cta', label: 'Hero + Features + CTA', description: 'Classic minimal landing' },
      { id: 'testimonials-logos', label: 'Add Testimonials & Logos', description: 'Social proof block' },
      { id: 'pricing', label: 'Add Pricing', description: 'Plans or tiers section' },
      { id: 'faq-contact', label: 'Add FAQ + Contact form', description: 'Support and lead capture' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'primary-cta',
    kind: 'single',
    title: 'Primary call-to-action goal?',
    options: [
      { id: 'signup', label: 'Sign up / Get started', description: 'Drive product signups' },
      { id: 'demo', label: 'Book a demo / call', description: 'Lead generation' },
      { id: 'waitlist', label: 'Join waitlist', description: 'Pre-launch email capture' },
      { id: 'contact', label: 'Contact us', description: 'General inquiries' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'audience',
    kind: 'single',
    title: 'Who should the page speak to first?',
    options: [
      { id: 'founders', label: 'Founders / Small teams', description: 'Fast-moving buyers with limited time' },
      { id: 'enterprise', label: 'Enterprise teams', description: 'Security, trust, and scale matter' },
      { id: 'creators', label: 'Creators / Consumers', description: 'Emotion, clarity, and personality matter' },
      { id: 'developers', label: 'Developers', description: 'Technical proof and speed matter' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  }
]

const APP_QUESTIONS: BuildQuestion[] = [
  {
    id: 'app-purpose',
    kind: 'single',
    title: 'What should the app help users do?',
    options: [
      { id: 'create-edit', label: 'Create or edit something', description: 'Builder, editor, writing, design, media' },
      { id: 'track-manage', label: 'Track or manage work', description: 'Tasks, projects, data, operations' },
      { id: 'learn-decide', label: 'Learn or make decisions', description: 'Research, analysis, comparisons' },
      { id: 'communicate', label: 'Communicate or collaborate', description: 'Messages, feedback, team workflow' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'interface-density',
    kind: 'single',
    title: 'How dense should the interface feel?',
    options: [
      { id: 'focused', label: 'Focused and minimal', description: 'One primary workflow, calm screens' },
      { id: 'balanced', label: 'Balanced workspace', description: 'Useful controls without feeling crowded' },
      { id: 'data-dense', label: 'Data-dense dashboard', description: 'Tables, filters, metrics, scanning' },
      { id: 'immersive', label: 'Immersive full-screen tool', description: 'Canvas-first, fewer visible panels' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'visual-style',
    kind: 'single',
    title: 'What visual direction should it have?',
    options: [
      { id: 'quiet-pro', label: 'Quiet professional', description: 'Neutral, precise, productivity-focused' },
      { id: 'editorial', label: 'Editorial and refined', description: 'Strong typography, premium spacing' },
      { id: 'playful', label: 'Playful and friendly', description: 'Warm color, soft motion, approachable' },
      { id: 'technical-dark', label: 'Technical dark', description: 'Command-center feel with crisp contrast' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'core-controls',
    kind: 'multiple',
    title: 'Which controls are important?',
    options: [
      { id: 'sidebar', label: 'Sidebar navigation', description: 'Persistent sections or projects' },
      { id: 'filters-search', label: 'Search and filters', description: 'Find and narrow content quickly' },
      { id: 'settings', label: 'Settings / preferences', description: 'Modes, toggles, customization' },
      { id: 'empty-states', label: 'Polished empty states', description: 'Helpful first-run experience' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'interaction-feel',
    kind: 'single',
    title: 'How should interactions feel?',
    options: [
      { id: 'fast-native', label: 'Fast and native', description: 'Instant feedback, subtle transitions' },
      { id: 'guided', label: 'Guided step-by-step', description: 'Clear sequence and validation' },
      { id: 'expressive', label: 'Expressive and animated', description: 'Delightful motion and visual feedback' },
      { id: 'keyboard-first', label: 'Keyboard-first', description: 'Efficient shortcuts and compact controls' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  }
]

const GAME_QUESTIONS: BuildQuestion[] = [
  {
    id: 'game-format',
    kind: 'single',
    title: 'What kind of game feel do you want?',
    options: [
      { id: 'arcade', label: 'Arcade', description: 'Fast, score-driven, quick restarts' },
      { id: 'puzzle', label: 'Puzzle', description: 'Thoughtful levels and clear rules' },
      { id: 'cozy', label: 'Cozy / relaxed', description: 'Low pressure, charming feedback' },
      { id: 'competitive', label: 'Competitive', description: 'Timers, ranks, high stakes' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'art-direction',
    kind: 'single',
    title: 'What art direction should it use?',
    options: [
      { id: 'pixel', label: 'Pixel retro', description: 'Chunky shapes, nostalgic palette' },
      { id: 'neon', label: 'Neon vector', description: 'Bright lines, dark field, glow accents' },
      { id: 'paper', label: 'Paper / handmade', description: 'Tactile cards, cutout shapes' },
      { id: 'minimal', label: 'Clean minimal', description: 'Simple geometry and crisp motion' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'controls',
    kind: 'multiple',
    title: 'Which controls should work?',
    options: [
      { id: 'keyboard', label: 'Keyboard', description: 'Arrow keys, WASD, space' },
      { id: 'mouse', label: 'Mouse / pointer', description: 'Click, drag, aim, select' },
      { id: 'touch', label: 'Touch-friendly', description: 'Large targets for mobile' },
      { id: 'onscreen', label: 'On-screen buttons', description: 'Visible controls and actions' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'game-loop',
    kind: 'single',
    title: 'What should the main loop emphasize?',
    options: [
      { id: 'score', label: 'Score chasing', description: 'High score and replayability' },
      { id: 'levels', label: 'Levels / progression', description: 'Clear stages and unlocks' },
      { id: 'survival', label: 'Survival', description: 'Difficulty ramps until failure' },
      { id: 'sandbox', label: 'Sandbox play', description: 'Experimentation over winning' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  },
  {
    id: 'feedback',
    kind: 'multiple',
    title: 'What feedback should be included?',
    options: [
      { id: 'sound-ready', label: 'Sound-ready hooks', description: 'Buttons and events prepared for audio' },
      { id: 'particles', label: 'Particles / hit effects', description: 'Visual impact for key moments' },
      { id: 'scoreboard', label: 'Scoreboard / stats', description: 'Score, time, lives, level' },
      { id: 'tutorial', label: 'Quick tutorial', description: 'First-screen controls and goal' }
    ],
    otherLabel: 'Other',
    otherPlaceholder: OTHER_PLACEHOLDER
  }
]

export const BUILD_QUESTION_TEMPLATES: Record<BuildQuestionCategory, BuildQuestion[]> = {
  landing: LANDING_QUESTIONS,
  app: APP_QUESTIONS,
  game: GAME_QUESTIONS
}

export function getBuildQuestionTemplate(category: BuildQuestionCategory): BuildQuestion[] {
  return BUILD_QUESTION_TEMPLATES[category].map(cloneQuestion)
}

export function detectBuildQuestionCategory(prompt: string): BuildQuestionCategory {
  const normalized = prompt.toLowerCase()
  if (/\b(game|snake|pong|tetris|quiz|arcade|puzzle|spel|quiz|lek)\b/.test(normalized)) {
    return 'game'
  }
  if (/\b(landing|website|site|homepage|marketing|waitlist|pricing|hero|cta|sida|hemsida|landningssida)\b/.test(normalized)) {
    return 'landing'
  }
  return 'app'
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

export function createBuildBrief({
  originalPrompt,
  language,
  category,
  skipped,
  questions,
  answers
}: {
  originalPrompt: string
  language: string
  category: BuildQuestionCategory
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
    category,
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

function cloneQuestion(question: BuildQuestion): BuildQuestion {
  return {
    ...question,
    options: question.options.map((option) => ({ ...option }))
  }
}
