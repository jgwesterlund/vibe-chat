/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Avenir Next', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'sans-serif'],
        display: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Cormorant Garamond', 'Times New Roman', 'serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      colors: {
        app: 'rgb(var(--color-app) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        'panel-strong': 'rgb(var(--color-panel-strong) / <alpha-value>)',
        control: 'rgb(var(--color-control) / <alpha-value>)',
        'control-hover': 'rgb(var(--color-control-hover) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        faint: 'rgb(var(--color-faint) / <alpha-value>)',
        sidebar: 'rgb(var(--color-sidebar) / <alpha-value>)',
        'sidebar-active': 'rgb(var(--color-sidebar-active) / <alpha-value>)',
        user: 'rgb(var(--color-user) / <alpha-value>)',
        'user-fg': 'rgb(var(--color-user-fg) / <alpha-value>)',
        action: 'rgb(var(--color-action) / <alpha-value>)',
        'action-fg': 'rgb(var(--color-action-fg) / <alpha-value>)',
        overlay: 'rgb(var(--color-overlay) / <alpha-value>)',
        shadow: 'rgb(var(--color-shadow) / <alpha-value>)',
        code: 'rgb(var(--color-code) / <alpha-value>)',
        link: 'rgb(var(--color-link) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        accent: {
          aubergine: '#cc785c',
          blue: '#5db8a6',
          green: '#5db872',
          yellow: '#e8a55a',
          red: '#c64545'
        },
        ink: {
          50: 'rgb(var(--color-ink-50) / <alpha-value>)',
          100: 'rgb(var(--color-ink-100) / <alpha-value>)',
          200: 'rgb(var(--color-ink-200) / <alpha-value>)',
          300: 'rgb(var(--color-ink-300) / <alpha-value>)',
          400: 'rgb(var(--color-ink-400) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          600: 'rgb(var(--color-ink-600) / <alpha-value>)',
          800: 'rgb(var(--color-ink-800) / <alpha-value>)',
          900: 'rgb(var(--color-ink-900) / <alpha-value>)',
          950: 'rgb(var(--color-ink-950) / <alpha-value>)'
        }
      }
    }
  },
  plugins: []
}
