import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'white': '#FFFFFF',
        'slate': '#334155',
        'blue-accent': '#2563EB',
        'light-gray': '#F1F5F9',
        'dark-gray': '#1E293B',
      },
      spacing: {
        '4': '4px',
        '8': '8px',
        '12': '12px',
        '16': '16px',
        '24': '24px',
        '32': '32px',
        '48': '48px',
        '64': '64px',
      },
      borderRadius: {
        'small': '8px',
        'medium': '12px',
        'large': '16px',
        'pill': '9999px',
      },
    },
  },
  plugins: [],
};

export default config;
