/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ea-dark': '#0d1117',
        'ea-darker': '#010409',
        'ea-border': '#30363d',
        'ea-green': '#3fb950',
        'ea-blue': '#58a6ff',
        'ea-orange': '#d29922',
        'ea-red': '#f85149',
        'ea-purple': '#a371f7',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
