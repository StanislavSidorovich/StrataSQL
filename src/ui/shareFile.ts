// Share as file: the model (with the comparison, if one is on) or the story on the screen, as a small
// `.model.html` whose link opens it in Quaera Model; the same link can be copied. The reading side is App.tsx.
import { LIVE_ORIGIN, SHARE_EXTENSION, SOFT_URL_LIMIT, shareHtml, shareUrl, storyShareUrl } from '../core/shareLink'
import { saveExport } from './fileSave'
import { fileBaseName } from './pdm/SqlView'
import { useEditor } from './store'
import { useStory } from './story/storyStore'

/** Testing: `?sharehere` makes the file point at the page's own origin (the dev server) instead of the live site. */
const origin = () => (new URLSearchParams(location.search).has('sharehere') ? location.origin : LIVE_ORIGIN)

const kb = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1000))} KB` : `${(n / 1e6).toFixed(1)} MB`)
const PRIVACY = 'The content stays inside the link after the #, which is never sent to a server.'

/** The story on the screen, else the model (with its comparison, when there is one). */
async function build() {
  const { story } = useStory.getState()
  const ed = useEditor.getState()
  let url: string
  let name: string
  if (story) {
    // During a story the canvas holds one beat; a story without a model of its own is told over the user's model.
    url = await storyShareUrl(story, ed.trainerBackup ?? ed.model, origin())
    name = story.title
  } else {
    if (!ed.model.entities.length) throw new Error('the model is empty, nothing to share')
    const base = ed.trainerBackup ? null : ed.changesBase
    url = await shareUrl(ed.model, origin() + '/', base)
    name = ed.model.name || 'model'
  }
  const warn = url.length > SOFT_URL_LIMIT ? ` The link is ${kb(url.length)}: some browsers cut links over about 1.5 MB, so test that it opens.` : ''
  return { url, name, warn, story: !!story }
}

/** Share as file…: writes `<name>.model.html`. Returns a note, or null when cancelled. */
export async function shareAsFile(): Promise<string | null> {
  const { url, name, warn, story } = await build()
  const saved = await saveExport(`${fileBaseName(name)}${SHARE_EXTENSION}`, 'html', async () => new Blob([shareHtml(name, url, story ? 'story' : 'model')], { type: 'text/html' }))
  if (!saved) return null
  return `Saved ${saved} (${kb(url.length)}): send this one file. Opening it lands in Quaera Model with the ${story ? 'story' : 'model'} loaded. ${PRIVACY}${warn}`
}

/** Runs {@link shareAsFile} and tells the result in the notice. */
export async function shareFileNow(say: (note: string) => void): Promise<void> {
  try {
    say((await shareAsFile()) ?? 'Share cancelled.')
  } catch (e) {
    useEditor.getState().showError(`Not shared: ${(e as Error).message}`)
  }
}
