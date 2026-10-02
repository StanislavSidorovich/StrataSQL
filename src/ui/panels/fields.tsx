import type { ReactNode } from 'react'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className = '',
  ariaLabel,
}: {
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <input
      className={`input ${className}`}
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function TextArea({ value, onChange, placeholder }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea className="input min-h-14 resize-y" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  )
}

export function NumberInput({
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <input
      className={`input ${className}`}
      inputMode="numeric"
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => {
        const t = e.target.value.trim()
        if (t === '') return onChange(undefined)
        const n = Number.parseInt(t, 10)
        if (Number.isFinite(n) && n >= 0) onChange(n)
      }}
    />
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: T
  options: readonly { value: T; label: string; group?: string }[]
  onChange: (v: T) => void
  ariaLabel?: string
  className?: string
}) {
  const groups = [...new Set(options.map((o) => o.group))]
  const render = (opts: typeof options) => opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
  return (
    <select className={`input ${className}`} value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as T)}>
      {groups.map((g) =>
        g ? (
          <optgroup key={g} label={g}>
            {render(options.filter((o) => o.group === g))}
          </optgroup>
        ) : (
          render(options.filter((o) => !o.group))
        ),
      )}
    </select>
  )
}

export function Check({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; title?: string }) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label && <span>{label}</span>}
    </label>
  )
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel-section">
      <header className="panel-section-header">
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function IconButton({
  onClick,
  title,
  children,
  danger,
  disabled,
}: {
  onClick: () => void
  title: string
  children: ReactNode
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button type="button" className={`icon-btn ${danger ? 'danger' : ''}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
