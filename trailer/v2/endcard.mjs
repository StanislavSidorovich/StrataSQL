import { chromium } from 'playwright'
import { pathToFileURL } from 'url'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } })
await p.goto(pathToFileURL('endcard.html').href); await p.waitForTimeout(300)
await p.screenshot({ path: 'endcard.png' })
await b.close()
