/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3B82F6',
          dark: '#2563EB',
          light: '#60A5FA',
        },
        accent: {
          DEFAULT: '#3B82F6',
          light: '#60A5FA',
          dark: '#2563EB',
        },
        neutral: {
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#CCCCCC',
          500: '#777777',
          700: '#333333',
          900: '#111111',
        },
      },
      fontFamily: {
        sans: ['Noto Sans TC', 'Helvetica', 'Arial', 'sans-serif'],
      },
      gridTemplateColumns: {
        '20': 'repeat(20, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
}
