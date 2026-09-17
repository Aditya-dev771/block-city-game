/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17261d', cream: '#f8f2df', moss: '#426a4b', gold: '#e0a72e', clay: '#ba6945'
      },
      fontFamily: { display: ['Georgia', 'serif'], sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};
