// First-visit welcome, the screen tour (coach marks over the real UI), the shortcut sheet and About.

import { useEffect, useLayoutEffect, useState } from 'react'
import { create } from 'zustand'
import { CASES } from '../../data/cases'
import { AuthorLinks, GITHUB_URL, LINKEDIN_URL } from '../AuthorLinks'

const WELCOMED_KEY = 'stratasql.welcomed'

interface TourStep {
  /** `data-tour` value of the element to point at; the step is skipped when it is not on screen. */
  target: string
  title: string
  text: string
}

export const TOUR_STEPS: TourStep[] = [
  { target: 'views', title: 'One model, four views', text: 'You draw the Conceptual model (entities and relationships). Physical shows the tables generated from it, SQL the SQL Server script, and Sandbox runs that script in your browser so you can watch the keys reject bad rows.' },
  { target: 'file', title: 'Files', text: 'New, Open, Save and picture export. Open also reads PowerDesigner conceptual models (.cdm). Your work is saved in this browser automatically; Save gives you a file to keep or send.' },
  { target: 'add', title: 'Draw', text: '“+ Entity” (or double-click the canvas) adds an entity. To link two entities drag from the ● handle of one onto the other. “Link as:” says what the drag creates: a relationship or an inheritance (drag from the child to the parent).' },
  { target: 'canvas', title: 'The canvas', text: 'Click an entity or a line to select it, drag to move. Scroll to zoom. Delete removes the selection, Ctrl+Z undoes.' },
  { target: 'panel', title: 'Properties', text: 'Everything about the selection: attributes, identifiers, cardinalities, dependency. The small ? next to a property explains it with a mini-example. With nothing selected you see the model and its domains.' },
  { target: 'issues', title: 'Model check', text: 'Live hints about your model: a missing identifier, a many-to-many that needs an intermediate entity, a cycle… Click an issue to see the elements; its ? opens the explanation.' },
  { target: 'trainer', title: 'Practise', text: 'The trainer uses the course cases: first a worked example, then tagging the text, completing a model and building one yourself, with a Next hint button and a score.' },
  { target: 'help', title: 'Help', text: 'The glossary of concepts, this tour and the keyboard shortcuts are always here.' },
]

interface OnboardingState {
  welcome: boolean
  step: number | null
  shortcuts: boolean
  about: boolean
  startTour: () => void
  next: () => void
  back: () => void
  stop: () => void
  closeWelcome: () => void
  showShortcuts: (on: boolean) => void
  showAbout: (on: boolean) => void
}

function firstVisit(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === null
  } catch {
    return false
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, '1')
  } catch {
    // private mode: show the welcome again next time, nothing breaks
  }
}

const present = (i: number) => document.querySelector(`[data-tour="${TOUR_STEPS[i].target}"]`) !== null

function seek(from: number, dir: 1 | -1): number | null {
  for (let i = from; i >= 0 && i < TOUR_STEPS.length; i += dir) if (present(i)) return i
  return null
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  welcome: firstVisit(),
  step: null,
  shortcuts: false,
  about: false,
  startTour: () => {
    markWelcomed()
    set({ welcome: false, step: seek(0, 1) })
  },
  next: () => {
    const s = get().step
    set({ step: s === null ? null : seek(s + 1, 1) })
  },
  back: () => {
    const s = get().step
    if (s === null) return
    set({ step: seek(s - 1, -1) ?? s })
  },
  stop: () => set({ step: null }),
  closeWelcome: () => {
    markWelcomed()
    set({ welcome: false })
  },
  showShortcuts: (shortcuts) => set({ shortcuts }),
  showAbout: (about) => set({ about }),
}))

function useTargetRect(target: string | undefined): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (!target) return setRect(null)
    const measure = () => setRect(document.querySelector(`[data-tour="${target}"]`)?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [target])
  return rect
}

const CARD_W = 340

function TourOverlay() {
  const step = useOnboarding((s) => s.step)
  const { next, back, stop } = useOnboarding.getState()
  const s = step === null ? undefined : TOUR_STEPS[step]
  const rect = useTargetRect(s?.target)

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [step, next, back, stop])

  if (!s || !rect) return null
  const last = seek((step ?? 0) + 1, 1) === null
  const shown = TOUR_STEPS.filter((_, i) => present(i))
  const index = shown.indexOf(s) + 1

  // Card below the target when there is room, otherwise above or inside (large targets).
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - CARD_W / 2), vw - CARD_W - 12)
  let top = rect.bottom + 12
  if (top + 200 > vh) top = rect.top - 212
  if (top < 12) top = Math.min(vh - 220, rect.top + 24)

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Tour: ${s.title}`}>
      <div className="tour-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
      <div className="tour-card" style={{ left, top, width: CARD_W }}>
        <div className="tour-count">
          {index} / {shown.length}
        </div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        <div className="tour-actions">
          <button type="button" className="btn btn-small" onClick={stop}>
            Skip tour
          </button>
          <span className="flex-1" />
          {index > 1 && (
            <button type="button" className="btn btn-small" onClick={back}>
              Back
            </button>
          )}
          <button type="button" className="btn btn-small btn-primary" onClick={last ? stop : next} autoFocus>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Welcome(props: { onPractise: () => void; onWatch: () => void }) {
  const open = useOnboarding((s) => s.welcome)
  const { startTour, closeWelcome } = useOnboarding.getState()
  if (!open) return null
  const narrow = window.matchMedia('(max-width: 899px)').matches
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onKeyDown={(e) => e.key === 'Escape' && closeWelcome()}>
      <div className="modal welcome">
        <h2 id="welcome-title">
          Welcome to Strata<span>SQL</span>
        </h2>
        <p>
          Draw a <b>conceptual model</b> (entities, attributes, relationships) the way database courses teach it with PowerDesigner. StrataSQL turns it into <b>tables</b> and a <b>SQL Server script</b>, checks the model and explains every concept.
        </p>
        {narrow && (
          <p className="welcome-narrow">
            Made for a laptop or desktop screen: drawing needs a mouse and room for three columns. Here you can look around; to model, open{' '}
            <b>{location.host}</b> on a computer.
          </p>
        )}
        <div className="welcome-choices">
          <button type="button" className="welcome-choice" onClick={startTour} autoFocus>
            <b>Show me around</b>
            <span>A 1-minute tour of the screen</span>
          </button>
          <button
            type="button"
            className="welcome-choice"
            onClick={() => {
              closeWelcome()
              props.onWatch()
            }}
          >
            <b>Watch a model being built</b>
            <span>A small library, from its text to tables, one step at a time</span>
          </button>
          <button
            type="button"
            className="welcome-choice"
            onClick={() => {
              closeWelcome()
              props.onPractise()
            }}
          >
            <b>Practise on a case</b>
            <span>{CASES.length} cases from easy to hard: tag the text, build the model, check it</span>
          </button>
        </div>
        <div className="welcome-foot">
          <span>The tour, glossary and shortcuts stay in the Help menu.</span>
          <button type="button" className="btn btn-small" onClick={closeWelcome}>
            Start with an empty model
          </button>
        </div>
        <p className="welcome-disclaimer">
          An unofficial student project, not affiliated with or endorsed by NOVA IMS. Where it differs from the course, the course and your professor are right.
        </p>
        <AuthorLinks />
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Double-click the canvas', 'New entity'],
  ['Drag from ● to another entity', 'Relationship / inheritance'],
  ['?', 'This list of shortcuts'],
  ['Delete', 'Delete the selection'],
  ['Esc', 'Clear the selection, close a dialog'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+D', 'Duplicate the selected entity'],
  ['Ctrl+S', 'Save the model as a file'],
  ['Ctrl+Shift+S', 'Save as: choose the folder and the name'],
  ['Mouse wheel / drag the background', 'Zoom / pan'],
  ['Ctrl+Enter (Sandbox console)', 'Run the SQL'],
]

function Shortcuts() {
  const open = useOnboarding((s) => s.shortcuts)
  const close = () => useOnboarding.getState().showShortcuts(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard and mouse</h2>
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="welcome-foot">
          <span />
          <button type="button" className="btn btn-small btn-primary" onClick={close} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function About() {
  const open = useOnboarding((s) => s.about)
  const close = () => useOnboarding.getState().showAbout(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="About StrataSQL" onClick={close}>
      <div className="modal about" onClick={(e) => e.stopPropagation()}>
        <h2>About StrataSQL</h2>
        <p>
          Draw a conceptual model and get the physical model and a SQL Server script, following the conventions of the
          NOVA IMS DBMS course (PowerDesigner, IE notation, intermediate entities).
        </p>
        <p className="about-disclaimer">
          <b>An unofficial student project</b>, not affiliated with or endorsed by NOVA IMS. Where it differs from the
          course, the course and your professor are right.
        </p>
        <p>
          The three course cases (Ride Hailing, Timetables, TV Shows) are adapted from the class material; their rights
          stay with their authors. The other cases are the author's own.
        </p>
        <p>
          Made by Stanislav Sidorovich, part of{' '}
          <a href="https://quaera.app" target="_blank" rel="noopener">
            Quaera
          </a>
          . Source:{' '}
          <a href={GITHUB_URL} target="_blank" rel="noopener">
            GitHub
          </a>
          , author on{' '}
          <a href={LINKEDIN_URL} target="_blank" rel="noopener">
            LinkedIn
          </a>
          . Code under Apache-2.0, learning content under CC BY-NC-SA 4.0.
        </p>
        <p className="about-small">
          PowerDesigner is a trademark of SAP SE and SQL Server of Microsoft; StrataSQL is not affiliated with either.
        </p>
        <div className="welcome-foot">
          <span />
          <button type="button" className="btn btn-small btn-primary" onClick={close} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function Onboarding(props: { onPractise: () => void; onWatch: () => void }) {
  return (
    <>
      <Welcome {...props} />
      <TourOverlay />
      <Shortcuts />
      <About />
    </>
  )
}
