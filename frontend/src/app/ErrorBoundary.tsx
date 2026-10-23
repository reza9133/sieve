import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sieve UI error', error, info.componentStack);
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page py-16" role="alert">
        <div className="surface max-w-xl space-y-3 border-danger/40 p-6">
          <h1 className="text-2xl">Something broke on this page</h1>
          <p className="text-sm text-muted">The rest of the app is fine. Reload the page, or go back and try again.</p>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">Details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{this.state.error.message}</pre>
          </details>
          <button type="button" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
