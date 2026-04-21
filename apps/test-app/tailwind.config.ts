import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        '1': '0 1px 4px rgba(28,25,23,0.08), 0 0 0 1px rgba(28,25,23,0.06)',
        '2': '0 4px 16px rgba(28,25,23,0.10), 0 1px 4px rgba(28,25,23,0.06)',
        '3': '0 16px 40px rgba(28,25,23,0.14), 0 4px 12px rgba(28,25,23,0.08)',
      },
      zIndex: {
        'dropdown': '1000',
        'sticky': '1100',
        'modal': '1200',
        'toast': '1300',
        'tooltip': '1400',
      },
      screens: {
        'mobile': '640px',
        'tablet': '768px',
        'desktop': '1024px',
        'wide': '1440px',
      },
      maxWidth: {
        'content': '1280px',
      },
    },
  },
  plugins: [],
};

export default config;
