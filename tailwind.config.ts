/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './**/*.{ts,tsx}',
    '!./node_modules/**',
    '!./electron/**',
    '!./electron-dist/**',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        border: '#e2e8f0',
        input: '#f1f5f9',
        ring: '#3b82f6',
        background: '#f8fafc',
        foreground: '#0f172a',
        primary: {
          DEFAULT: '#3b82f6',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#ffffff',
          foreground: '#0f172a',
        },
        muted: {
          DEFAULT: '#f1f5f9',
          foreground: '#64748b',
        },
        accent: {
          DEFAULT: '#eff6ff',
          foreground: '#2563eb',
        },
        sidebar: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          active: '#334155',
        },
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 1px 4px -2px rgba(0, 0, 0, 0.02)',
        card: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        kanban: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      },
      width: {
        sidebar: '16rem',
        'deal-sidebar': '20rem',
      },
    },
  },
  plugins: [],
};
