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
      fontSize: {
        micro: ['11px', { lineHeight: '14px' }],
        caption: ['12px', { lineHeight: '16px' }],
      },
      colors: {
        border: '#E5E7EB',
        'border-subtle': '#F3F4F6',
        input: '#F3F4F6',
        ring: '#2563EB',
        background: '#FAFBFC',
        foreground: '#111827',
        surface: '#FFFFFF',
        subtle: '#F3F4F6',
        primary: {
          DEFAULT: '#2563EB',
          foreground: '#ffffff',
          light: '#EFF6FF',
        },
        secondary: {
          DEFAULT: '#ffffff',
          foreground: '#111827',
        },
        muted: {
          DEFAULT: '#F3F4F6',
          foreground: '#6B7280',
        },
        accent: {
          DEFAULT: '#EFF6FF',
          foreground: '#2563EB',
        },
        sidebar: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          active: '#334155',
        },
        success: '#059669',
        warning: '#D97706',
        danger: '#DC2626',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
        sm: '0 2px 4px rgba(0, 0, 0, 0.06)',
        md: '0 4px 12px rgba(0, 0, 0, 0.08)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
        focus: '0 0 0 2px rgba(37, 99, 235, 0.2)',
      },
      width: {
        sidebar: '14rem',
      },
      borderRadius: {
        card: '8px',
        drawer: '12px',
      },
    },
  },
  plugins: [],
};
