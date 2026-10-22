import React from 'react'
import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-2xl font-mono font-bold text-accent">
        404
      </div>
      <h1 className="text-2xl font-extrabold text-text">Page Not Found</h1>
      <p className="text-text-muted text-sm max-w-sm">
        The route you requested does not exist on Sieve.
      </p>
      <Link to="/" className="btn btn-primary text-xs py-2 px-6">
        Return to Home
      </Link>
    </div>
  )
}
