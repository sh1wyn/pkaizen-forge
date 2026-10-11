import { useEffect, useMemo, useRef, useState } from 'react'
import type { TweakInfo, TweakState, SystemReport, TweakRelevance } from '../../../shared/types'
import { cached } from '../lib/cache'
import { useI18n, type StrKey } from '../lib/i18n'
import { useToast } from '../components/Toast'
import { exclusionFor, profileSelection, type Exclusion, type OptimizationProfile } from '../lib/optimization'

let operationPending = false
const OPERATION_EVENT = 'pkaizen:optimization-operation'
const EXCLUSION_KEY: Record<Exclusion, StrKey> = {
  unknown: 'plan.unknown', applied: 'plan.applied', admin: 'plan.admin', laptop: 'plan.laptop'
}
function setOperationPending(value: boolean): void {
  operationPending = value
  window.dispatchEvent(new Event(OPERATION_EVENT))
}

const CAT_KEY: Record<string, StrKey> = {
  performance: 'cat.performance',
  latence: 'cat.latence',
  gaming: 'cat.gaming',
  systeme: 'cat.systeme',
  avance: 'cat.avance'
}

export default function Optimize({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [tweaks, setTweaks] = useState<TweakInfo[]>([])
  const [states, setStates] = useState<Record<string, TweakState>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [report, setReport] = useState<SystemReport | null>(null)
  const [relevance, setRelevance] = useState<Record<string, TweakRelevance>>({})
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selection, setSelection] = useState<string[]>([])
  const [sharedBusy, setSharedBusy] = useState(operationPending)
  const [summary, setSummary] = useState('')
  const [needsRestart, setNeedsRestart] = useState(false)
  const stop = useRef(false)
  const toast = useToast()

  const refresh = async (): Promise<void> => {
    try {
      const s = await window.api.getTweakStates()
      setStates(Object.fromEntries(s.map((x) => [x.id, x])))
    } catch (error) {
      setStates({})
      throw error
    }
  }

  useEffect(() => {
    stop.current = false
    const onOperation = (): void => setSharedBusy(operationPending)
    window.addEventListener(OPERATION_EVENT, onOperation)
    window.api.listTweaks().then(setTweaks).catch((error) => toast(String(error), 'error'))
    cached('report', () => window.api.getSystemReport()).then(setReport).catch((error) => toast(String(error), 'error'))
    cached('relevance', () => window.api.getTweakRelevance()).then((r) =>
      setRelevance(Object.fromEntries(r.map((x) => [x.id, x])))
    ).catch((error) => toast(String(error), 'error'))
    void refresh().catch((error) => toast(String(error), 'error'))
    return () => {
      stop.current = true
      window.removeEventListener(OPERATION_EVENT, onOperation)
    }
  }, [])

  const score = useMemo(() => {
    const reco = tweaks.filter((tw) => tw.recommended && !(tw.laptopWarning && report?.isLaptop))
    if (reco.length === 0) return 0
    const applied = reco.filter((tw) => states[tw.id]?.applied).length
    return Math.round((applied / reco.length) * 100)
  }, [tweaks, states, report])

  const ready = report !== null && tweaks.length > 0
  const isLaptop = report?.isLaptop ?? null
  const selected = tweaks.filter((tw) => selection.includes(tw.id) &&
    exclusionFor(tw, states[tw.id], isAdmin, isLaptop) === null)
  const locked = sharedBusy || busy !== null || restoreBusy

  const chooseProfile = (profile: OptimizationProfile): void => {
    setSelection(profileSelection(profile, tweaks, states, isAdmin, isLaptop))
    setSummary('')
  }

  const refreshAll = async (): Promise<void> => {
    if (operationPending) return
    setBusy('__refresh__')
    try {
      const hardware = await window.api.getSystemReport()
      setReport(hardware)
      await refresh()
    } catch (error) { toast(String(error), 'error') }
    finally { setBusy(null) }
  }

  const toggle = async (tw: TweakInfo): Promise<void> => {
    if (busy || operationPending || !ready || !states[tw.id]?.available || (tw.needsAdmin && !isAdmin)) return
    setOperationPending(true)
    setBusy(tw.id)
    setErrors((previous) => ({ ...previous, [tw.id]: '' }))
    try {
      const applied = states[tw.id]?.applied
      const res = applied ? await window.api.revertTweak(tw.id) : await window.api.applyTweak(tw.id)
      if (res.ok && tw.needsReboot) setNeedsRestart(true)
      if (!res.ok) setErrors((previous) => ({ ...previous, [tw.id]: res.message || 'KO' }))
      toast(res.message || (res.ok ? 'OK' : 'KO'), res.ok ? 'success' : 'error')
      await refresh()
    } catch (error) {
      setErrors((previous) => ({ ...previous, [tw.id]: String(error) }))
      toast(String(error), 'error')
    } finally {
      setOperationPending(false)
      setBusy(null)
    }
  }

  const applySelection = async (): Promise<void> => {
    if (busy || operationPending || !ready || selected.length === 0) return
    setOperationPending(true)
    setBusy('__all__')
    stop.current = false
    let okCount = 0
    let failures = 0
    const pending = selected
    try {
      const fresh = await window.api.getTweakStates()
      const freshStates = Object.fromEntries(fresh.map((state) => [state.id, state]))
      setStates(freshStates)
      for (const tw of pending) {
        if (stop.current) break
        if (exclusionFor(tw, freshStates[tw.id], isAdmin, isLaptop) !== null) continue
        setErrors((previous) => ({ ...previous, [tw.id]: '' }))
        try {
          const res = await window.api.applyTweak(tw.id)
          if (res.ok) {
            okCount++
            setSelection((previous) => previous.filter((id) => id !== tw.id))
            if (tw.needsReboot) setNeedsRestart(true)
          }
          else {
            failures++
            setErrors((previous) => ({ ...previous, [tw.id]: res.message || 'KO' }))
          }
        } catch (error) {
          failures++
          setErrors((previous) => ({ ...previous, [tw.id]: String(error) }))
        }
      }
      await refresh()
      const message = t('plan.summary', okCount, failures, pending.length - okCount - failures)
      setSummary(message)
      toast(message, failures ? 'error' : 'info')
    } catch (error) {
      setStates({})
      toast(String(error), 'error')
    } finally {
      setOperationPending(false)
      setBusy(null)
    }
  }

  const restorePoint = async (): Promise<void> => {
    if (operationPending) return
    setOperationPending(true)
    setRestoreBusy(true)
    try {
      const res = await window.api.createRestorePoint()
      toast(res.message || '', res.ok ? 'success' : 'error')
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setOperationPending(false)
      setRestoreBusy(false)
    }
  }

  const cats = [...new Set(tweaks.map((tw) => tw.category))]

  return (
    <>
      <h1>{t('opt.title')}</h1>
      <p className="subtitle">{t('plan.note')}</p>

      {!isAdmin && (
        <div className="banner warn">
          {t('opt.adminBanner')}
          <button
            className="btn primary"
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
            onClick={async () => {
              try {
                const result = await window.api.relaunchAdmin()
                if (!result.ok && result.message) toast(result.message, 'info')
              } catch (error) {
                toast(String(error), 'error')
              }
            }}
          >
            🛡 {t('opt.relaunchAdmin')}
          </button>
        </div>
      )}
      {report?.isLaptop && <div className="banner info">{t('opt.laptopBanner')}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="score-ring">
          <div className="score-num">{score}%</div>
          <div style={{ flex: 1 }}>
            <div className="big">{t('opt.score')}</div>
            <div className="sub">{t('opt.scoreSub')}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${score}%` }} />
            </div>
          </div>
        </div>
      </div>

      <section className="card gaming-block">
        <h2>{t('plan.title')}</h2>
        <p>{t('plan.profiles')}</p>
        <div className="toolbar">
          <button className="btn" disabled={locked || !ready} onClick={() => chooseProfile('gaming')}>{t('plan.gaming')}</button>
          <button className="btn" disabled={locked || !ready} onClick={() => chooseProfile('desktop')}>{t('plan.desktop')}</button>
          <button className="btn" disabled={locked || !ready} onClick={() => chooseProfile('recommended')}>{t('plan.recommended')}</button>
          <button className="btn" disabled={locked} onClick={() => setSelection([])}>{t('plan.clear')}</button>
        </div>
        <p role="status">{selected.length ? t('plan.preview', selected.length, selected.filter((tw) => tw.needsReboot).length) : t('plan.empty')}</p>
      </section>
      {sharedBusy && !busy && !restoreBusy && <p className="banner info">{t('plan.inProgress')}</p>}
      {needsRestart && <p className="banner info">{t('plan.reboot')}</p>}
      {summary && <p className="banner info" role="status">{summary}</p>}
      <div className="toolbar">
        <button className="btn primary" disabled={locked || !ready || !selected.length} onClick={applySelection}>
          {busy === '__all__' ? <span className="spinner" /> : '⚡'} {t('plan.apply', selected.length)}
        </button>
        {busy === '__all__' && <button className="btn" onClick={() => { stop.current = true }}>{t('plan.stop')}</button>}
        <button className="btn" disabled={locked || !isAdmin} onClick={restorePoint}>
          {restoreBusy ? <span className="spinner" /> : '🛟'} {t('opt.restorePoint')}
        </button>
        <button className="btn" disabled={locked} onClick={() => void refreshAll()}>{t('plan.refresh')}</button>
      </div>

      {cats.map((cat) => (
        <div key={cat}>
          <div className="section-title">{CAT_KEY[cat] ? t(CAT_KEY[cat]) : cat}</div>
          {tweaks
            .filter((tw) => tw.category === cat)
            .map((tw) => {
              const st = states[tw.id]
              const lockedAdmin = tw.needsAdmin && !isAdmin
              const rel = relevance[tw.id]
              const excluded = exclusionFor(tw, st, isAdmin, isLaptop)
              return (
                <div className="row stagger" key={tw.id}>
                  <div className="row-info">
                    <div className="row-title">
                      {tw.name}
                      {rel?.impact === 'high' && <span className="badge okay">{t('opt.impactHigh')}</span>}
                      {rel?.impact === 'medium' && <span className="badge reboot">{t('opt.impactMedium')}</span>}
                      {rel?.impact === 'low' && <span className="badge admin">{t('opt.impactLow')}</span>}
                      {tw.needsAdmin && <span className="badge admin">{t('opt.admin')}</span>}
                      {tw.needsReboot && <span className="badge reboot">{t('opt.reboot')}</span>}
                      {tw.laptopWarning && report?.isLaptop && <span className="badge laptop">{t('opt.battery')}</span>}
                    </div>
                    <div className="row-desc">{tw.description}</div>
                    {excluded && <div className="row-desc">{t(EXCLUSION_KEY[excluded])}</div>}
                    {!st?.applied && <label className="row-desc">
                      <input type="checkbox" checked={selection.includes(tw.id) && excluded === null}
                        disabled={locked || excluded !== null}
                        onChange={(event) => setSelection((previous) => event.target.checked
                          ? [...previous, tw.id] : previous.filter((id) => id !== tw.id))} />
                      {' '}{t('plan.select', tw.name)}
                    </label>}
                    {errors[tw.id] && (
                      <div role="alert" className="row-desc" style={{ color: 'var(--red)', userSelect: 'text' }}>
                        {errors[tw.id]}
                      </div>
                    )}
                    {rel && (
                      <div className="row-desc" style={{ marginTop: 4, color: 'var(--accent2)' }}>
                        📌 {rel.reason}
                      </div>
                    )}
                  </div>
                  {busy === tw.id ? (
                    <span className="spinner" />
                  ) : (
                    <button
                      className={`switch ${st?.applied ? 'on' : ''}`}
                      disabled={lockedAdmin || locked || !ready || !st?.available}
                      aria-label={`${st?.applied ? t('opt.disable') : t('opt.enable')}: ${tw.name}`}
                      title={lockedAdmin ? t('opt.relaunchAdmin') : st?.applied ? t('opt.disable') : t('opt.enable')}
                      onClick={() => toggle(tw)}
                    />
                  )}
                </div>
              )
            })}
        </div>
      ))}
    </>
  )
}
