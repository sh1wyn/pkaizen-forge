import { useEffect, useState } from 'react'
import type { StartupItem } from '../../../shared/types'
import { useToast } from '../components/Toast'

const SCOPE_LABEL: Record<StartupItem['scope'], string> = {
  user: 'Utilisateur',
  machine: 'Système',
  folder: 'Dossier démarrage'
}

export default function Startup(): React.JSX.Element {
  const [items, setItems] = useState<StartupItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()

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
      toast(item.enabled ? `« ${item.name} » ne se lancera plus au démarrage.` : `« ${item.name} » réactivé.`, 'success')
      await load()
    } else {
      toast(res.message || 'Échec', 'error')
    }
    setBusy(null)
  }

  return (
    <>
      <h1>Démarrage</h1>
      <p className="subtitle">
        Moins d’applis au démarrage = boot plus rapide et plus de RAM/CPU pour tes jeux. Les éléments désactivés
        sont sauvegardés et réactivables en un clic.
      </p>

      <div className="banner info">
        💡 Désactive ce que tu ne reconnais pas utile (launchers, updaters…). Les éléments « Système » se gèrent via le
        Gestionnaire des tâches → onglet Applications de démarrage.
      </div>

      {items === null && (
        <div className="card">
          <span className="spinner" /> <span className="muted">Lecture des éléments de démarrage…</span>
        </div>
      )}

      {items?.map((item) => (
        <div className="row stagger" key={`${item.scope}-${item.name}`}>
          <div className="row-info">
            <div className="row-title">
              {item.name}
              <span className="badge reboot">{SCOPE_LABEL[item.scope]}</span>
              {!item.enabled && <span className="badge old">Désactivé</span>}
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
              title={item.canToggle ? '' : 'Gérable uniquement via le Gestionnaire des tâches'}
              onClick={() => toggle(item)}
            />
          )}
        </div>
      ))}
    </>
  )
}
