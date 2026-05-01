import BrandMark from './BrandMark'

interface Conversation {
  id: string
  title: string
  createdAt: number
}

interface Props {
  conversations: Conversation[]
  activeId: string
  providerLabel: 'Local' | 'Ollama' | 'AI Provider'
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export default function Sidebar({
  conversations,
  activeId,
  providerLabel,
  onSelect,
  onNew,
  onDelete
}: Props) {
  return (
    <div className="drag flex h-full w-64 shrink-0 flex-col border-r border-white/10 bg-sidebar text-[rgb(var(--color-on-dark))]">
      <div className="h-9 shrink-0" />
      <div className="no-drag px-3 pb-4">
        <div className="mb-4 flex items-center gap-2 px-1">
          <BrandMark className="h-7 w-7" />
          <div>
            <div className="text-[13px] font-semibold leading-none tracking-tight">Vibe Code</div>
            <div className="mt-1 text-[10.5px] text-[rgb(var(--color-on-dark-soft))]">
              local workspace
            </div>
          </div>
        </div>
        <button
          onClick={onNew}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-action px-3 text-[13px] font-medium text-action-fg transition hover:bg-[rgb(var(--color-primary-active))]"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
          New chat
        </button>
      </div>
      <div className="no-drag min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {conversations.map((c) => (
          <div key={c.id} className="group relative mb-1">
            <button
              onClick={() => onSelect(c.id)}
              className={`w-full truncate rounded-lg border px-3 py-2 text-left text-[13px] transition-all duration-200 ease-out ${
                activeId === c.id
                  ? 'border-white/10 bg-white/10 text-[rgb(var(--color-on-dark))]'
                  : 'border-transparent text-[rgb(var(--color-on-dark-soft))] hover:bg-white/[0.06] hover:text-[rgb(var(--color-on-dark))]'
              }`}
            >
              {c.title}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('Delete this chat?')) onDelete(c.id)
              }}
              className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white group-hover:flex"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
                <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="no-drag border-t border-white/10 p-3 text-[11px] text-[rgb(var(--color-on-dark-soft))]">
        <div className="flex items-center">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-green" />
            {providerLabel === 'Local'
              ? 'Running locally'
              : providerLabel === 'Ollama'
                ? 'Ollama local'
                : 'AI provider'}
          </div>
        </div>
      </div>
    </div>
  )
}
