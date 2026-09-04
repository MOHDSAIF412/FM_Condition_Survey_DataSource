/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#082f49',
        },
        grade: {
          a: '#16a34a', // Good - Green
          b: '#2563eb', // Satisfactory - Blue
          c: '#d97706', // Poor - Amber/Orange
          d: '#dc2626', // Bad - Red
        },
        priority: {
          1: '#ef4444', // Immediate
          2: '#f97316', // Essential
          3: '#eab308', // Desirable
          4: '#3b82f6', // Long term
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
