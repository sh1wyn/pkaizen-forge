import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const fail = (msg) => {
  failures++
  console.log('❌ ' + msg)
}

/* ---- 1. Clés i18n : parité entre les 7 langues + clés utilisées existantes ---- */
const i18nSrc = readFileSync(join(root, 'src/renderer/src/lib/i18n.tsx'), 'utf8')
const langBlocks = {}
const langRe = /^\s{2}(en|fr|es|ru|de|pt|it): \{/gm
const positions = []
let m
while ((m = langRe.exec(i18nSrc)) !== null) positions.push({ lang: m[1], start: m.index })
positions.push({ lang: '_end', start: i18nSrc.indexOf('} as const') })
for (let i = 0; i < positions.length - 1; i++) {
  const block = i18nSrc.slice(positions[i].start, positions[i + 1].start)
  const keys = new Set()
  const keyRe = /'([a-z]+\.[a-zA-Z0-9]+)':/g
  let k
  while ((k = keyRe.exec(block)) !== null) keys.add(k[1])
  langBlocks[positions[i].lang] = keys
}
const enKeys = langBlocks.en
console.log(`Langues trouvées : ${Object.keys(langBlocks).join(', ')} — ${enKeys.size} clés EN`)
for (const [lang, keys] of Object.entries(langBlocks)) {
  if (lang === 'en') continue
  const missing = [...enKeys].filter((key) => !keys.has(key))
  const extra = [...keys].filter((key) => !enKeys.has(key))
  if (missing.length) fail(`[i18n] ${lang} : ${missing.length} clés manquantes → ${missing.join(', ')}`)
  if (extra.length) fail(`[i18n] ${lang} : clés en trop → ${extra.join(', ')}`)
}

/* ---- 2. Clés utilisées dans les pages → existent en EN ---- */
const usedKeys = new Set()
const scanDir = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name)
    if (f.isDirectory()) scanDir(p)
    else if (/\.(tsx|ts)$/.test(f.name) && !f.name.includes('i18n')) {
      const src = readFileSync(p, 'utf8')
      const tRe = /\bt\('([a-z]+\.[a-zA-Z0-9]+)'/g
      let u
      while ((u = tRe.exec(src)) !== null) usedKeys.add(u[1])
      const keyPropRe = /(?:labelKey|whyKey):\s*'([a-z]+\.[a-zA-Z0-9]+)'/g
      while ((u = keyPropRe.exec(src)) !== null) usedKeys.add(u[1])
      const catRe = /'(cat\.[a-z]+)'/g
      while ((u = catRe.exec(src)) !== null) usedKeys.add(u[1])
    }
  }
}
scanDir(join(root, 'src/renderer/src'))
const unknownUsed = [...usedKeys].filter((key) => !enKeys.has(key))
if (unknownUsed.length) fail(`[i18n] clés utilisées mais absentes du dictionnaire : ${unknownUsed.join(', ')}`)
console.log(`${usedKeys.size} clés utilisées dans l'UI — toutes présentes : ${unknownUsed.length === 0 ? '✓' : 'NON'}`)

/* ---- 3. Canaux IPC : preload invoke ↔ main handle ---- */
const preload = readFileSync(join(root, 'src/preload/index.ts'), 'utf8')
const mainIdx = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
const invokes = new Set([...preload.matchAll(/invoke\('([^']+)'/g)].map((x) => x[1]))
const handles = new Set([...mainIdx.matchAll(/(?:handle|ipcMain\.handle)\('([^']+)'/g)].map((x) => x[1]))
const noHandler = [...invokes].filter((c) => !handles.has(c))
const noInvoker = [...handles].filter((c) => !invokes.has(c))
if (noHandler.length) fail(`[IPC] invoke sans handler côté main : ${noHandler.join(', ')}`)
if (noInvoker.length) console.log(`ℹ [IPC] handlers jamais invoqués (pas grave) : ${noInvoker.join(', ')}`)
console.log(`${invokes.size} canaux IPC côté preload — tous branchés : ${noHandler.length === 0 ? '✓' : 'NON'}`)

/* ---- 4. Événements push main → listeners preload ---- */
const sends = new Set([...mainIdx.matchAll(/sender\.send\('([^']+)'/g)].map((x) => x[1]))
const listeners = new Set([...preload.matchAll(/ipcRenderer\.on\('([^']+)'/g)].map((x) => x[1]))
const orphanSends = [...sends].filter((c) => !listeners.has(c))
if (orphanSends.length) fail(`[IPC] événements émis sans listener : ${orphanSends.join(', ')}`)

console.log(failures === 0 ? '\n✅ AUDIT OK — aucun problème détecté' : `\n⚠ ${failures} problème(s) détecté(s)`)
process.exit(failures === 0 ? 0 : 1)
