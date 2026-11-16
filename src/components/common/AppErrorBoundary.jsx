import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Application rendering failed.', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    try {
      sessionStorage.removeItem('vibe-together-booking-draft')
    } catch {}
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error container" role="alert">
          <p className="app-error__eyebrow">Something went wrong</p>
          <h1>This page couldn&apos;t load.</h1>
          <p>Try reloading the page. If the issue persists, return to the home page.</p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              className="button button--primary"
              onClick={this.handleReload}
              type="button"
            >
              Reload page
            </button>
            <button
              className="button button--secondary"
              onClick={this.handleReset}
              type="button"
            >
              Return to home
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
