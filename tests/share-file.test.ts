// Share as file: the `.model.html` carries a `#m=` / `#s=` link. A model, a model with a comparison and a
// story round-trip; links made before the story key existed keep opening; the page has no external resource.

import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { serializeModel } from '../src/core/serialize'
import {
  BASE_PARAM,
  decodeShare,
  decodeStoryShare,
  encodeShare,
  encodeStoryShare,
  LIVE_ORIGIN,
  packText,
  SHARE_PARAM,
  shareDataFromHash,
  shareHtml,
  shareUrl,
  storyDataFromHash,
  storyShareUrl,
  withShortIds,
} from '../src/core/shareLink'
import { CASES } from '../src/data/cases'
import { draftStory, parseStory, serializeStory, storyFrames } from '../src/data/story'

const library = CASES.find((c) => c.id === 'library')!.build()

describe('share as file', () => {
  it('a model link opens at the live site and round-trips the model', async () => {
    const url = await shareUrl(library, LIVE_ORIGIN + '/')
    expect(url.startsWith(LIVE_ORIGIN + '/#m=')).toBe(true)
    const back = await decodeShare(shareDataFromHash(new URL(url).hash)!)
    expect(generateSqlServer(generatePdm(back))).toBe(generateSqlServer(generatePdm(library)))
  })

  it('carries the earlier version for a comparison', async () => {
    const earlier = CASES.find((c) => c.id === 'hotel')!.build()
    const hash = new URL(await shareUrl(library, 'http://localhost:5176/', earlier)).hash
    const p = new URLSearchParams(hash.slice(1))
    expect((await decodeShare(p.get(BASE_PARAM)!)).name).toBe(earlier.name)
    expect(p.has(SHARE_PARAM)).toBe(true)
  })

  it('a story (model inside) round-trips: same title, beats and frames', async () => {
    const story = draftStory(library)
    const url = await storyShareUrl(story, library, 'http://localhost:5176/')
    expect(url.startsWith('http://localhost:5176/#s=')).toBe(true)
    const back = await decodeStoryShare(storyDataFromHash(new URL(url).hash)!)
    expect(back.title).toBe(story.title)
    expect(back.beats).toEqual(parseStory(serializeStory(story)).beats)
    const was = storyFrames(story, library)
    const now = storyFrames(back)
    expect(now.map((f) => f.model.entities.map((e) => e.name))).toEqual(was.map((f) => f.model.entities.map((e) => e.name)))
    expect(generateSqlServer(generatePdm(now.at(-1)!.model))).toBe(generateSqlServer(generatePdm(library)))
  })

  it('a story without a model of its own is told over the given model', async () => {
    const story = { ...draftStory(library), model: undefined }
    const back = await decodeStoryShare(await encodeStoryShare(story, library))
    expect(back.model?.entities).toHaveLength(library.entities.length)
    expect(storyFrames(back).at(-1)!.model.entities).toHaveLength(library.entities.length)
  })

  it('old #m= links (and #m=&b=) still decode; a story key is not mistaken for them', async () => {
    // A link as the version before this one made it: encodeShare is unchanged.
    const old = `#${SHARE_PARAM}=${await encodeShare(library)}`
    expect(storyDataFromHash(old)).toBeNull()
    expect(serializeModel(await decodeShare(shareDataFromHash(old)!))).toBe(serializeModel(withShortIds(library)))
    const story = `#s=${await encodeStoryShare(draftStory(library), library)}`
    expect(shareDataFromHash(story)).toBeNull()
  })

  it('refuses a damaged story link with a readable message', async () => {
    await expect(decodeStoryShare('not-a-link!')).rejects.toThrow(/damaged or incomplete/)
    await expect(decodeStoryShare(await packText('{"format":"nope"}'))).rejects.toThrow(/Not a Quaera Model story/)
  })

  it('the story link is much shorter than the story file', async () => {
    const story = draftStory(library)
    const data = await encodeStoryShare(story, library)
    expect(data.length).toBeLessThan(serializeStory(story).length / 2)
    expect(parseStory(serializeStory(story)).beats).toHaveLength(story.beats.length)
  })

  it('the file is a self-contained page: redirect, visible link, privacy line, nothing external', () => {
    const url = 'https://model.quaera.app/#m=abc_-123'
    const html = shareHtml('Library <&> "x"', url)
    expect(html).toContain('<title>Library &lt;&amp;&gt; &quot;x&quot;</title>')
    expect(html).toContain('Opening in Quaera Model…')
    expect(html).toContain(`location.replace(${JSON.stringify(url)})`)
    expect(html).toContain(`href="${url}"`)
    expect(html).toContain('never sent to a server')
    expect(html.replaceAll(url, '')).not.toMatch(/https?:\/\/|<link|<img|src=/)
    expect(shareHtml('x', 'https://a/#m=</script>')).not.toContain('</script>#')
    expect((shareHtml('x', 'https://a/#m=</script>').match(/<\/script>/g) ?? []).length).toBe(1)
  })
})
