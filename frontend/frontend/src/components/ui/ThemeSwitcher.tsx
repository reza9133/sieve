import React from 'react'
import { useTheme, type Theme } from '@/theme/ThemeProvider'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  const options: { id: Theme; label: string; icon: React.ReactNode }[] = [
    {
      id: 'light',
      label: 'Light theme',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      id: 'dim',
      label: 'Dim (slate) theme',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      ),
    },
    {
      id: 'dark',
      label: 'Dark theme',
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
        </svg>
      ),
    },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Theme selector"
      className="inline-flex items-center p-1 rounded-lg border border-border bg-surface-2 gap-0.5"
    >
      {options.map((opt) => {
        const isSelected = theme === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => setTheme(opt.id)}
            className={`p-1.5 rounded-md transition-all ${
              isSelected
                ? 'bg-surface text-accent shadow-sm ring-1 ring-border'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {opt.icon}
          </button>
        )
      })}
    </div>
  )
}
