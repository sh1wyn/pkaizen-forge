import { useEffect, useMemo, useState } from 'react'
import type { TweakInfo, TweakState, SystemReport, TweakRelevance } from '../../../shared/types'
import { cached } from '../lib/cache'
import { useI18n, type StrKey } from '../lib/i18n'
import { useToast } from '../components/Toast'

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
  const toast = useToast()

  const refresh = async (): Promise<void> => {
    const s = await window.api.getTweakStates()
    setStates(Object.fromEntries(s.map((x) => [x.id, x])))
  }

  useEffect(() => {
    window.api.listTweaks().then(setTweaks)
    cached('report', () => window.api.getSystemReport()).then(setReport)
    cached('relevance', () => window.api.getTweakRelevance()).then((r) =>
      setRelevance(Object.fromEntries(r.map((x) => [x.id, x])))
    )
    refresh()
  }, [])

  const score = useMemo(() => {
    const reco = tweaks.filter((tw) => tw.recommended)
    if (reco.length === 0) return 0
    const applied = reco.filter((tw) => states[tw.id]?.applied).length
    return Math.round((applied / reco.length) * 100)
  }, [tweaks, states])

  const toggle = async (tw: TweakInfo): Promise<void> => {
    if (busy) return
    setBusy(tw.id)
    const applied = states[tw.id]?.applied
    const res = applied ? await window.api.revertTweak(tw.id) : await window.api.applyTweak(tw.id)
    toast(res.message || (res.ok ? 'OK' : 'KO'), res.ok ? 'success' : 'error')
    await refresh()
    setBusy(null)
  }

  const applyAllRecommended = async (): Promise<void> => {
    if (busy) return
    setBusy('__all__')
    let okCount = 0
    for (const tw of tweaks.filter((x) => x.recommended && !states[x.id]?.applied)) {
      if (tw.needsAdmin && !isAdmin) continue
      if (tw.laptopWarning && report?.isLaptop) continue
      const res = await window.api.applyTweak(tw.id)
      if (res.ok) okCount++
    }
    await refresh()
    toast(`${okCount} ${t('opt.applied')}`, 'success')
    setBusy(null)
  }

  const restorePoint = async (): Promise<void> => {
    setRestoreBusy(true)
    const res = await window.api.createRestorePoint()
    toast(res.message || '', res.ok ? 'success' : 'error')
    setRestoreBusy(false)
  }

  const cats = [...new Set(tweaks.map((tw) => tw.category))]

  return (
    <>
      <h1>{t('opt.title')}</h1>
      <p className="subtitle">{t('opt.subtitle')}</p>

      {!isAdmin && (
        <div className="banner warn">
          {t('opt.adminBanner')}
          <button
            className="btn primary"
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
            onClick={async () => {
              const r = await window.api.relaunchAdmin()
              if (!r.ok && r.message) toast(r.message, 'info')
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

      <div className="toolbar">
        <button className="btn primary" disabled={busy != null} onClick={applyAllRecommended}>
          {busy === '__all__' ? <span className="spinner" /> : '⚡'} {t('opt.applyAll')}
        </button>
        <button className="btn" disabled={restoreBusy} onClick={restorePoint}>
          {restoreBusy ? <span className="spinner" /> : '🛟'} {t('opt.restorePoint')}
        </button>
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
                      disabled={lockedAdmin || busy != null}
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
