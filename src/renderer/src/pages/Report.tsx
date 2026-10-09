import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

export default function Report(): React.JSX.Element {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const toast = useToast()

  const generate = async (): Promise<void> => {
    setBusy(true)
    setLastPath(null)
    try {
      const res = await window.api.generateReport()
      if (res.ok) {
        setLastPath(res.path ?? null)
        toast(t('rep.done'), 'success')
      } else {
        toast(res.message || t('rep.fail'), 'error')
      }
    } catch (error) {
      toast(String(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>{t('rep.title')}</h1>
      <p className="subtitle">{t('rep.subtitle')}</p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>{t('rep.content')}</h3>
        <div className="sub" style={{ lineHeight: 2, whiteSpace: 'pre-line' }}>{t('rep.list')}</div>
      </div>

      <div className="toolbar">
        <button className="btn primary" disabled={busy} onClick={generate}>
          {busy ? <span className="spinner" /> : '📋'} {t('rep.generate')}
        </button>
      </div>

      {busy && <div className="banner info">{t('rep.generating')}</div>}
      {lastPath && !busy && <div className="banner ok">{t('rep.saved', lastPath)}</div>}
    </>
  )
}
