import { app, shell } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getSystemReport } from './sysinfo'
import { getInsights } from './analyzer'
import { getComponentChecklist, getProblemDevices } from './drivers'
import { listTweaks, getTweakStates } from './optimizer'
import type { ActionResult } from '../../shared/types'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const SEV = {
  critical: { color: '#e74c3c', label: 'CRITIQUE' },
  warn: { color: '#f39c12', label: 'À corriger' },
  info: { color: '#00d2ff', label: 'Info' },
  ok: { color: '#2ecc71', label: 'OK' }
} as const

export async function generateReport(): Promise<ActionResult & { path?: string }> {
  try {
    // Séquentiel strict : un rapport lançait tout en parallèle et figeait les petits PC.
    const report = await getSystemReport()
    const insights = await getInsights()
    const checklist = await getComponentChecklist().catch(() => [])
    const problems = await getProblemDevices().catch(() => [])
    const tweaks = listTweaks()
    const states = await getTweakStates()
    const stateMap = new Map(states.map((s) => [s.id, s.applied]))
    const applied = tweaks.filter((t) => stateMap.get(t.id)).length

    const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Rapport Pkaizen Forge — ${esc(report.manufacturer)} ${esc(report.model)}</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0b0e14;color:#e8ecf4;margin:0;padding:40px;max-width:900px;margin:auto}
h1{background:linear-gradient(90deg,#6c5ce7,#00d2ff);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{border-bottom:1px solid #232c3d;padding-bottom:8px;margin-top:36px}
.card{background:#151b26;border:1px solid #232c3d;border-radius:12px;padding:16px 20px;margin:10px 0}
.k{color:#8a94a8;font-size:13px;text-transform:uppercase;letter-spacing:.6px}
.v{font-size:16px;font-weight:600;margin-top:2px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;margin-right:8px}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:8px 10px;border-bottom:1px solid #232c3d;text-align:left}
th{color:#8a94a8;font-size:11px;text-transform:uppercase}
.muted{color:#8a94a8;font-size:12px}
</style></head><body>
<h1>⚒ Rapport Pkaizen Forge</h1>
<p class="muted">Généré le ${new Date().toLocaleString('fr-FR')} — ${esc(report.manufacturer)} ${esc(report.model)} (${report.isLaptop ? 'PC portable' : 'PC fixe'})</p>

<h2>🖥 Configuration</h2>
<div class="grid">
<div class="card"><div class="k">Processeur</div><div class="v">${esc(report.cpu.brand)}</div><div class="muted">${report.cpu.physicalCores} cœurs / ${report.cpu.cores} threads · ${report.cpu.speedMax} GHz</div></div>
<div class="card"><div class="k">Mémoire</div><div class="v">${report.ram.totalGB} Go</div><div class="muted">${esc(report.ram.slots)}</div></div>
${report.gpus.map((g) => `<div class="card"><div class="k">GPU</div><div class="v">${esc(g.model)}</div><div class="muted">${g.vramMB > 0 ? Math.round(g.vramMB / 1024) + ' Go VRAM' : esc(g.vendor)}</div></div>`).join('')}
<div class="card"><div class="k">Système</div><div class="v">${esc(report.os.distro)}</div><div class="muted">Build ${esc(report.os.build)} · ${esc(report.os.arch)}</div></div>
${report.disks.map((d) => `<div class="card"><div class="k">Stockage</div><div class="v">${esc(d.name)}</div><div class="muted">${d.sizeGB} Go · ${esc(d.type)} ${esc(d.interfaceType)}</div></div>`).join('')}
${report.battery.hasBattery ? `<div class="card"><div class="k">Batterie</div><div class="v">${report.battery.healthPercent != null ? report.battery.healthPercent + '% de santé' : '—'}</div></div>` : ''}
</div>

<h2>🩺 Analyse (bottlenecks)</h2>
${insights.map((i) => `<div class="card" style="border-left:3px solid ${SEV[i.severity].color}"><span class="badge" style="background:${SEV[i.severity].color}22;color:${SEV[i.severity].color}">${SEV[i.severity].label}</span><b>${esc(i.title)}</b><div class="muted" style="margin-top:6px">${esc(i.detail)}</div></div>`).join('')}

<h2>⚡ Optimisations</h2>
<div class="card"><div class="v">${applied} / ${tweaks.length} tweaks appliqués</div>
<table><tr><th>Tweak</th><th>État</th></tr>
${tweaks.map((t) => `<tr><td>${esc(t.name)}</td><td>${stateMap.get(t.id) ? '✅ Actif' : '—'}</td></tr>`).join('')}
</table></div>

${problems.length > 0 ? `<h2>⚠ Périphériques en erreur</h2>${problems.map((p) => `<div class="card" style="border-left:3px solid #e74c3c"><b>${esc(p.name)}</b><div class="muted">${esc(p.problem)} (code ${p.code})</div></div>`).join('')}` : ''}

<h2>🧩 Pilotes par composant</h2>
<table><tr><th>Composant</th><th>Nom</th><th>Installé</th><th>État</th></tr>
${checklist.map((c) => `<tr><td>${esc(c.component)}</td><td>${esc(c.name)}</td><td>${esc(c.installed || '—')}${c.installedDate ? ' <span class="muted">(' + esc(c.installedDate) + ')</span>' : ''}</td><td>${c.status === 'update' ? '🔴 MAJ dispo' : c.status === 'probably-update' ? '🟠 Probablement obsolète' : c.status === 'ok' ? '🟢 À jour' : '🔵 À vérifier'}</td></tr>`).join('')}
</table>

<p class="muted" style="margin-top:40px">Rapport généré par Pkaizen Forge — optimisations 100% réversibles, compatibles anticheat.</p>
</body></html>`

    const path = join(app.getPath('documents'), 'Pkaizen-Forge-Rapport.html')
    await writeFile(path, html, 'utf8')
    await shell.openPath(path)
    return { ok: true, path, message: `Rapport enregistré : ${path}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
