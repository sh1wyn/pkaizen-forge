import { useState } from 'react'
import { useToast } from '../components/Toast'

export default function Report(): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [lastPath, setLastPath] = useState<string | null>(null)
  const toast = useToast()

  const generate = async (): Promise<void> => {
    setBusy(true)
    const res = await window.api.generateReport()
    if (res.ok) {
      setLastPath(res.path ?? null)
      toast('Rapport généré et ouvert dans ton navigateur ✔', 'success')
    } else {
      toast(res.message || 'Échec de la génération', 'error')
    }
    setBusy(false)
  }

  return (
    <>
      <h1>Rapport</h1>
      <p className="subtitle">
        Génère un diagnostic complet de ta machine en HTML — comme un userdiag, mais local et sans compte. Parfait à
        envoyer à un pote (ou à recevoir du sien) pour diagnostiquer un PC à distance.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Contenu du rapport</h3>
        <div className="sub" style={{ lineHeight: 2 }}>
          🖥 Configuration complète (CPU, GPU, RAM, stockage, OS, batterie)
          <br />
          🩺 Analyse des bottlenecks et problèmes détectés
          <br />
          ⚡ État des optimisations appliquées
          <br />
          🧩 Check-up des pilotes par composant
          <br />⚠ Périphériques en erreur
        </div>
      </div>

      <div className="toolbar">
        <button className="btn primary" disabled={busy} onClick={generate}>
          {busy ? <span className="spinner" /> : '📋'} Générer le rapport
        </button>
      </div>

      {busy && (
        <div className="banner info">⏳ Analyse complète en cours — 30 secondes à 1 minute selon la machine…</div>
      )}
      {lastPath && !busy && (
        <div className="banner ok">✅ Rapport enregistré : {lastPath} — envoie ce fichier à qui tu veux.</div>
      )}
    </>
  )
}
