import React, { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled app error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-text-muted max-w-md mb-6">
            An unexpected error occurred in the application. Please reload or check your connection to Studionet.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              Reload application
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn btn-secondary"
            >
              Try again
            </button>
          </div>
          {this.state.error && (
            <pre className="mt-8 p-4 rounded-lg bg-surface border border-border text-xs text-left max-w-xl overflow-auto font-mono text-text-muted">
              {this.state.error.message}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
