import { useEffect, useState } from 'react'
import type { SystemReport, LiveStats, Insight, DetailedInfo } from '../../../shared/types'
import { cached } from '../lib/cache'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

const SEV_STYLE: Record<Insight['severity'], { icon: string; color: string }> = {
  critical: { icon: '🔴', color: 'var(--red)' },
  warn: { icon: '🟠', color: 'var(--orange)' },
  info: { icon: '🔵', color: 'var(--accent2)' },
  ok: { icon: '🟢', color: 'var(--green)' }
}

export default function Dashboard(): React.JSX.Element {
  const { t } = useI18n()
  const [report, setReport] = useState<SystemReport | null>(null)
  const [reportBusy, setReportBusy] = useState(false)
  const [live, setLive] = useState<LiveStats | null>(null)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [insightsBusy, setInsightsBusy] = useState(false)
  const [details, setDetails] = useState<DetailedInfo | null>(null)
  const [detailsBusy, setDetailsBusy] = useState(false)
  const toast = useToast()

  const loadHardware = async (): Promise<void> => {
    setReportBusy(true)
    try {
      setReport(await cached('report', () => window.api.getSystemReport()))
    } catch {
      toast(t('dash.errHw'), 'error')
    } finally {
      setReportBusy(false)
    }
  }

  const runAnalysis = async (): Promise<void> => {
    setInsightsBusy(true)
    try {
      setInsights(await cached('insights', () => window.api.getInsights()))
    } catch {
      setInsights([])
    }
    setInsightsBusy(false)
  }

  const loadDetails = async (): Promise<void> => {
    setDetailsBusy(true)
    try {
      setDetails(await cached('details', () => window.api.getDetailedInfo()))
    } catch {
      setDetails(null)
    }
    setDetailsBusy(false)
  }

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      if (stop) return
      try {
        if (!document.hidden) {
          const stats = await window.api.getLiveStats()
          if (!stop) setLive(stats)
        }
      } catch {
        /* ignore */
      } finally {
        if (!stop) timer = setTimeout(poll, 5000)
      }
    }
    void poll()
    return () => {
      stop = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <h1>{t('dash.title')}</h1>
      <p className="subtitle">{t('dash.subtitle')}</p>

      {live && (
        <div className="grid" style={{ marginBottom: 14 }}>
          <div className="card stagger">
            <h3>{t('dash.cpuLoad')}</h3>
            <div className="big">{live.cpuLoad}%{live.cpuTemp != null ? ` · ${live.cpuTemp}°C` : ''}</div>
            <div className="bar-track">
              <div className={`bar-fill ${live.cpuLoad > 85 ? 'warn' : ''}`} style={{ width: `${live.cpuLoad}%` }} />
            </div>
          </div>
          <div className="card stagger">
            <h3>{t('dash.memory')}</h3>
            <div className="big">
              {live.memUsedGB} / {live.memTotalGB} GB
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

      <div className="section-title">{t('dash.analysis')}</div>
      {insights === null && (
        <div className="toolbar">
          <button className="btn primary" disabled={insightsBusy} onClick={runAnalysis}>
            {insightsBusy ? <span className="spinner" /> : '🩺'} {t('dash.runAnalysis')}
          </button>
          {insightsBusy && <span className="muted">{t('dash.analyzing')}</span>}
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

      <div className="section-title">{t('dash.hardware')}</div>
      {!report && (
        <div className="toolbar">
          <button className="btn" disabled={reportBusy} onClick={loadHardware}>
            {reportBusy && <span className="spinner" />} {t('dash.scanHardware')}
          </button>
          {reportBusy && <span className="muted">{t('dash.readingHw')}</span>}
        </div>
      )}
      {report && (
        <div className="grid">
          <div className="card stagger">
            <h3>{t('dash.machine')}</h3>
            <div className="big">
              {report.manufacturer} {report.model}
            </div>
            <div className="sub">
              {report.isLaptop ? t('dash.laptop') : t('dash.desktop')} · {report.os.distro} ({report.os.build})
            </div>
          </div>
          <div className="card stagger">
            <h3>{t('dash.cpu')}</h3>
            <div className="big">{report.cpu.brand}</div>
            <div className="sub">
              {report.cpu.physicalCores} {t('dash.cores')} / {report.cpu.cores} {t('dash.threads')} · {report.cpu.speedMax} GHz {t('dash.max')}
            </div>
          </div>
          {report.gpus.map((g, i) => (
            <div className="card stagger" key={i}>
              <h3>{t('dash.gpu')} {report.gpus.length > 1 ? i + 1 : ''}</h3>
              <div className="big">{g.model}</div>
              <div className="sub">{g.vramMB > 0 ? `${Math.round(g.vramMB / 1024)} ${t('dash.vram')}` : g.vendor}</div>
            </div>
          ))}
          <div className="card stagger">
            <h3>{t('dash.ram')}</h3>
            <div className="big">{report.ram.totalGB} GB</div>
            <div className="sub">{report.ram.slots || '—'}</div>
          </div>
          {report.disks.map((d, i) => (
            <div className="card stagger" key={i}>
              <h3>{t('dash.storage')} {report.disks.length > 1 ? i + 1 : ''}</h3>
              <div className="big">{d.name}</div>
              <div className="sub">
                {d.sizeGB} GB · {d.type} {d.interfaceType && `(${d.interfaceType})`}
              </div>
            </div>
          ))}
          {report.volumes.map((v) => (
            <div className="card stagger" key={v.mount}>
              <h3>{t('dash.volume')} {v.mount}</h3>
              <div className="big">
                {v.usedGB} / {v.sizeGB} GB
              </div>
              <div className="bar-track">
                <div className={`bar-fill ${v.usePercent > 90 ? 'warn' : ''}`} style={{ width: `${v.usePercent}%` }} />
              </div>
            </div>
          ))}
          {report.battery.hasBattery && (
            <div className="card stagger">
              <h3>{t('dash.battery')}</h3>
              <div className="big">
                {report.battery.percent}% {report.battery.isCharging ? t('dash.charging') : ''}
              </div>
              <div className="sub">
                {report.battery.healthPercent != null && t('dash.batteryHealth', report.battery.healthPercent)}
              </div>
              <button className="btn" style={{ marginTop: 10 }} onClick={() => window.api.openBatteryReport()}>
                {t('dash.batteryReport')}
              </button>
            </div>
          )}
        </div>
      )}

      {!details && (
        <>
          <div className="section-title">{t('dash.details')}</div>
          <div className="toolbar">
            <button className="btn" disabled={detailsBusy} onClick={loadDetails}>
              {detailsBusy ? <span className="spinner" /> : '🔎'} {t('dash.loadDetails')}
            </button>
          </div>
        </>
      )}
      {details && (
        <>
          <div className="section-title">{t('dash.details')}</div>
          <div className="grid">
            {details.bios && (
              <div className="card stagger">
                <h3>{t('dash.bios')}</h3>
                <div className="big">{details.bios.version}</div>
                <div className="sub">
                  {details.bios.vendor} · {details.bios.date || '—'}
                  <br />
                  {details.bios.uefi ? 'UEFI ✓' : 'Legacy BIOS'} · {details.bios.secureBoot ? t('dash.secureBootOn') : t('dash.secureBootOff')}
                  {details.tpm?.present && ` · TPM ${details.tpm.version.split(',')[0]}`}
                </div>
              </div>
            )}
            {details.windows && (
              <div className="card stagger">
                <h3>{t('dash.windows')}</h3>
                <div className="big">
                  {details.windows.edition} {details.windows.displayVersion}
                </div>
                <div className="sub">
                  {t('dash.installedOn')} {details.windows.installDate || '—'} · {t('dash.uptime')} {details.windows.uptimeHours} h
                  <br />
                  {t('dash.antivirus')} : {details.windows.antivirus}
                  <br />
                  {t('dash.fastStartup')} {details.windows.fastStartup ? t('dash.on') : t('dash.off')} · {t('dash.vbs')}{' '}
                  {details.windows.hvci ? t('dash.on') : t('dash.off')}
                </div>
              </div>
            )}
            {details.ramSlots.map((r, i) => (
              <div className="card stagger" key={i}>
                <h3>RAM — {r.bank}</h3>
                <div className="big">
                  {r.sizeGB} GB @ {r.configuredMHz || '?'} MT/s
                </div>
                <div className="sub">
                  {r.maker} {r.part}
                  <br />
                  {r.xmpActive === true && <span style={{ color: 'var(--green)' }}>{t('dash.xmpOn')}</span>}
                  {r.xmpActive === false && (
                    <span style={{ color: 'var(--orange)' }}>{t('dash.xmpOff', r.configuredMHz, r.ratedMHz)}</span>
                  )}
                </div>
              </div>
            ))}
            {details.diskHealth.map((d, i) => (
              <div className="card stagger" key={i}>
                <h3>{t('dash.diskHealth')}</h3>
                <div className="big">{d.model}</div>
                <div className="sub">
                  {t('dash.state')} : {d.health}
                  {d.tempC != null && ` · ${d.tempC}°C`}
                  {d.powerOnHours != null && ` · ${d.powerOnHours} ${t('dash.hoursUse')}`}
                  {d.wearPercent != null && ` · ${t('dash.wear')} ${d.wearPercent}%`}
                </div>
              </div>
            ))}
            {details.displays.map((d, i) => (
              <div className="card stagger" key={i}>
                <h3>{t('dash.screen')} {details.displays.length > 1 ? i + 1 : ''} {d.main ? t('dash.main') : ''}</h3>
                <div className="big">
                  {d.resX}×{d.resY} @ {d.hz || '?'} Hz
                </div>
                <div className="sub">
                  {d.model} {d.connection && `· ${d.connection}`}
                  {d.hz > 0 && d.hz <= 60 && (
                    <>
                      <br />
                      <span style={{ color: 'var(--orange)' }}>{t('dash.check60hz')}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
