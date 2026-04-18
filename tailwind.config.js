/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      keyframes: {
        'slide-in': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'slide-in': 'slide-in 0.2s ease-out',
      },
      colors: {
        navy: {
          50:  '#eef1f7',
          100: '#d5dcec',
          200: '#aab9d9',
          300: '#7f96c6',
          400: '#5473b3',
          500: '#3a5a9e',
          600: '#2d4880',
          700: '#213660',
          800: '#162240',
          900: '#0F1F3D',
        },
      },
    },
  },
  plugins: [],
}
