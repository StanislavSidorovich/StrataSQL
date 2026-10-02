// Live linter results (SPEC §7): a dock under the canvas, and the issues of one element in its panel.

import { issueTouches, RULES, type LintIssue, type Severity } from '../../core/lint'
import type { Id } from '../../core/metamodel'
import { HelpButton } from '../panels/fields'
import { useEditor, useLint, type Selection } from '../store'

const ICON: Record<Severity, string> = { error: '⛔', warning: '⚠', info: 'ℹ' }

export function countBySeverity(issues: LintIssue[]): Record<Severity, number> {
  const c = { error: 0, warning: 0, info: 0 }
  for (const i of issues) c[i.severity]++
  return c
}

/** Selects the issue's first element and highlights all its elements on the canvas. */
export function goToIssue(issue: LintIssue) {
  const { select, focusIssue, setView } = useEditor.getState()
  const t = issue.targets[0]
  const sel: Selection = t.kind === 'attribute' ? { kind: 'entity', id: t.entityId } : { kind: t.kind, id: t.id }
  setView('cdm')
  select(sel)
  focusIssue(issue)
}

function IssueRow({ issue, focused }: { issue: LintIssue; focused: boolean }) {
  return (
    <li className={`issue issue-${issue.severity} ${focused ? 'is-focused' : ''}`}>
      <button type="button" className="issue-main" onClick={() => goToIssue(issue)} title="Show on the canvas">
        <span className="issue-icon">{ICON[issue.severity]}</span>
        <span className="issue-rule">{issue.rule}</span>
        <span>{issue.message}</span>
      </button>
      <HelpButton card={issue.help} title={RULES[issue.rule].title} />
    </li>
  )
}

export function IssuesDock() {
  const issues = useLint()
  const open = useEditor((s) => s.issuesOpen)
  const focused = useEditor((s) => s.focusedIssue)
  const setOpen = useEditor((s) => s.setIssuesOpen)
  const c = countBySeverity(issues)
  return (
    <div className={`issues-dock ${open ? 'is-open' : ''}`} data-testid="issues-dock">
      <button type="button" className="issues-bar" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>Model check</b>
        {issues.length === 0 ? (
          <span className="issue-ok">✓ no issues</span>
        ) : (
          <>
            {c.error > 0 && <span className="count count-error">{c.error} error{c.error > 1 ? 's' : ''}</span>}
            {c.warning > 0 && <span className="count count-warning">{c.warning} warning{c.warning > 1 ? 's' : ''}</span>}
            {c.info > 0 && <span className="count count-info">{c.info} hint{c.info > 1 ? 's' : ''}</span>}
          </>
        )}
        <span className="ml-auto muted">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <ul className="issue-list">
          {issues.map((i, n) => (
            <IssueRow key={`${i.rule}-${n}-${i.message}`} issue={i} focused={focused?.message === i.message} />
          ))}
          {issues.length === 0 && <li className="muted px-3 py-2">The linter checks L01–L11 found nothing. Every issue would link to a help card.</li>}
        </ul>
      )}
    </div>
  )
}

/** Issues that point at one element, shown at the top of its properties panel. */
export function ElementIssues({ kind, id }: { kind: 'entity' | 'relationship' | 'inheritance'; id: Id }) {
  const issues = useLint().filter((i) => issueTouches(i, kind, id))
  const focused = useEditor((s) => s.focusedIssue)
  if (issues.length === 0) return null
  return (
    <ul className="issue-list element-issues" aria-label="Issues">
      {issues.map((i, n) => (
        <IssueRow key={`${i.rule}-${n}`} issue={i} focused={focused?.message === i.message} />
      ))}
    </ul>
  )
}

/** Worst severity of the issues touching an element (for canvas highlighting). */
export function worstSeverity(issues: LintIssue[], kind: 'entity' | 'relationship' | 'inheritance', id: Id): Severity | null {
  let worst: Severity | null = null
  for (const i of issues) {
    if (!issueTouches(i, kind, id)) continue
    if (i.severity === 'error') return 'error'
    if (i.severity === 'warning' || worst === null) worst = i.severity
  }
  return worst
}
