/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');

// Brand colour of the profile pages (src/profile); values = Tailwind purple, in oklch so /opacity modifiers work.
const brand = Object.fromEntries(Object.entries({
  50: '97.7% 0.014 308.299', 100: '94.6% 0.033 307.174', 200: '90.2% 0.063 306.703', 300: '82.7% 0.119 306.383',
  400: '71.4% 0.203 305.504', 500: '62.7% 0.265 303.9', 600: '55.8% 0.288 302.321', 700: '49.6% 0.265 301.924',
  800: '43.8% 0.218 303.724', 900: '38.1% 0.176 304.987',
}).map(([k, v]) => [k, `oklch(${v} / <alpha-value>)`]));

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lato', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        lato: ['Lato', 'sans-serif'],
        arial: ['Arial', 'Helvetica', 'sans-serif'],
      },
      colors: { brand },
    },
  },
  // mobile: = phone screens only (below md), used by the A4-sized profile layout.
  plugins: [plugin(({ addVariant }) => addVariant('mobile', '@media (max-width: 47.999rem)'))],
}
