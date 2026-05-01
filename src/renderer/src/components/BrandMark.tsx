interface Props {
  className?: string
}

export default function BrandMark({ className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-[rgb(var(--color-primary))] text-white ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none">
        <path
          d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      </svg>
    </span>
  )
}
