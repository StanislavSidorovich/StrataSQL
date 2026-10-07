// node sheet.mjs out.png file1 file2 ... — contact sheet for checking captures
import { chromium } from 'playwright'
import { pathToFileURL } from 'url'
import fs from 'fs'
const [, , out, ...files] = process.argv
fs.writeFileSync('sheet.html', '<body style="display:flex;flex-wrap:wrap;gap:8px;font:14px sans-serif;margin:4px">' + files.map(f => `<div>${f}<br><img src="${f}" style="max-width:580px;max-height:330px;border:1px solid red"></div>`).join('') + '</body>')
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } })
await p.goto(pathToFileURL('sheet.html').href); await p.waitForTimeout(400); await p.screenshot({ path: out, fullPage: true }); await b.close()
