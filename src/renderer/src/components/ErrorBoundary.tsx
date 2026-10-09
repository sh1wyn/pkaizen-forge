import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[Pkaizen] UI error:', error)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h1 style={{ marginBottom: 12 }}>😵 Oups, un problème d’affichage</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
            {this.state.error.message || 'Erreur inconnue'} — tes réglages système ne sont pas affectés.
          </p>
          <button className="btn primary" onClick={() => window.location.reload()}>
            🔄 Recharger l’interface
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
