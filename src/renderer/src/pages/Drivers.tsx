import { useEffect, useState } from 'react'
import type { DriverEntry, WingetUpgrade, VendorLink, WuDriverUpdate, GpuDriverStatus, ProblemDevice } from '../../../shared/types'
import { cached } from '../lib/cache'
import { useToast } from '../components/Toast'

export default function Drivers({ isAdmin }: { isAdmin: boolean }): React.JSX.Element {
  const [links, setLinks] = useState<VendorLink[]>([])
  const [installed, setInstalled] = useState<DriverEntry[] | null>(null)
  const [gpuStatus, setGpuStatus] = useState<GpuDriverStatus[] | null>(null)
  const [problems, setProblems] = useState<ProblemDevice[] | null>(null)
  const [wu, setWu] = useState<WuDriverUpdate[] | null>(null)
  const [wuSearching, setWuSearching] = useState(false)
  const [wuSelected, setWuSelected] = useState<Set<string>>(new Set())
  const [wuInstalling, setWuInstalling] = useState(false)
  const [winget, setWinget] = useState<WingetUpgrade[] | null>(null)
  const [wingetBusy, setWingetBusy] = useState<string | null>(null)
  const [rebootNeeded, setRebootNeeded] = useState(false)
  const toast = useToast()

  useEffect(() => {
    cached('drv:links', () => window.api.getVendorLinks()).then(setLinks)
    cached('drv:installed', () => window.api.scanDrivers()).then(setInstalled)
    cached('drv:gpu', () => window.api.getGpuDriverStatus(), 10 * 60_000).then(setGpuStatus).catch(() => setGpuStatus([]))
    cached('drv:problems', () => window.api.getProblemDevices()).then(setProblems).catch(() => setProblems([]))
  }, [])

  const searchWu = async (): Promise<void> => {
    setWuSearching(true)
    try {
      const res = await window.api.searchDriverUpdates()
      setWu(res)
      setWuSelected(new Set(res.map((u) => u.id)))
      if (res.length === 0) toast('Aucun pilote en attente côté Windows Update — tout est à jour de ce côté ✔', 'success')
    } catch {
      toast('Recherche Windows Update impossible', 'error')
    }
    setWuSearching(false)
  }

  const installWu = async (): Promise<void> => {
    if (wuSelected.size === 0) return
    setWuInstalling(true)
    const res = await window.api.installDriverUpdates([...wuSelected])
    toast(res.message || (res.ok ? `${res.installed} pilote(s) installé(s) ✔` : 'Échec'), res.ok ? 'success' : 'error')
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
      <h1>Pilotes</h1>
      <p className="subtitle">
        Uniquement des sources officielles : Windows Update (pilotes signés Microsoft), winget et les sites
        constructeurs. Jamais de pilotes de sites tiers douteux.
      </p>

      {rebootNeeded && (
        <div className="banner ok">
          ✅ Pilotes installés — un redémarrage est nécessaire pour les activer.
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => window.api.rebootNow()}>
            Redémarrer maintenant
          </button>
        </div>
      )}

      <div className="section-title">🎮 Carte graphique — vérification officielle</div>
      {gpuStatus === null && (
        <div className="card" style={{ marginBottom: 14 }}>
          <span className="spinner" /> <span className="muted">Vérification auprès du constructeur…</span>
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
              {g.upToDate === false && <span className="badge old">MAJ dispo : {g.latest}</span>}
              {g.upToDate === true && <span className="badge okay">À jour ({g.installed})</span>}
            </div>
            <div className="row-desc">{g.note}</div>
          </div>
          <button className="btn" onClick={() => window.api.openExternal(g.downloadUrl)}>
            {g.upToDate === false ? '⬇ Télécharger' : 'Vérifier ↗'}
          </button>
        </div>
      ))}

      {problems && problems.length > 0 && (
        <>
          <div className="section-title">⚠ Périphériques avec problème de pilote</div>
          {problems.map((p) => (
            <div className="row stagger" key={p.deviceId} style={{ borderLeft: '3px solid var(--red)' }}>
              <div className="row-info">
                <div className="row-title">
                  {p.name}
                  {p.missingDriver && <span className="badge old">Pilote manquant</span>}
                </div>
                <div className="row-desc">
                  {p.problem} (code {p.code}) — lance une recherche Windows Update ci-dessous ou va sur le site de ton
                  constructeur.
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      {problems && problems.length === 0 && (
        <div className="banner ok">✅ Aucun périphérique en erreur — tous tes composants ont un pilote fonctionnel.</div>
      )}

      <div className="section-title">🔄 Mise à jour automatique (Windows Update)</div>
      {!isAdmin && (
        <div className="banner warn">⚠ L’installation automatique de pilotes nécessite de lancer l’app en administrateur.</div>
      )}
      <div className="toolbar">
        <button className="btn primary" disabled={wuSearching || wuInstalling} onClick={searchWu}>
          {wuSearching ? <span className="spinner" /> : '🔍'} Rechercher les pilotes manquants
        </button>
        {wu && wu.length > 0 && (
          <button className="btn primary" disabled={wuInstalling || !isAdmin || wuSelected.size === 0} onClick={installWu}>
            {wuInstalling ? <span className="spinner" /> : '⬇'} Installer la sélection ({wuSelected.size})
          </button>
        )}
      </div>
      {wuSearching && (
        <div className="card" style={{ marginBottom: 14 }}>
          <span className="spinner" /> <span className="muted">Interrogation de Windows Update (peut prendre 1-2 min)…</span>
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
              {u.provider} {u.driverClass && `· ${u.driverClass}`} {u.sizeMB > 0 && `· ${u.sizeMB} Mo`}
            </div>
          </div>
        </div>
      ))}

      <div className="section-title">🏷 Sources officielles pour ta machine</div>
      {links.map((l) => (
        <div className="row stagger" key={l.url}>
          <div className="row-info">
            <div className="row-title">{l.label}</div>
            <div className="row-desc">{l.why}</div>
          </div>
          <button className="btn" onClick={() => window.api.openExternal(l.url)}>
            Ouvrir ↗
          </button>
        </div>
      ))}

      <div className="section-title">📦 Logiciels & outils constructeurs (winget)</div>
      <div className="toolbar">
        <button className="btn" onClick={loadWinget}>
          🔍 Chercher les mises à jour winget
        </button>
      </div>
      {winget !== null && winget.length === 0 && <div className="banner ok">✅ Tous tes logiciels winget sont à jour.</div>}
      {winget?.map((w) => (
        <div className="row stagger" key={w.id}>
          <div className="row-info">
            <div className="row-title">{w.name}</div>
            <div className="row-desc">
              {w.current} → <b>{w.available}</b> · {w.id}
            </div>
          </div>
          <button className="btn" disabled={wingetBusy != null} onClick={() => upgradeOne(w.id)}>
            {wingetBusy === w.id ? <span className="spinner" /> : 'Mettre à jour'}
          </button>
        </div>
      ))}

      <div className="section-title">🗂 Pilotes installés (les plus vieux en premier)</div>
      {installed === null && (
        <div className="card">
          <span className="spinner" /> <span className="muted">Scan des pilotes…</span>
        </div>
      )}
      {installed && (
        <table>
          <thead>
            <tr>
              <th>Périphérique</th>
              <th>Fournisseur</th>
              <th>Version</th>
              <th>Date</th>
              <th>Âge</th>
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
                    <span className="badge old">{d.ageYears} ans</span>
                  ) : (
                    <span className="badge okay">{d.ageYears < 1 ? 'récent' : `${d.ageYears} an(s)`}</span>
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
