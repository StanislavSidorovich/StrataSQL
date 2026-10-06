import { useEffect, useState, type ReactNode } from 'react'
import { parseSize } from '../../core/metamodel'
import { hasLinks, splitLinks } from '../../core/links'
import { useEditor } from '../store'

/** `?` that opens a help card. */
export function HelpButton({ card, title }: { card: string; title?: string }) {
  const openHelp = useEditor((s) => s.openHelp)
  return (
    <button
      type="button"
      className="help-btn"
      title={title ?? 'Explain this'}
      aria-label={`Help: ${title ?? card}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openHelp(card)
      }}
    >
      ?
    </button>
  )
}

export function Field({ label, children, hint, help }: { label: string; children: ReactNode; hint?: ReactNode; help?: string }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {help && <HelpButton card={help} title={`What is “${label.toLowerCase()}”?`} />}
      </span>
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

/**
 * A name field where a default name (`attribute`, `Entity_2`) is only a grey hint: click and type,
 * there is nothing to delete first. Clearing the field gives the element its default name back.
 */
export function NameInput({
  value,
  isDefault,
  fallback,
  onChange,
  ariaLabel,
  autoFocus,
  list,
}: {
  value: string
  isDefault: (name: string) => boolean
  /** The name to keep when the field is cleared. */
  fallback: string
  onChange: (v: string) => void
  ariaLabel?: string
  autoFocus?: boolean
  /** Id of a datalist with suggestions (words of the task text). */
  list?: string
}) {
  // While the user is typing, show exactly what they typed (even if it looks like a default name).
  const [typing, setTyping] = useState(false)
  const hint = !typing && isDefault(value)
  return (
    <input
      className="input"
      value={hint ? '' : value}
      placeholder={hint ? value : undefined}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      list={list}
      autoComplete="off"
      onChange={(e) => {
        setTyping(true)
        onChange(e.target.value.trim() === '' ? fallback : e.target.value)
      }}
      onBlur={() => setTyping(false)}
    />
  )
}

/**
 * A comment field. Text with web addresses is shown with clickable links (opening in a new tab, so
 * the model stays here); a click outside a link, or Enter, turns it back into the editable field.
 */
export function TextArea({ value, onChange, placeholder, rows }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const [editing, setEditing] = useState(false)
  if (!editing && hasLinks(value)) {
    return (
      <div
        className="input text-view"
        role="button"
        tabIndex={0}
        title="Click to edit"
        style={rows ? { minHeight: `calc(${rows} * 1.5em + 8px)` } : undefined}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a')) setEditing(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) {
            e.preventDefault()
            setEditing(true)
          }
        }}
      >
        {splitLinks(value!).map((p, i) =>
          'url' in p ? (
            <a key={i} href={p.url} target="_blank" rel="noopener">
              {p.text}
            </a>
          ) : (
            p.text
          ),
        )}
      </div>
    )
  }
  return (
    <textarea
      className="input min-h-14 resize-y"
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      autoFocus={editing}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
    />
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

export function Section({ title, children, actions, help }: { title: string; children: ReactNode; actions?: ReactNode; help?: string }) {
  return (
    <section className="panel-section">
      <header className="panel-section-header">
        <h3>
          {title}
          {help && <HelpButton card={help} title={`What is “${title.replace(/ \(.*\)$/, '').toLowerCase()}”?`} />}
        </h3>
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

/** `10` or `10,2` (PD notation). Keeps the typed text while it is incomplete (`10,`). */
export function SizeInput({
  length,
  precision,
  onChange,
  ariaLabel,
}: {
  length: number | undefined
  precision: number | undefined
  onChange: (v: { length?: number; precision?: number }) => void
  ariaLabel?: string
}) {
  const formatted = length === undefined ? '' : precision === undefined ? String(length) : `${length},${precision}`
  const [text, setText] = useState(formatted)
  const [invalid, setInvalid] = useState(false)
  useEffect(() => {
    // Undo, domain change…: show the model's value unless the typed text already means it.
    setText((t) => {
      const p = parseSize(t)
      return p && p.length === length && p.precision === precision ? t : formatted
    })
    setInvalid(false)
  }, [formatted, length, precision])
  return (
    <input
      className={`input ${invalid ? 'input-invalid' : ''}`}
      inputMode="decimal"
      aria-label={ariaLabel}
      title="Precision,scale — e.g. 10,2"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const p = parseSize(e.target.value)
        setInvalid(p === null)
        if (p) onChange(p)
      }}
      onBlur={() => {
        setText(formatted)
        setInvalid(false)
      }}
    />
  )
}
