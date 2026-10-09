import { useEffect, useState } from 'react'
import { ToastProvider, useToast } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider, useI18n, type StrKey, type Lang } from './lib/i18n'
import Dashboard from './pages/Dashboard'
import Optimize from './pages/Optimize'
import Clean from './pages/Clean'
import Drivers from './pages/Drivers'
import Startup from './pages/Startup'
import Network from './pages/Network'
import Report from './pages/Report'
import Benchmark from './pages/Benchmark'
import Browser from './pages/Browser'

type Page = 'dashboard' | 'optimize' | 'clean' | 'drivers' | 'startup' | 'network' | 'report' | 'benchmark' | 'browser'

const NAV: { id: Page; labelKey: StrKey; icon: string }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: '📊' },
  { id: 'optimize', labelKey: 'nav.optimize', icon: '⚡' },
  { id: 'benchmark', labelKey: 'nav.benchmark', icon: '🧪' },
  { id: 'clean', labelKey: 'nav.clean', icon: '🧹' },
  { id: 'drivers', labelKey: 'nav.drivers', icon: '🔧' },
  { id: 'startup', labelKey: 'nav.startup', icon: '🚀' },
  { id: 'network', labelKey: 'nav.network', icon: '🌐' },
  { id: 'browser', labelKey: 'nav.browser', icon: '🧭' },
  { id: 'report', labelKey: 'nav.report', icon: '📋' }
]

function Shell(): React.JSX.Element {
  const { lang, setLang, t } = useI18n()
  const toast = useToast()
  const [page, setPage] = useState<Page>('dashboard')
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingReboot, setPendingReboot] = useState(false)
  const [version, setVersion] = useState('')
  const [updBusy, setUpdBusy] = useState(false)

  useEffect(() => {
    window.api.isAdmin().then(setIsAdmin)
    window.api.checkPendingReboot().then(setPendingReboot)
    window.api.getVersion().then(setVersion)
  }, [])

  const checkUpdates = async (): Promise<void> => {
    setUpdBusy(true)
    const r = await window.api.checkUpdates()
    if (r.status === 'uptodate') toast(t('app.upToDate', r.current), 'success')
    else if (r.status === 'available') toast(t('app.updateFound', r.newVersion ?? ''), 'info')
    else if (r.status === 'dev') toast(t('app.updateDev'), 'info')
    else toast(r.message || 'Update check failed', 'error')
    setUpdBusy(false)
  }

  return (
    <>
      <div className="titlebar">⚒ Pkaizen Forge</div>
      <aside className="sidebar">
        <div className="logo">⚒ Pkaizen Forge</div>
        <div className="lang-switch">
          <select
            className="lang-select"
            value={lang}
            title={t('common.lang')}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            <option value="en">🇬🇧 English</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="es">🇪🇸 Español</option>
            <option value="ru">🇷🇺 Русский</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="pt">🇵🇹 Português</option>
            <option value="it">🇮🇹 Italiano</option>
          </select>
        </div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-btn ${page === n.id ? 'active' : ''}`}
            onClick={() => setPage(n.id)}
          >
            <span>{n.icon}</span> {t(n.labelKey)}
          </button>
        ))}
        <div className="sidebar-footer">
          <button className="btn" style={{ width: '100%', marginBottom: 10, fontSize: 12 }} disabled={updBusy} onClick={checkUpdates}>
            {updBusy ? <span className="spinner" /> : '🔄'} {t('app.checkUpdates')}{version ? ` (v${version})` : ''}
          </button>
          {isAdmin ? t('sidebar.admin') : t('sidebar.user')}
          <br />
          {t('sidebar.tagline')}
        </div>
      </aside>
      <main className="main" key={`${page}-${lang}`}>
        <div className="page-anim">
          {pendingReboot && (
            <div className="banner info">
              {t('app.rebootPending')}
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => window.api.rebootNow()}>
                {t('app.rebootNow')}
              </button>
            </div>
          )}
          <ErrorBoundary key={`${page}-${lang}`}>
            {page === 'dashboard' && <Dashboard />}
            {page === 'optimize' && <Optimize isAdmin={isAdmin} />}
            {page === 'clean' && <Clean isAdmin={isAdmin} />}
            {page === 'drivers' && <Drivers isAdmin={isAdmin} />}
            {page === 'startup' && <Startup />}
            {page === 'network' && <Network isAdmin={isAdmin} />}
            {page === 'report' && <Report />}
            {page === 'benchmark' && <Benchmark />}
            {page === 'browser' && <Browser />}
          </ErrorBoundary>
        </div>
      </main>
    </>
  )
}

export default function App(): React.JSX.Element {
  return (
    <I18nProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </I18nProvider>
  )
}
