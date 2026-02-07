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
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 1px 4px -2px rgba(0, 0, 0, 0.02)',
        card: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
