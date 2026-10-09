import { useEffect, useMemo, useState } from 'react'
import type { TweakInfo, TweakState, SystemReport, TweakRelevance } from '../../../shared/types'
import { cached } from '../lib/cache'
import { useToast } from '../components/Toast'

const CAT_LABEL: Record<string, string> = {
  performance: '⚡ Performances',
  latence: '🎯 Latence & précision',
  gaming: '🎮 Gaming',
  systeme: '🖥 Système',
  avance: '🧪 Avancé (optionnel)'
}

export default function Optimize({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
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
    const reco = tweaks.filter((t) => t.recommended)
    if (reco.length === 0) return 0
    const applied = reco.filter((t) => states[t.id]?.applied).length
    return Math.round((applied / reco.length) * 100)
  }, [tweaks, states])

  const toggle = async (t: TweakInfo): Promise<void> => {
    if (busy) return
    setBusy(t.id)
    const applied = states[t.id]?.applied
    const res = applied ? await window.api.revertTweak(t.id) : await window.api.applyTweak(t.id)
    toast(res.message || (res.ok ? 'OK' : 'Échec'), res.ok ? 'success' : 'error')
    await refresh()
    setBusy(null)
  }

  const applyAllRecommended = async (): Promise<void> => {
    if (busy) return
    setBusy('__all__')
    let okCount = 0
    for (const t of tweaks.filter((x) => x.recommended && !states[x.id]?.applied)) {
      if (t.needsAdmin && !isAdmin) continue
      if (t.laptopWarning && report?.isLaptop) continue
      const res = await window.api.applyTweak(t.id)
      if (res.ok) okCount++
    }
    await refresh()
    toast(`${okCount} optimisation(s) appliquée(s) ✔`, 'success')
    setBusy(null)
  }

  const restorePoint = async (): Promise<void> => {
    setRestoreBusy(true)
    const res = await window.api.createRestorePoint()
    toast(res.message || '', res.ok ? 'success' : 'error')
    setRestoreBusy(false)
  }

  const cats = [...new Set(tweaks.map((t) => t.category))]

  return (
    <>
      <h1>Optimiser</h1>
      <p className="subtitle">
        Tweaks réels et réversibles — FPS, latence, réactivité. Aucun risque anticheat : rien ne touche Secure Boot,
        TPM ou les pilotes kernel.
      </p>

      {!isAdmin && (
        <div className="banner warn">
          ⚠ Certains tweaks demandent les droits administrateur. Ferme Pkaizen Forge et relance-le en clic droit →
          « Exécuter en tant qu’administrateur » pour tout débloquer.
        </div>
      )}
      {report?.isLaptop && (
        <div className="banner info">
          💻 PC portable détecté : les tweaks marqués « batterie » sont déconseillés sur batterie — applique-les
          branché sur secteur.
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="score-ring">
          <div className="score-num">{score}%</div>
          <div style={{ flex: 1 }}>
            <div className="big">Score d’optimisation</div>
            <div className="sub">Pourcentage des tweaks recommandés actuellement actifs.</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${score}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn primary" disabled={busy != null} onClick={applyAllRecommended}>
          {busy === '__all__' ? <span className="spinner" /> : '⚡'} Tout optimiser (recommandés)
        </button>
        <button className="btn" disabled={restoreBusy} onClick={restorePoint}>
          {restoreBusy ? <span className="spinner" /> : '🛟'} Créer un point de restauration
        </button>
      </div>

      {cats.map((cat) => (
        <div key={cat}>
          <div className="section-title">{CAT_LABEL[cat] || cat}</div>
          {tweaks
            .filter((t) => t.category === cat)
            .map((t) => {
              const st = states[t.id]
              const lockedAdmin = t.needsAdmin && !isAdmin
              const rel = relevance[t.id]
              return (
                <div className="row stagger" key={t.id}>
                  <div className="row-info">
                    <div className="row-title">
                      {t.name}
                      {rel?.impact === 'high' && <span className="badge okay">Impact élevé sur ta config</span>}
                      {rel?.impact === 'medium' && <span className="badge reboot">Impact moyen</span>}
                      {rel?.impact === 'low' && <span className="badge admin">Faible impact chez toi</span>}
                      {t.needsAdmin && <span className="badge admin">Admin</span>}
                      {t.needsReboot && <span className="badge reboot">Redémarrage</span>}
                      {t.laptopWarning && report?.isLaptop && <span className="badge laptop">Batterie</span>}
                    </div>
                    <div className="row-desc">{t.description}</div>
                    {rel && (
                      <div className="row-desc" style={{ marginTop: 4, color: 'var(--accent2)' }}>
                        📌 {rel.reason}
                      </div>
                    )}
                  </div>
                  {busy === t.id ? (
                    <span className="spinner" />
                  ) : (
                    <button
                      className={`switch ${st?.applied ? 'on' : ''}`}
                      disabled={lockedAdmin || busy != null}
                      title={lockedAdmin ? 'Relance en administrateur' : st?.applied ? 'Désactiver' : 'Activer'}
                      onClick={() => toggle(t)}
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
