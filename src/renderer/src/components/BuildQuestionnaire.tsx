import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  BuildQuestion,
  BuildQuestionAnswer,
  BuildQuestionnaireCopy
} from '@shared/types'

interface Props {
  questions: BuildQuestion[]
  ui: BuildQuestionnaireCopy
  loading: boolean
  error?: string
  onSubmit: (answers: BuildQuestionAnswer[]) => void
  onSkip: () => void
}

interface DraftAnswer {
  optionIds: string[]
  otherText: string
  otherActive: boolean
}

export default function BuildQuestionnaire({
  questions,
  ui,
  loading,
  error,
  onSubmit,
  onSkip
}: Props) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({})
  const dialogRef = useRef<HTMLDivElement>(null)
  const current = questions[index]

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    setIndex(0)
    setAnswers({})
  }, [questions])

  const draft = current ? answers[current.id] ?? emptyAnswer() : emptyAnswer()
  const isLast = index === questions.length - 1

  const completedAnswers = useMemo<BuildQuestionAnswer[]>(() => {
    return questions.map((question) => {
      const answer = answers[question.id] ?? emptyAnswer()
      return {
        questionId: question.id,
        optionIds: answer.optionIds,
        otherText: answer.otherText.trim() || undefined
      }
    })
  }, [answers, questions])

  function updateAnswer(question: BuildQuestion, next: DraftAnswer): void {
    setAnswers((prev) => ({ ...prev, [question.id]: next }))
  }

  function toggleOption(question: BuildQuestion, optionId: string): void {
    const currentAnswer = answers[question.id] ?? emptyAnswer()
    if (question.kind === 'single') {
      updateAnswer(question, {
        ...currentAnswer,
        optionIds: [optionId],
        otherText: '',
        otherActive: false
      })
      return
    }
    const exists = currentAnswer.optionIds.includes(optionId)
    updateAnswer(question, {
      ...currentAnswer,
      optionIds: exists
        ? currentAnswer.optionIds.filter((id) => id !== optionId)
        : [...currentAnswer.optionIds, optionId],
      otherActive: currentAnswer.otherActive
    })
  }

  function updateOther(question: BuildQuestion, value: string): void {
    const currentAnswer = answers[question.id] ?? emptyAnswer()
    updateAnswer(question, {
      ...currentAnswer,
      optionIds: question.kind === 'single' ? [] : currentAnswer.optionIds,
      otherText: value,
      otherActive: true
    })
  }

  function goNext(): void {
    if (loading || !current) return
    if (isLast) {
      onSubmit(completedAnswers)
      return
    }
    setIndex((i) => Math.min(i + 1, questions.length - 1))
  }

  function goPrevious(): void {
    if (loading) return
    setIndex((i) => Math.max(i - 1, 0))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement
    const isEditingText =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    if (isEditingText) return

    if (e.key === 'Tab') {
      trapFocus(e)
      return
    }

    if (e.key === 'ArrowRight' && !loading) {
      e.preventDefault()
      goNext()
    } else if (e.key === 'ArrowLeft' && !loading) {
      e.preventDefault()
      goPrevious()
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay/70 px-5 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="build-questionnaire-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="anim-fade-scale flex max-h-[82vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-2xl shadow-shadow/35 outline-none"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-line bg-panel px-5">
          <h2 id="build-questionnaire-title" className="text-[16px] font-medium">
            {ui.title}
          </h2>
          <div className="flex-1" />
          {!loading && questions.length > 0 && (
            <div className="text-[11px] tabular-nums text-faint">
              {index + 1} / {questions.length}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-action" />
            <div className="text-[14px] font-medium text-fg">{ui.preparing}</div>
          </div>
        ) : error || !current ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/50 bg-warning/10 text-warning">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M8 4.5v4" strokeLinecap="round" />
                <path d="M8 11.5h.01" strokeLinecap="round" />
                <path d="M7 2.8 2.4 11a1.4 1.4 0 0 0 1.2 2.1h8.8a1.4 1.4 0 0 0 1.2-2.1L9 2.8a1.2 1.2 0 0 0-2 0Z" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="max-w-sm text-[13px] leading-relaxed text-muted">
              {error ?? ui.errorNotice}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="text-[14px] font-semibold leading-snug text-fg">
                {current.title}
              </div>
              <div className="shrink-0 pt-0.5 text-[11px] text-muted">
                {current.kind === 'single' ? ui.selectOne : ui.selectMultiple}
              </div>
            </div>

            <div className="space-y-1.5">
              {current.options.map((option) => {
                const checked = draft.optionIds.includes(option.id)
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 transition ${
                      checked ? 'bg-control-hover' : 'hover:bg-control'
                    }`}
                  >
                    <input
                      type={current.kind === 'single' ? 'radio' : 'checkbox'}
                      name={current.id}
                      checked={checked}
                      onChange={() => toggleOption(current, option.id)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-action"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold leading-snug text-fg">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}

              <label
                className={`flex cursor-text gap-3 rounded-lg px-3 py-2.5 transition ${
                  draft.otherActive ? 'bg-control-hover' : 'hover:bg-control'
                }`}
              >
                <input
                  type={current.kind === 'single' ? 'radio' : 'checkbox'}
                  name={current.id}
                  checked={draft.otherActive}
                  onChange={() =>
                    updateAnswer(current, {
                      ...draft,
                      optionIds: current.kind === 'single' ? [] : draft.optionIds,
                      otherText: draft.otherActive ? '' : draft.otherText,
                      otherActive: !draft.otherActive
                    })
                  }
                  className="mt-3 h-3.5 w-3.5 shrink-0 accent-action"
                />
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{current.otherLabel ?? ui.otherLabel}</span>
                  <input
                    value={draft.otherText}
                    onFocus={() =>
                      updateAnswer(current, {
                        ...draft,
                        optionIds: current.kind === 'single' ? [] : draft.optionIds,
                        otherActive: true
                      })
                    }
                    onChange={(e) => updateOther(current, e.target.value)}
                    placeholder={current.otherLabel ?? ui.otherLabel}
                    className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-muted focus:border-action"
                  />
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex h-12 shrink-0 items-center gap-2 border-t border-line bg-panel px-5">
          <button
            type="button"
            onClick={goPrevious}
            disabled={loading || index === 0}
            title={ui.previous}
            aria-label={ui.previous}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-control-hover hover:text-fg disabled:opacity-30"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={loading || !!error || !current}
            title={isLast ? ui.submit : ui.next}
            aria-label={isLast ? ui.submit : ui.next}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-control-hover hover:text-fg disabled:opacity-30"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted transition hover:bg-control-hover hover:text-fg"
          >
            {ui.skipAll}
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={loading || !!error || !current}
            className="rounded-md bg-action px-3 py-1.5 text-[12px] font-medium text-action-fg transition hover:bg-[rgb(var(--color-primary-active))] disabled:opacity-50"
          >
            {isLast ? ui.submit : ui.next}
          </button>
        </div>
      </div>
    </div>
  )
}

function emptyAnswer(): DraftAnswer {
  return { optionIds: [], otherText: '', otherActive: false }
}

function trapFocus(e: React.KeyboardEvent<HTMLDivElement>): void {
  const root = e.currentTarget
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null || el === document.activeElement)

  if (focusable.length === 0) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}
