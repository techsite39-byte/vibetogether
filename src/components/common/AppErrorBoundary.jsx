import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Application rendering failed.', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error container" role="alert">
          <p className="app-error__eyebrow">Something went wrong</p>
          <h1>This page couldn&apos;t load.</h1>
          <p>Try reloading the page. Your saved demo bookings are unchanged.</p>
          <button
            className="button button--primary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload page
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
