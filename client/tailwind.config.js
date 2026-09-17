/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FFFFEB',
        ink: {
          DEFAULT: '#1A1A1A',
          dark: '#111111',
          muted: '#666666',
          soft: '#888888',
        },
        lavender: '#F0D7FF',
        teal: {
          deep: '#034F46',
        },
        orange: {
          accent: '#FFA946',
        },
        pale: '#E4E4D0',
        focus: {
          blue: '#2D62FF',
        },
        status: {
          success: '#114E0B',
          warning: '#5E5515',
          danger: '#7F1C34',
        },
        borderInk: {
          DEFAULT: 'rgba(26, 26, 26, 0.3)',
          soft: 'rgba(26, 26, 26, 0.1)',
          strong: 'rgba(26, 26, 26, 0.5)',
        }
      },
      fontFamily: {
        display: ['"EB Garamond"', '"Cormorant Garamond"', '"Playfair Display"', 'Georgia', 'serif'],
        body: ['Figtree', 'Inter', '"Plus Jakarta Sans"', 'Manrope', 'sans-serif'],
        sans: ['Figtree', 'Inter', '"Plus Jakarta Sans"', 'Manrope', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '32px',
        'xl': '64px',
      },
      borderRadius: {
        'card': '14px',
      },
      boxShadow: {
        'subtle': '0 2px 8px rgba(26, 26, 15, 0.05)',
        'elevated': '0 4px 16px rgba(26, 26, 15, 0.10)',
        'editorial': '0 1px 3px rgba(26, 26, 15, 0.04), 0 8px 30px rgba(26, 26, 15, 0.07)',
      }
    },
  },
  plugins: [],
}
