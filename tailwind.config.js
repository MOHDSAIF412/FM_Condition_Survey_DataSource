/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* OCS brand, sampled from the logo artwork itself:
           navy #28417C (69,788 px) and orange #F15E22 (21,659 px).
           The old `brand` ramp was Tailwind sky and appeared nowhere in the UI. */
        ocs: {
          50:  '#F2F5FA',
          100: '#E3E9F4',
          200: '#C3CFE6',
          300: '#94A8D0',
          400: '#5E79B2',
          500: '#3B5697',
          600: '#28417C',   // brand navy
          700: '#223768',
          800: '#1C2B51',
          900: '#141F3A',
          950: '#0D1426',
        },
        flame: {
          50:  '#FEF3EE',
          100: '#FDE2D5',
          200: '#FAC2A9',
          300: '#F79B73',
          400: '#F4783F',
          500: '#F15E22',   // brand orange
          600: '#D44A13',
          700: '#B03A10',
          800: '#8C2F0F',
          900: '#6E280F',
        },
        /* Priority is semantic and must stay distinct from brand orange,
           which is reserved for brand/primary-action use only. */
        priority: {
          1: '#DC2626',
          2: '#EA580C',
          3: '#CA8A04',
          4: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(20 31 58 / 0.04), 0 1px 3px 0 rgb(20 31 58 / 0.06)',
        raised: '0 2px 4px -1px rgb(20 31 58 / 0.06), 0 4px 12px -2px rgb(20 31 58 / 0.10)',
        overlay: '0 10px 30px -6px rgb(20 31 58 / 0.22)',
      },
      transitionTimingFunction: {
        emphasis: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
}
