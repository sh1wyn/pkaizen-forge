import { useEffect, useState } from 'react'
import type { StartupItem } from '../../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../components/Toast'

export default function Startup(): React.JSX.Element {
  const { t } = useI18n()
  const [items, setItems] = useState<StartupItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()

  const SCOPE_LABEL: Record<StartupItem['scope'], string> = {
    user: t('start.user'),
    machine: t('start.machine'),
    folder: t('start.folder')
  }

  const load = async (): Promise<void> => {
    setItems(await window.api.getStartupItems())
  }

  useEffect(() => {
    load()
  }, [])

  const toggle = async (item: StartupItem): Promise<void> => {
    setBusy(item.name)
    const res = await window.api.setStartupEnabled(item.name, !item.enabled)
    if (res.ok) {
      toast(item.enabled ? t('start.wontRun', item.name) : t('start.reenabled', item.name), 'success')
      await load()
    } else {
      toast(res.message || 'KO', 'error')
    }
    setBusy(null)
  }

  return (
    <>
      <h1>{t('start.title')}</h1>
      <p className="subtitle">{t('start.subtitle')}</p>

      <div className="banner info">{t('start.tip')}</div>

      {items === null && (
        <div className="card">
          <span className="spinner" /> <span className="muted">{t('start.reading')}</span>
        </div>
      )}

      {items?.map((item) => (
        <div className="row stagger" key={`${item.scope}-${item.name}`}>
          <div className="row-info">
            <div className="row-title">
              {item.name}
              <span className="badge reboot">{SCOPE_LABEL[item.scope]}</span>
              {!item.enabled && <span className="badge old">{t('start.disabled')}</span>}
            </div>
            <div className="row-desc" style={{ wordBreak: 'break-all' }}>
              {item.command}
            </div>
          </div>
          {busy === item.name ? (
            <span className="spinner" />
          ) : (
            <button
              className={`switch ${item.enabled ? 'on' : ''}`}
              disabled={!item.canToggle || busy != null}
              title={item.canToggle ? '' : t('start.taskMgr')}
              onClick={() => toggle(item)}
            />
          )}
        </div>
      ))}
    </>
  )
}
