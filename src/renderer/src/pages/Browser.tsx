import { useEffect, useRef, useState } from 'react'
import type { BrowserReport } from '../../../shared/types'
import { invalidate } from '../lib/cache'
import { useI18n, type StrKey } from '../lib/i18n'
import { useToast } from '../components/Toast'

interface Rec {
  id: string
  name: string
  whyKey?: StrKey
  installable: boolean
}

const RECS: Rec[] = [
  { id: 'brave', name: 'Brave', whyKey: 'browser.whyBrave', installable: true },
  { id: 'edge', name: 'Microsoft Edge', whyKey: 'browser.whyEdge', installable: false },
  { id: 'firefox', name: 'Mozilla Firefox', whyKey: 'browser.whyFirefox', installable: true },
  { id: 'vivaldi', name: 'Vivaldi', whyKey: 'browser.whyVivaldi', installable: true }
]

const NAME_MAP: Record<string, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  brave: 'Brave',
  opera: 'Opera',
  operagx: 'Opera GX',
  vivaldi: 'Vivaldi',
  librewolf: 'LibreWolf'
}

export default function Browser(): React.JSX.Element {
  const { t } = useI18n()
  const [report, setReport] = useState<BrowserReport | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [detectBusy, setDetectBusy] = useState(false)
  const detecting = useRef(false)
  const toast = useToast()

  const detect = async (): Promise<void> => {
    if (detecting.current) return
    detecting.current = true
    setDetectBusy(true)
    try {
      setReport(await window.api.getBrowserReport())
    } catch (error) {
      setReport(null)
      toast(String(error), 'error')
    } finally {
      detecting.current = false
      setDetectBusy(false)
    }
  }

  const hasReport = report !== null
  useEffect(() => {
    if (!hasReport) return
    const refresh = (): void => { if (!document.hidden) void detect() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [hasReport])

  const setDefault = async (id: string): Promise<void> => {
    setBusy(id)
    try {
      const result = await window.api.openBrowserDefaults(id)
      toast(result.message || '', result.ok ? 'info' : 'error')
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const install = async (id: string): Promise<void> => {
    setBusy(id)
    try {
      const res = await window.api.installBrowser(id)
      toast(res.message || '', res.ok ? 'success' : 'error')
      if (res.ok) {
        invalidate('browser')
        setReport(await window.api.getBrowserReport())
      }
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  const defaultName = report?.defaultBrowser ? NAME_MAP[report.defaultBrowser] || report.defaultBrowser : null
  const isDefaultBrowser = (id: string): boolean => report?.defaults
    ? report.defaults.http === id && report.defaults.https === id
    : report?.defaultBrowser === id
  const heavy = report?.running.find((r) => r.ramMB > 1500)
  const recommendations: Rec[] = [...RECS, ...(report?.installed ?? [])
    .filter((id) => !RECS.some((rec) => rec.id === id))
    .map((id) => ({ id, name: NAME_MAP[id] || id, installable: false }))]

  return (
    <>
      <h1>{t('browser.title')}</h1>
      <p className="subtitle">{t('browser.subtitle')}</p>

        <div className="toolbar">
          <button className="btn primary" disabled={detectBusy || busy !== null} onClick={detect}>
            {detectBusy ? <span className="spinner" /> : '🧭'} {t('browser.scan')}
          </button>
        </div>

      {report && (
        <div className="grid" style={{ marginBottom: 18 }}>
          <div className="card stagger">
            <h3>{t('browser.current')}</h3>
            <div className="big" style={{ fontSize: 22, overflowWrap: 'anywhere' }}>{defaultName || '—'}</div>
            <div className="sub">{t('browser.default')}</div>
            {report.defaults && (
              <div className="sub">HTTP: {NAME_MAP[report.defaults.http || ''] || '—'}<br />HTTPS: {NAME_MAP[report.defaults.https || ''] || '—'}</div>
            )}
          </div>
          {report.running.length > 0 ? (
            report.running.map((r) => (
              <div className="card stagger" key={r.id}>
                <h3>{t('browser.runningNow')}</h3>
                <div className="big" style={{ fontSize: 22, overflowWrap: 'anywhere' }}>{r.name}</div>
                <div className="sub" style={r.ramMB > 1500 ? { color: 'var(--orange)' } : undefined}>
                  {t('browser.ramUse', r.ramMB)}
                </div>
                {isDefaultBrowser(r.id) ? <span className="badge okay">{t('browser.isDefault')}</span> :
                  report.installed.includes(r.id) && <button className="btn" disabled={busy !== null || detectBusy} onClick={() => void setDefault(r.id)}>
                    {t('browser.setDefault')}
                  </button>}
              </div>
            ))
          ) : (
            <div className="card stagger">
              <h3>{t('browser.runningNow')}</h3>
              <div className="big">—</div>
              <div className="sub">{t('browser.noneRunning')}</div>
            </div>
          )}
        </div>
      )}

      {heavy && <div className="banner warn">{t('browser.heavyWarn', heavy.name, heavy.ramMB)}</div>}
      <div className="banner info">{t('browser.tip')}</div>

      <div className="section-title">{t('browser.recs')}</div>
      {recommendations.map((rec) => {
        const isInstalled = report?.installed.includes(rec.id)
        const isDefault = isDefaultBrowser(rec.id)
        return (
          <div className="row stagger" key={rec.id}>
            <div className="row-info">
              <div className="row-title">
                {rec.name}
                {isDefault && <span className="badge okay">{t('browser.isDefault')}</span>}
                {isInstalled && !isDefault && <span className="badge reboot">{t('browser.installed')}</span>}
              </div>
              {rec.whyKey && <div className="row-desc">{t(rec.whyKey)}</div>}
            </div>
            {isInstalled && !isDefault && (
              <button className="btn" disabled={busy !== null || detectBusy} onClick={() => setDefault(rec.id)}>
                {t('browser.setDefault')}
              </button>
            )}
            {rec.installable && !isInstalled && (
              <button className="btn primary" disabled={busy != null || detectBusy || !report} onClick={() => install(rec.id)}>
                {busy === rec.id ? <span className="spinner" /> : '⬇'} {t('browser.install')}
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
