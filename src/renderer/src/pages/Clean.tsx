import { useEffect, useState } from 'react'
import type { CleanTarget, CleanResult } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

export default function Clean({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [targets, setTargets] = useState<CleanTarget[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [lastResult, setLastResult] = useState<CleanResult[] | null>(null)
  const toast = useToast()

  const analyze = async (): Promise<void> => {
    setAnalyzing(true)
    try {
      const t2 = await window.api.previewClean()
      setTargets(t2)
      setSelected(new Set(t2.filter((x) => !x.needsAdmin || isAdmin).map((x) => x.id)))
    } catch {
      toast(t('clean.errorAnalyze'), 'error')
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
      toast(t('clean.freed', freed >= 1024 ? (freed / 1024).toFixed(1) + ' GB' : Math.round(freed) + ' MB'), 'success')
      await analyze()
    } catch {
      toast(t('clean.error'), 'error')
    }
    setBusy(false)
  }

  const totalSelectedMB = targets
    ? targets.filter((x) => selected.has(x.id)).reduce((a, x) => a + (x.sizeMB ?? 0), 0)
    : 0

  return (
    <>
      <h1>{t('clean.title')}</h1>
      <p className="subtitle">{t('clean.subtitle')}</p>

      <div className="toolbar">
        <button className="btn" disabled={analyzing || busy} onClick={analyze}>
          {analyzing ? <span className="spinner" /> : '🔍'} {t('clean.analyze')}
        </button>
        <button className="btn primary" disabled={busy || analyzing || selected.size === 0} onClick={run}>
          {busy ? <span className="spinner" /> : '🧹'} {t('clean.cleanSel')}
          {totalSelectedMB > 0 &&
            ` (~${totalSelectedMB >= 1024 ? (totalSelectedMB / 1024).toFixed(1) + ' GB' : Math.round(totalSelectedMB) + ' MB'})`}
        </button>
      </div>

      {targets === null && (
        <div className="card">
          <span className="spinner" /> <span className="muted">{t('clean.computing')}</span>
        </div>
      )}

      {targets?.map((x) => {
        const locked = x.needsAdmin && !isAdmin
        const res = lastResult?.find((r) => r.id === x.id)
        return (
          <div className="row stagger" key={x.id}>
            <input
              type="checkbox"
              className="checkbox"
              checked={selected.has(x.id) && !locked}
              disabled={locked || busy}
              onChange={() => toggleSel(x.id)}
            />
            <div className="row-info">
              <div className="row-title">
                {x.name}
                {x.needsAdmin && <span className="badge admin">{t('opt.admin')}</span>}
                {res?.ok && <span className="badge okay">−{res.freedMB >= 1024 ? (res.freedMB / 1024).toFixed(1) + ' GB' : Math.round(res.freedMB) + ' MB'}</span>}
              </div>
              <div className="row-desc">{x.description}</div>
            </div>
            <div className="big" style={{ whiteSpace: 'nowrap' }}>
              {x.sizeMB == null
                ? '—'
                : x.sizeMB >= 1024
                  ? `${(x.sizeMB / 1024).toFixed(1)} GB`
                  : `${Math.round(x.sizeMB)} MB`}
            </div>
          </div>
        )
      })}
    </>
  )
}
