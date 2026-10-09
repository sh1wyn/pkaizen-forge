import { useEffect, useState } from 'react'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Optimize from './pages/Optimize'
import Clean from './pages/Clean'
import Drivers from './pages/Drivers'
import Startup from './pages/Startup'
import Network from './pages/Network'
import Report from './pages/Report'
import Benchmark from './pages/Benchmark'

type Page = 'dashboard' | 'optimize' | 'clean' | 'drivers' | 'startup' | 'network' | 'report' | 'benchmark'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Diagnostic', icon: '📊' },
  { id: 'optimize', label: 'Optimiser', icon: '⚡' },
  { id: 'benchmark', label: 'Benchmark', icon: '🧪' },
  { id: 'clean', label: 'Nettoyage', icon: '🧹' },
  { id: 'drivers', label: 'Pilotes', icon: '🔧' },
  { id: 'startup', label: 'Démarrage', icon: '🚀' },
  { id: 'network', label: 'Réseau', icon: '🌐' },
  { id: 'report', label: 'Rapport', icon: '📋' }
]

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingReboot, setPendingReboot] = useState(false)

  useEffect(() => {
    window.api.isAdmin().then(setIsAdmin)
    window.api.checkPendingReboot().then(setPendingReboot)
  }, [])

  return (
    <ToastProvider>
      <aside className="sidebar">
        <div className="logo">⚒ Pkaizen Forge</div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-btn ${page === n.id ? 'active' : ''}`}
            onClick={() => setPage(n.id)}
          >
            <span>{n.icon}</span> {n.label}
          </button>
        ))}
        <div className="sidebar-footer">
          {isAdmin ? '🛡 Mode administrateur' : '👤 Mode utilisateur'}
          <br />
          100% réversible · compatible anticheat (Vanguard, EAC, BattlEye)
        </div>
      </aside>
      <main className="main" key={page}>
        <div className="page-anim">
          {pendingReboot && (
            <div className="banner info">
              🔄 Un redémarrage est en attente pour finaliser des changements.
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => window.api.rebootNow()}>
                Redémarrer maintenant
              </button>
            </div>
          )}
          <ErrorBoundary key={page}>
            {page === 'dashboard' && <Dashboard />}
            {page === 'optimize' && <Optimize isAdmin={isAdmin} />}
            {page === 'clean' && <Clean isAdmin={isAdmin} />}
            {page === 'drivers' && <Drivers isAdmin={isAdmin} />}
            {page === 'startup' && <Startup />}
            {page === 'network' && <Network />}
            {page === 'report' && <Report />}
            {page === 'benchmark' && <Benchmark />}
          </ErrorBoundary>
        </div>
      </main>
    </ToastProvider>
  )
}
