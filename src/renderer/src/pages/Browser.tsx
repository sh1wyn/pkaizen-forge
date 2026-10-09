import { useEffect, useState } from 'react'
import type { BrowserReport } from '../../../shared/types'
import { cached, invalidate } from '../lib/cache'
import { useI18n, type StrKey } from '../lib/i18n'
import { useToast } from '../components/Toast'

interface Rec {
  id: string
  name: string
  whyKey: StrKey
  installable: boolean
  perfStars: number
  privacyStars: number
}

const RECS: Rec[] = [
  { id: 'brave', name: 'Brave', whyKey: 'browser.whyBrave', installable: true, perfStars: 5, privacyStars: 5 },
  { id: 'edge', name: 'Microsoft Edge', whyKey: 'browser.whyEdge', installable: false, perfStars: 5, privacyStars: 3 },
  { id: 'firefox', name: 'Mozilla Firefox', whyKey: 'browser.whyFirefox', installable: true, perfStars: 4, privacyStars: 5 }
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

const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n)

export default function Browser(): React.JSX.Element {
  const { t } = useI18n()
  const [report, setReport] = useState<BrowserReport | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [detectBusy, setDetectBusy] = useState(false)
  const toast = useToast()

  const detect = async (): Promise<void> => {
    setDetectBusy(true)
    try {
      setReport(await cached('browser', () => window.api.getBrowserReport(), 60_000))
    } catch {
      setReport(null)
    }
    setDetectBusy(false)
  }

  const install = async (id: string): Promise<void> => {
    setBusy(id)
    const res = await window.api.installBrowser(id)
    toast(res.message || '', res.ok ? 'success' : 'error')
    if (res.ok) {
      invalidate('browser')
      setReport(await window.api.getBrowserReport())
    }
    setBusy(null)
  }

  const defaultName = report?.defaultBrowser ? NAME_MAP[report.defaultBrowser] || report.defaultBrowser : null
  const heavy = report?.running.find((r) => r.ramMB > 1500)

  return (
    <>
      <h1>{t('browser.title')}</h1>
      <p className="subtitle">{t('browser.subtitle')}</p>

      {report === null && (
        <div className="toolbar">
          <button className="btn primary" disabled={detectBusy} onClick={detect}>
            {detectBusy ? <span className="spinner" /> : '🧭'} {t('browser.scan')}
          </button>
        </div>
      )}

      {report && (
        <div className="grid" style={{ marginBottom: 18 }}>
          <div className="card stagger">
            <h3>{t('browser.current')}</h3>
            <div className="big">{defaultName || '—'}</div>
            <div className="sub">{t('browser.default')}</div>
          </div>
          {report.running.length > 0 ? (
            report.running.map((r) => (
              <div className="card stagger" key={r.id}>
                <h3>{t('browser.runningNow')}</h3>
                <div className="big">{r.name}</div>
                <div className="sub" style={r.ramMB > 1500 ? { color: 'var(--orange)' } : undefined}>
                  {t('browser.ramUse', r.ramMB)}
                </div>
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
      {RECS.map((rec) => {
        const isInstalled = report?.installed.includes(rec.id)
        const isDefault = report?.defaultBrowser === rec.id
        return (
          <div className="row stagger" key={rec.id}>
            <div className="row-info">
              <div className="row-title">
                {rec.name}
                {isDefault && <span className="badge okay">{t('browser.isDefault')}</span>}
                {isInstalled && !isDefault && <span className="badge reboot">{t('browser.installed')}</span>}
              </div>
              <div className="row-desc">{t(rec.whyKey)}</div>
              <div className="row-desc" style={{ marginTop: 4 }}>
                <span className="muted">{t('browser.perf')} </span>
                <span style={{ color: 'var(--accent2)' }}>{stars(rec.perfStars)}</span>
                <span className="muted"> · {t('browser.privacy')} </span>
                <span style={{ color: 'var(--green)' }}>{stars(rec.privacyStars)}</span>
              </div>
            </div>
            {rec.installable && !isInstalled && (
              <button className="btn primary" disabled={busy != null} onClick={() => install(rec.id)}>
                {busy === rec.id ? <span className="spinner" /> : '⬇'} {t('browser.install')}
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
