import { useState, useSyncExternalStore } from 'react'
import type { ActionResult, DriverEntry, DriverInstaller, ProblemDevice, WuDriverUpdate, WuInstallResult } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

let state: {
  options: DriverInstaller[] | null
  installed: DriverEntry[] | null
  problems: ProblemDevice[] | null
  updates: WuDriverUpdate[] | null
  selected: string[]
  busy: string | null
  error: string | null
  installerResult: ActionResult | null
  installResult: WuInstallResult | null
} = { options: null, installed: null, problems: null, updates: null, selected: [], busy: null, error: null, installerResult: null, installResult: null }

const listeners = new Set<() => void>()
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const update = (patch: Partial<typeof state>): void => {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export default function Drivers({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const job = useSyncExternalStore(subscribe, () => state)
  const [filter, setFilter] = useState('')
  const toast = useToast()
  const busy = job.busy !== null

  const scan = async (): Promise<void> => {
    if (state.busy) return
    update({ busy: 'scan', error: null, options: null, installed: null, problems: null })
    try {
      update({ options: await window.api.getDriverInstallers() })
      update({ installed: await window.api.scanDrivers() })
      update({ problems: await window.api.getProblemDevices() })
    } catch (error) {
      update({ error: String(error) })
    } finally {
      update({ busy: null })
    }
  }

  const launch = async (id: string): Promise<void> => {
    if (state.busy) return
    update({ busy: id, installerResult: null, error: null })
    try {
      update({ installerResult: await window.api.launchDriverInstaller(id) })
    } catch (error) {
      update({ error: String(error) })
    } finally {
      update({ busy: null })
    }
  }

  const search = async (): Promise<void> => {
    if (state.busy) return
    update({ busy: 'search', updates: null, selected: [], error: null })
    try {
      const updates = await window.api.searchDriverUpdates()
      update({ updates, selected: updates.map((candidate) => candidate.id) })
    } catch (error) {
      update({ error: String(error) })
    } finally {
      update({ busy: null })
    }
  }

  const install = async (): Promise<void> => {
    if (state.busy || !isAdmin || !state.selected.length) return
    const selected = [...state.selected]
    update({ busy: 'install', error: null, installResult: null })
    try {
      update({ installResult: await window.api.installDriverUpdates(selected), updates: null, selected: [], installed: null, problems: null })
    } catch (error) {
      update({ error: String(error), updates: null, selected: [] })
    } finally {
      update({ busy: null })
    }
  }

  const matching = job.installed?.filter((driver) => `${driver.device} ${driver.provider} ${driver.className}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <>
      <h1>{t('drv.title')}</h1>
      <p className="subtitle">{t('drv.subtitle')}</p>
      <div className="toolbar">
        <button className="btn primary" disabled={busy} onClick={scan}>
          {job.busy === 'scan' && <span className="spinner" />} {t('drv.scanAll')}
        </button>
      </div>
      {job.error && <div className="banner warn" role="alert">{job.error}</div>}

      <section aria-label={t('drv.assistants')}>
        <div className="section-title">{t('drv.assistants')}</div>
        {job.options === null && !busy && <div className="banner info">{t('drv.pressScan')}</div>}
        {job.options?.length === 0 && <div className="banner info">{t('drv.noAssistant')}</div>}
        {job.options?.map((option) => (
          <div className="row" key={option.id}>
            <div className="row-info">
              <div className="row-title">{option.name}</div>
              <div className="row-desc">{option.hardware}</div>
              <div className="row-desc">{option.note}</div>
            </div>
            <button className="btn primary" disabled={busy} onClick={() => launch(option.id)}>
              {job.busy === option.id && <span className="spinner" />}
              {t(option.kind === 'store' ? 'drv.storeAssistant' : 'drv.launchAssistant')}
            </button>
          </div>
        ))}
        {job.busy && !['scan', 'search', 'install', 'asus'].includes(job.busy) && (
          <div className="banner info" role="status">{t('drv.preparing')}</div>
        )}
        {job.installerResult && (
          <div className={`banner ${job.installerResult.ok ? 'info' : 'warn'}`} role="status">{job.installerResult.message}</div>
        )}
      </section>

      <section aria-label={t('drv.wuSection')}>
        <div className="section-title">{t('drv.wuSection')}</div>
        {!isAdmin && (
          <div className="banner warn">
            {t('drv.wuAdmin')}
            <button className="btn" disabled={busy} onClick={async () => {
              try {
                const result = await window.api.relaunchAdmin()
                if (!result.ok) toast(result.message || '', 'error')
              } catch (error) { toast(String(error), 'error') }
            }}>{t('opt.relaunchAdmin')}</button>
          </div>
        )}
        <div className="toolbar">
          <button className="btn" disabled={busy} onClick={search}>
            {job.busy === 'search' && <span className="spinner" />} {t('drv.wuSearch')}
          </button>
          {!!job.updates?.length && (
            <button className="btn primary" disabled={busy || !isAdmin || job.selected.length === 0} onClick={install}>
              {t('drv.wuInstall', job.selected.length)}
            </button>
          )}
        </div>
        {(job.busy === 'search' || job.busy === 'install') && (
          <div className="banner info" role="status">
            <span className="spinner" /> {t(job.busy === 'install' ? 'drv.wuInstalling' : 'drv.wuSearching')}
          </div>
        )}
        {job.updates?.length === 0 && <div className="banner info" role="status">{t('drv.wuNone')}</div>}
        {job.updates?.map((candidate) => (
          <label className="row" key={candidate.id}>
            <input type="checkbox" className="checkbox" checked={job.selected.includes(candidate.id)} disabled={busy}
              onChange={() => update({ selected: state.selected.includes(candidate.id)
                ? state.selected.filter((id) => id !== candidate.id) : [...state.selected, candidate.id] })} />
            <div className="row-info">
              <div className="row-title">{candidate.title}</div>
              <div className="row-desc">{candidate.provider} · {candidate.driverClass} {candidate.sizeMB > 0 && `· ${candidate.sizeMB} MB`}</div>
            </div>
          </label>
        ))}
        {job.installResult && (
          <div role="status">
            <div className={`banner ${job.installResult.ok ? 'ok' : 'warn'}`}>{job.installResult.message}</div>
            {job.installResult.results?.map((result) => (
              <div className="row" key={result.id} style={{ borderLeft: `3px solid var(--${result.ok ? 'green' : 'red'})` }}>
                <div className="row-info">
                  <div className="row-title">{result.title}</div>
                  <div className="row-desc">{result.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {job.installResult?.rebootRequired && (
          <div className="banner warn">
            {t('drv.rebootBanner')}
            <button className="btn" disabled={busy} onClick={() => window.api.rebootNow().catch((error) => toast(String(error), 'error'))}>
              {t('app.rebootNow')}
            </button>
          </div>
        )}
      </section>

      {!!job.problems?.length && (
        <section>
          <div className="section-title">{t('drv.problems')}</div>
          {job.problems.map((problem) => (
            <div className="row" key={problem.deviceId}>
              <div className="row-info">
                <div className="row-title">{problem.name} {problem.missingDriver && <span className="badge old">{t('drv.missingDriver')}</span>}</div>
                <div className="row-desc">{problem.problem} ({problem.code})</div>
              </div>
            </div>
          ))}
        </section>
      )}
      {job.installed && (
        <section>
          <div className="section-title">{t('drv.installedSection')}</div>
          <input type="search" aria-label={t('drv.device')} placeholder={t('drv.device')} value={filter} onChange={(event) => setFilter(event.target.value)} />
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>{t('drv.device')}</th><th>{t('drv.provider')}</th><th>{t('drv.version')}</th><th>Date</th></tr></thead>
              <tbody>{matching?.map((driver, index) => (
                <tr key={`${driver.device}-${index}`}><td>{driver.device}</td><td>{driver.provider}</td><td>{driver.version}</td><td>{driver.date || '-'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}