import { useEffect, useState } from 'react'
import type { SystemReport, LiveStats, Insight } from '../../../shared/types'
import { useToast } from '../components/Toast'

const SEV_STYLE: Record<Insight['severity'], { icon: string; color: string; label: string }> = {
  critical: { icon: '🔴', color: 'var(--red)', label: 'Critique' },
  warn: { icon: '🟠', color: 'var(--orange)', label: 'À corriger' },
  info: { icon: '🔵', color: 'var(--accent2)', label: 'Bon à savoir' },
  ok: { icon: '🟢', color: 'var(--green)', label: 'OK' }
}

export default function Dashboard(): React.JSX.Element {
  const [report, setReport] = useState<SystemReport | null>(null)
  const [live, setLive] = useState<LiveStats | null>(null)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const toast = useToast()

  useEffect(() => {
    window.api.getSystemReport().then(setReport).catch(() => toast('Erreur lecture matériel', 'error'))
    window.api.getInsights().then(setInsights).catch(() => setInsights([]))
    let stop = false
    const poll = async (): Promise<void> => {
      try {
        const s = await window.api.getLiveStats()
        if (!stop) setLive(s)
      } catch {
        /* ignore */
      }
    }
    poll()
    const t = setInterval(poll, 2500)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [toast])

  return (
    <>
      <h1>Diagnostic</h1>
      <p className="subtitle">
        Analyse complète de ta machine — matériel, charge en direct et points faibles détectés.
      </p>

      {live && (
        <div className="grid" style={{ marginBottom: 14 }}>
          <div className="card stagger">
            <h3>CPU — charge</h3>
            <div className="big">{live.cpuLoad}%{live.cpuTemp != null ? ` · ${live.cpuTemp}°C` : ''}</div>
            <div className="bar-track">
              <div className={`bar-fill ${live.cpuLoad > 85 ? 'warn' : ''}`} style={{ width: `${live.cpuLoad}%` }} />
            </div>
          </div>
          <div className="card stagger">
            <h3>Mémoire</h3>
            <div className="big">
              {live.memUsedGB} / {live.memTotalGB} Go
            </div>
            <div className="bar-track">
              <div className={`bar-fill ${live.memPercent > 88 ? 'warn' : ''}`} style={{ width: `${live.memPercent}%` }} />
            </div>
          </div>
          {live.gpuLoad != null && (
            <div className="card stagger">
              <h3>GPU</h3>
              <div className="big">{live.gpuLoad}%{live.gpuTemp != null ? ` · ${live.gpuTemp}°C` : ''}</div>
              <div className="bar-track">
                <div className={`bar-fill ${live.gpuLoad > 95 ? 'warn' : ''}`} style={{ width: `${live.gpuLoad}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="section-title">🩺 Analyse de la config (bottlenecks)</div>
      {insights === null && (
        <div className="card">
          <span className="spinner" /> <span className="muted">Analyse en cours…</span>
        </div>
      )}
      {insights?.map((i, idx) => (
        <div className="row stagger" key={idx} style={{ borderLeft: `3px solid ${SEV_STYLE[i.severity].color}` }}>
          <div className="row-info">
            <div className="row-title">
              {SEV_STYLE[i.severity].icon} {i.title}
            </div>
            <div className="row-desc">{i.detail}</div>
          </div>
          {i.action && (
            <button className="btn" onClick={() => window.api.openExternal(i.action!.url)}>
              {i.action.label}
            </button>
          )}
        </div>
      ))}

      <div className="section-title">🖥 Matériel détecté</div>
      {!report && (
        <div className="card">
          <span className="spinner" /> <span className="muted">Lecture du matériel…</span>
        </div>
      )}
      {report && (
        <div className="grid">
          <div className="card stagger">
            <h3>Machine</h3>
            <div className="big">
              {report.manufacturer} {report.model}
            </div>
            <div className="sub">
              {report.isLaptop ? '💻 PC portable' : '🖥 PC fixe'} · {report.os.distro} ({report.os.build})
            </div>
          </div>
          <div className="card stagger">
            <h3>Processeur</h3>
            <div className="big">{report.cpu.brand}</div>
            <div className="sub">
              {report.cpu.physicalCores} cœurs / {report.cpu.cores} threads · {report.cpu.speedMax} GHz max
            </div>
          </div>
          {report.gpus.map((g, i) => (
            <div className="card stagger" key={i}>
              <h3>Carte graphique {report.gpus.length > 1 ? i + 1 : ''}</h3>
              <div className="big">{g.model}</div>
              <div className="sub">{g.vramMB > 0 ? `${Math.round(g.vramMB / 1024)} Go VRAM` : g.vendor}</div>
            </div>
          ))}
          <div className="card stagger">
            <h3>Mémoire vive</h3>
            <div className="big">{report.ram.totalGB} Go</div>
            <div className="sub">{report.ram.slots || '—'}</div>
          </div>
          {report.disks.map((d, i) => (
            <div className="card stagger" key={i}>
              <h3>Stockage {report.disks.length > 1 ? i + 1 : ''}</h3>
              <div className="big">{d.name}</div>
              <div className="sub">
                {d.sizeGB} Go · {d.type} {d.interfaceType && `(${d.interfaceType})`}
              </div>
            </div>
          ))}
          {report.volumes.map((v) => (
            <div className="card stagger" key={v.mount}>
              <h3>Volume {v.mount}</h3>
              <div className="big">
                {v.usedGB} / {v.sizeGB} Go
              </div>
              <div className="bar-track">
                <div className={`bar-fill ${v.usePercent > 90 ? 'warn' : ''}`} style={{ width: `${v.usePercent}%` }} />
              </div>
            </div>
          ))}
          {report.battery.hasBattery && (
            <div className="card stagger">
              <h3>Batterie</h3>
              <div className="big">
                {report.battery.percent}% {report.battery.isCharging ? '⚡ en charge' : ''}
              </div>
              <div className="sub">
                {report.battery.healthPercent != null && `Santé : ${report.battery.healthPercent}% de la capacité d\u2019origine`}
              </div>
              <button className="btn" style={{ marginTop: 10 }} onClick={() => window.api.openBatteryReport()}>
                Rapport batterie détaillé
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
