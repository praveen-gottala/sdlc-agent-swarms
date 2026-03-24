import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Background layers */
        bg: {
          base: '#0f1117',
          card: '#1a1b2e',
          elevated: '#252736',
        },
        /* Sidebar */
        sidebar: '#13141f',
        /* Text */
        text: {
          primary: '#e2e8f0',
          secondary: '#94a3b8',
          muted: '#64748b',
        },
        /* Border */
        border: '#2d2f42',
        /* Accent / status colors */
        accent: {
          green: '#22c55e',
          orange: '#f97316',
          yellow: '#eab308',
          red: '#ef4444',
          purple: '#a855f7',
          blue: '#3b82f6',
          cyan: '#06b6d4',
          teal: '#14b8a6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(251,146,60,0.15)' },
          '50%': { boxShadow: '0 0 20px rgba(251,146,60,0.3)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
