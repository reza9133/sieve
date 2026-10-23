import type { Config } from 'tailwindcss';

// Every colour is a CSS variable (see src/theme/tokens.css). No hex values live in components.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        border: v('border'),
        text: v('text'),
        muted: v('text-muted'),
        accent: v('accent'),
        'accent-2': v('accent-2'),
        success: v('success'),
        warning: v('warning'),
        danger: v('danger'),
        'on-accent': v('on-accent'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 8px 40px -8px rgb(var(--glow) / var(--glow-strength))',
        lift: '0 1px 0 rgb(var(--border) / 0.6), 0 18px 40px -24px rgb(var(--shadow) / var(--shadow-strength))',
      },
    },
  },
  plugins: [],
} satisfies Config;
