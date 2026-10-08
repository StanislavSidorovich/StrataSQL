import { describe, expect, it } from 'vitest'
import { CASES } from '../src/data/cases'
import { serializeModel } from '../src/core/serialize'
import { decodeShare, encodeShare, shareDataFromHash, shareUrl } from '../src/core/shareLink'

describe('share link', () => {
  it('round-trips every case model through the link', async () => {
    for (const c of CASES) {
      const m = c.build()
      const back = await decodeShare(await encodeShare(m))
      expect(serializeModel(back), c.id).toBe(serializeModel(m))
    }
  })

  it('keeps links short enough to paste into a chat', async () => {
    for (const c of CASES) {
      const url = await shareUrl(c.build(), 'https://model.quaera.app/')
      expect(url.length, c.id).toBeLessThan(16000)
    }
  })

  it('uses only URL-safe characters and drops the query and the old fragment', async () => {
    const url = await shareUrl(CASES[0].build(), 'https://model.quaera.app/?example=quaera#m=old')
    expect(url).toMatch(/^https:\/\/model\.quaera\.app\/#m=[A-Za-z0-9_-]+$/)
  })

  it('reads the data from a fragment', () => {
    expect(shareDataFromHash('#m=abc')).toBe('abc')
    expect(shareDataFromHash('#x=1&m=abc')).toBe('abc')
    expect(shareDataFromHash('')).toBeNull()
    expect(shareDataFromHash('#m=')).toBeNull()
  })

  it('rejects a cut or damaged link with a readable message', async () => {
    const data = await encodeShare(CASES[0].build())
    await expect(decodeShare(data.slice(0, data.length / 2))).rejects.toThrow(/damaged|incomplete|JSON/)
    await expect(decodeShare('not-a-model')).rejects.toThrow(/damaged/)
  })
})
