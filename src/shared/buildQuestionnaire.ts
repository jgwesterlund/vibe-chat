import type {
  BuildBrief,
  BuildQuestion,
  BuildQuestionAnswer,
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
  preparing: 'Preparing questions...',
  errorNotice: 'Questions could not be generated. You can skip and build from the original prompt.'
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

function cloneQuestion(question: BuildQuestion): BuildQuestion {
  return {
    ...question,
    options: question.options.map((option) => ({ ...option }))
  }
}
