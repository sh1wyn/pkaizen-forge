import { useEffect, useState } from 'react'
import type { CleanTarget, CleanResult } from '../../../shared/types'
import { useToast } from '../components/Toast'

export default function Clean({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const [targets, setTargets] = useState<CleanTarget[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [lastResult, setLastResult] = useState<CleanResult[] | null>(null)
  const toast = useToast()

  const analyze = async (): Promise<void> => {
    setAnalyzing(true)
    try {
      const t = await window.api.previewClean()
      setTargets(t)
      setSelected(new Set(t.filter((x) => !x.needsAdmin || isAdmin).map((x) => x.id)))
    } catch {
      toast('Erreur pendant l\u2019analyse', 'error')
    }
    setAnalyzing(false)
  }

  useEffect(() => {
    analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSel = (id: string): void => {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const run = async (): Promise<void> => {
    if (selected.size === 0) return
    setBusy(true)
    setLastResult(null)
    try {
      const res = await window.api.runClean([...selected])
      setLastResult(res)
      const freed = res.reduce((a, r) => a + r.freedMB, 0)
      toast(`Nettoyage terminé : ${freed >= 1024 ? (freed / 1024).toFixed(1) + ' Go' : Math.round(freed) + ' Mo'} libérés ✔`, 'success')
      await analyze()
    } catch {
      toast('Erreur pendant le nettoyage', 'error')
    }
    setBusy(false)
  }

  const totalSelectedMB = targets
    ? targets.filter((t) => selected.has(t.id)).reduce((a, t) => a + (t.sizeMB ?? 0), 0)
    : 0

  return (
    <>
      <h1>Nettoyage</h1>
      <p className="subtitle">
        Supprime uniquement des fichiers régénérables (temporaires, caches). Jamais tes documents, jamais tes jeux.
      </p>

      <div className="toolbar">
        <button className="btn" disabled={analyzing || busy} onClick={analyze}>
          {analyzing ? <span className="spinner" /> : '🔍'} Analyser
        </button>
        <button className="btn primary" disabled={busy || analyzing || selected.size === 0} onClick={run}>
          {busy ? <span className="spinner" /> : '🧹'} Nettoyer la sélection
          {totalSelectedMB > 0 &&
            ` (~${totalSelectedMB >= 1024 ? (totalSelectedMB / 1024).toFixed(1) + ' Go' : Math.round(totalSelectedMB) + ' Mo'})`}
        </button>
      </div>

      {targets === null && (
        <div className="card">
          <span className="spinner" /> <span className="muted">Calcul des tailles…</span>
        </div>
      )}

      {targets?.map((t) => {
        const locked = t.needsAdmin && !isAdmin
        const res = lastResult?.find((r) => r.id === t.id)
        return (
          <div className="row stagger" key={t.id}>
            <input
              type="checkbox"
              className="checkbox"
              checked={selected.has(t.id) && !locked}
              disabled={locked || busy}
              onChange={() => toggleSel(t.id)}
            />
            <div className="row-info">
              <div className="row-title">
                {t.name}
                {t.needsAdmin && <span className="badge admin">Admin</span>}
                {res?.ok && <span className="badge okay">−{res.freedMB >= 1024 ? (res.freedMB / 1024).toFixed(1) + ' Go' : Math.round(res.freedMB) + ' Mo'}</span>}
              </div>
              <div className="row-desc">{t.description}</div>
            </div>
            <div className="big" style={{ whiteSpace: 'nowrap' }}>
              {t.sizeMB == null
                ? '—'
                : t.sizeMB >= 1024
                  ? `${(t.sizeMB / 1024).toFixed(1)} Go`
                  : `${Math.round(t.sizeMB)} Mo`}
            </div>
          </div>
        )
      })}
    </>
  )
}
