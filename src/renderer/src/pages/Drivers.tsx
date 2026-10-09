import { useEffect, useState } from 'react'
import type { DriverEntry, WingetUpgrade, VendorLink, WuDriverUpdate, GpuDriverStatus, ProblemDevice, ComponentCheck } from '../../../shared/types'
import { cached } from '../lib/cache'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

export default function Drivers({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [links, setLinks] = useState<VendorLink[]>([])
  const [installed, setInstalled] = useState<DriverEntry[] | null>(null)
  const [gpuStatus, setGpuStatus] = useState<GpuDriverStatus[] | null>(null)
  const [problems, setProblems] = useState<ProblemDevice[] | null>(null)
  const [checklist, setChecklist] = useState<ComponentCheck[] | null>(null)
  const [wu, setWu] = useState<WuDriverUpdate[] | null>(null)
  const [wuSearching, setWuSearching] = useState(false)
  const [wuSelected, setWuSelected] = useState<Set<string>>(new Set())
  const [wuInstalling, setWuInstalling] = useState(false)
  const [winget, setWinget] = useState<WingetUpgrade[] | null>(null)
  const [wingetBusy, setWingetBusy] = useState<string | null>(null)
  const [rebootNeeded, setRebootNeeded] = useState(false)
  const [nvBusy, setNvBusy] = useState(false)
  const [nvProgress, setNvProgress] = useState(0)
  const [dsaBusy, setDsaBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const off = window.api.onNvidiaProgress(setNvProgress)
    return off
  }, [])

  const installNvidia = async (url: string): Promise<void> => {
    setNvBusy(true)
    setNvProgress(0)
    const res = await window.api.installNvidiaDriver(url)
    toast(res.message || '', res.ok ? 'success' : 'error')
    setNvBusy(false)
  }

  const installDsa = async (): Promise<void> => {
    setDsaBusy(true)
    const res = await window.api.installIntelDsa()
    toast(res.message || '', res.ok ? 'success' : 'error')
    setDsaBusy(false)
  }

  useEffect(() => {
    cached('drv:links', () => window.api.getVendorLinks()).then(setLinks)
  }, [])

  const [scanBusy, setScanBusy] = useState(false)
  const scanAll = async (): Promise<void> => {
    setScanBusy(true)
    // Séquentiel volontaire : aucun pic de charge sur les petits PC.
    try {
      setGpuStatus(await cached('drv:gpu', () => window.api.getGpuDriverStatus(), 10 * 60_000))
    } catch {
      setGpuStatus([])
    }
    try {
      setProblems(await cached('drv:problems', () => window.api.getProblemDevices()))
    } catch {
      setProblems([])
    }
    try {
      setChecklist(await cached('drv:checklist', () => window.api.getComponentChecklist(), 10 * 60_000))
    } catch {
      setChecklist([])
    }
    try {
      setInstalled(await cached('drv:installed', () => window.api.scanDrivers()))
    } catch {
      setInstalled([])
    }
    setScanBusy(false)
  }

  const searchWu = async (): Promise<void> => {
    setWuSearching(true)
    try {
      const res = await window.api.searchDriverUpdates()
      setWu(res)
      setWuSelected(new Set(res.map((u) => u.id)))
      if (res.length === 0) toast(t('drv.wuNone'), 'success')
    } catch {
      toast(t('drv.wuError'), 'error')
    }
    setWuSearching(false)
  }

  const installWu = async (): Promise<void> => {
    if (wuSelected.size === 0) return
    setWuInstalling(true)
    const res = await window.api.installDriverUpdates([...wuSelected])
    toast(res.message || (res.ok ? `${res.installed} OK ✔` : 'KO'), res.ok ? 'success' : 'error')
    if (res.rebootRequired) setRebootNeeded(true)
    if (res.ok) await searchWu()
    setWuInstalling(false)
  }

  const loadWinget = async (): Promise<void> => {
    setWinget(null)
    const res = await window.api.getWingetUpgrades()
    setWinget(res)
  }

  const upgradeOne = async (id: string): Promise<void> => {
    setWingetBusy(id)
    const res = await window.api.wingetUpgradePackage(id)
    toast(res.message || '', res.ok ? 'success' : 'error')
    if (res.ok) setWinget((w) => w?.filter((x) => x.id !== id) ?? null)
    setWingetBusy(null)
  }

  return (
    <>
      <h1>{t('drv.title')}</h1>
      <p className="subtitle">{t('drv.subtitle')}</p>

      <div className="toolbar">
        <button className="btn primary" disabled={scanBusy} onClick={scanAll}>
          {scanBusy ? <span className="spinner" /> : '🔍'} {t('drv.scanAll')}
        </button>
      </div>

      {rebootNeeded && (
        <div className="banner ok">
          {t('drv.rebootBanner')}
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => window.api.rebootNow()}>
            {t('app.rebootNow')}
          </button>
        </div>
      )}

      <div className="section-title">{t('drv.gpuSection')}</div>
      {gpuStatus === null && !scanBusy && <div className="banner info">{t('drv.pressScan')}</div>}
      {gpuStatus === null && scanBusy && (
        <div className="card" style={{ marginBottom: 14 }}>
          <span className="spinner" /> <span className="muted">{t('drv.gpuChecking')}</span>
        </div>
      )}
      {gpuStatus?.map((g) => (
        <div
          className="row stagger"
          key={g.model}
          style={{ borderLeft: `3px solid ${g.upToDate === false ? 'var(--orange)' : g.upToDate ? 'var(--green)' : 'var(--border)'}` }}
        >
          <div className="row-info">
            <div className="row-title">
              {g.model}
              {g.upToDate === false && <span className="badge old">{t('drv.updAvail', g.latest ?? '')}</span>}
              {g.upToDate === true && <span className="badge okay">{t('drv.upToDate', g.installed ?? '')}</span>}
            </div>
            <div className="row-desc">{g.note}</div>
            {nvBusy && g.vendor === 'nvidia' && (
              <div className="bar-track" style={{ marginTop: 8 }}>
                <div className="bar-fill" style={{ width: `${nvProgress}%` }} />
              </div>
            )}
          </div>
          {g.vendor === 'nvidia' && g.upToDate === false ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" disabled={nvBusy} onClick={() => installNvidia(g.downloadUrl)}>
                {nvBusy ? <span className="spinner" /> : '⬇'} {t('drv.install')} ({nvProgress > 0 && nvBusy ? `${nvProgress}%` : t('drv.directNvidia')})
              </button>
              <button className="btn" onClick={() => window.api.openExternal('https://www.nvidia.com/drivers/')}>
                {t('drv.page')}
              </button>
            </div>
          ) : g.vendor === 'intel' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" disabled={dsaBusy} onClick={installDsa}>
                {dsaBusy ? <span className="spinner" /> : '⬇'} {t('drv.installDsa')}
              </button>
              <button className="btn" onClick={() => window.api.openExternal(g.downloadUrl)}>
                {t('drv.page')}
              </button>
            </div>
          ) : (
            <button className="btn" onClick={() => window.api.openExternal(g.downloadUrl)}>
              {g.upToDate === false ? t('drv.download') : t('drv.verify')}
            </button>
          )}
        </div>
      ))}

      {problems && problems.length > 0 && (
        <>
          <div className="section-title">{t('drv.problems')}</div>
          {problems.map((p) => (
            <div className="row stagger" key={p.deviceId} style={{ borderLeft: '3px solid var(--red)' }}>
              <div className="row-info">
                <div className="row-title">
                  {p.name}
                  {p.missingDriver && <span className="badge old">{t('drv.missingDriver')}</span>}
                </div>
                <div className="row-desc">{t('drv.problemDesc', p.problem, p.code)}</div>
              </div>
            </div>
          ))}
        </>
      )}
      {problems && problems.length === 0 && <div className="banner ok">{t('drv.noProblems')}</div>}

      <div className="section-title">{t('drv.checklist')}</div>
      <div className="banner info">{t('drv.checklistTip')}</div>
      {checklist === null && scanBusy && (
        <div className="card" style={{ marginBottom: 14 }}>
          <span className="spinner" /> <span className="muted">{t('drv.inventory')}</span>
        </div>
      )}
      {checklist
        ?.filter((c) => c.component !== 'Carte graphique' && c.component !== 'Graphics card')
        .map((c, i) => (
        <div
          className="row stagger"
          key={`${c.component}-${i}`}
          style={{
            borderLeft: `3px solid ${
              c.status === 'update' ? 'var(--red)' : c.status === 'probably-update' ? 'var(--orange)' : c.status === 'ok' ? 'var(--green)' : 'var(--border)'
            }`
          }}
        >
          <div className="row-info">
            <div className="row-title">
              <span className="badge reboot">{c.component}</span>
              {c.name}
              {c.status === 'update' && <span className="badge old">{t('drv.majAvail')}</span>}
              {c.status === 'probably-update' && <span className="badge admin">{t('drv.probablyOld')}</span>}
              {c.status === 'ok' && <span className="badge okay">{t('drv.ok')}</span>}
            </div>
            <div className="row-desc">
              {c.installed && (
                <>
                  {t('drv.installed')} : <b>{c.installed}</b>
                  {c.installedDate && ` (${c.installedDate})`} —{' '}
                </>
              )}
              {c.advice}
            </div>
          </div>
          <button className="btn" onClick={() => window.api.openExternal(c.officialUrl)}>
            {t('drv.official')}
          </button>
        </div>
      ))}

      <div className="section-title">{t('drv.wuSection')}</div>
      {!isAdmin && <div className="banner warn">{t('drv.wuAdmin')}</div>}
      <div className="toolbar">
        <button className="btn primary" disabled={wuSearching || wuInstalling} onClick={searchWu}>
          {wuSearching ? <span className="spinner" /> : '🔍'} {t('drv.wuSearch')}
        </button>
        {wu && wu.length > 0 && (
          <button className="btn primary" disabled={wuInstalling || !isAdmin || wuSelected.size === 0} onClick={installWu}>
            {wuInstalling ? <span className="spinner" /> : '⬇'} {t('drv.wuInstall', wuSelected.size)}
          </button>
        )}
      </div>
      {wuSearching && (
        <div className="card" style={{ marginBottom: 14 }}>
          <span className="spinner" /> <span className="muted">{t('drv.wuSearching')}</span>
        </div>
      )}
      {wu?.map((u) => (
        <div className="row stagger" key={u.id}>
          <input
            type="checkbox"
            className="checkbox"
            checked={wuSelected.has(u.id)}
            disabled={wuInstalling}
            onChange={() =>
              setWuSelected((s) => {
                const n = new Set(s)
                if (n.has(u.id)) n.delete(u.id)
                else n.add(u.id)
                return n
              })
            }
          />
          <div className="row-info">
            <div className="row-title">{u.title}</div>
            <div className="row-desc">
              {u.provider} {u.driverClass && `· ${u.driverClass}`} {u.sizeMB > 0 && `· ${u.sizeMB} MB`}
            </div>
          </div>
        </div>
      ))}

      <div className="section-title">{t('drv.linksSection')}</div>
      {links.map((l) => (
        <div className="row stagger" key={l.url}>
          <div className="row-info">
            <div className="row-title">{l.label}</div>
            <div className="row-desc">{l.why}</div>
          </div>
          <button className="btn" onClick={() => window.api.openExternal(l.url)}>
            {t('drv.open')}
          </button>
        </div>
      ))}

      <div className="section-title">{t('drv.wingetSection')}</div>
      <div className="toolbar">
        <button className="btn" onClick={loadWinget}>
          {t('drv.wingetSearch')}
        </button>
      </div>
      {winget !== null && winget.length === 0 && <div className="banner ok">{t('drv.wingetAllOk')}</div>}
      {winget?.map((w) => (
        <div className="row stagger" key={w.id}>
          <div className="row-info">
            <div className="row-title">{w.name}</div>
            <div className="row-desc">
              {w.current} → <b>{w.available}</b> · {w.id}
            </div>
          </div>
          <button className="btn" disabled={wingetBusy != null} onClick={() => upgradeOne(w.id)}>
            {wingetBusy === w.id ? <span className="spinner" /> : t('drv.update')}
          </button>
        </div>
      ))}

      <div className="section-title">{t('drv.installedSection')}</div>
      {installed === null && scanBusy && (
        <div className="card">
          <span className="spinner" /> <span className="muted">{t('drv.scanning')}</span>
        </div>
      )}
      {installed && (
        <table>
          <thead>
            <tr>
              <th>{t('drv.device')}</th>
              <th>{t('drv.provider')}</th>
              <th>{t('drv.version')}</th>
              <th>Date</th>
              <th>{t('drv.age')}</th>
            </tr>
          </thead>
          <tbody>
            {installed.slice(0, 40).map((d, i) => (
              <tr key={i}>
                <td>{d.device}</td>
                <td className="muted">{d.provider}</td>
                <td className="muted">{d.version}</td>
                <td className="muted">{d.date || '—'}</td>
                <td>
                  {d.ageYears == null ? (
                    '—'
                  ) : d.ageYears >= 2 ? (
                    <span className="badge old">{d.ageYears} {t('drv.years')}</span>
                  ) : (
                    <span className="badge okay">{d.ageYears < 1 ? t('drv.recent') : `${d.ageYears} ${t('drv.years')}`}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
