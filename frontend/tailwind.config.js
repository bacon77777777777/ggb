/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#EE4D2D',
          dark: '#D9441F',
          light: '#FF7043',
          soft: '#FFF4EF',
        },
        accent: {
          red: '#DC2626',   // 獎項/價格紅
          yellow: '#FACC15', // 代幣金
          emerald: '#10B981', // 成功綠
        },
        neutral: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      borderRadius: {
        'lg': '6px',
        'xl': '9px',
        '2xl': '12px',
        '3xl': '18px',
        '4xl': '24px',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'card': '0 10px 40px -10px rgba(0, 0, 0, 0.08)',
        'modal': '0 20px 70px -15px rgba(0, 0, 0, 0.15)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        amount: ['Tilt Warp', 'sans-serif'],
      },
      lineHeight: {
        snug: '0.8',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        }
      },
      animation: {
        marquee: 'marquee 25s linear infinite',
      },
    },
  },
  plugins: [],
}
