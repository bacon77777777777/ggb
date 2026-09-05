/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // lib 也要掃：賞等配色（lib/prizeGrade.ts）等常數把 class 字串寫在這裡，
    // 漏掉的話那些 class 不會被產生 —— 畫面上是「元素在、顏色沒了」，
    // 例如 A賞 變成白字白底，看起來像整個標籤消失
    './lib/**/*.{js,ts,jsx,tsx}',
    // cardx 那棵樹（768 以上的桌機 UI）雖然主要用 CSS Modules，商品格會直接掛 ProductBadge 這類 tailwind 元件
    './cardx/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    /* 老闆 2026-09-05：768～1023 這一段直接用 768 以下手機端的版型（頂部導航、底部導航、佈局都一樣，
       只有商品小卡靠 sm: 變 3 欄），桌機版型一律從 1024 起。
       所以把 `md` 從 768 移到 1024、跟 `lg` 同值：全站 619 處 `md:` 的桌機變體在 768～1023 通通不生效，
       768 以下一條規則都沒變（md: 本來就不作用在 768 以下）。
       ⚠️ 不要再用 `md:` 做「平板專用」的微調——它現在就是桌機。 */
    screens: {
      sm: '640px',
      md: '1024px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // 指向 CSS 變數才有辦法讓後台改主題色。
        // 一定要寫成 rgb(var(--x) / <alpha-value>)：站上大量使用 bg-primary/5
        // 這種透明度寫法，直接塞色碼進變數的話那些類別會全部失效
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          dark: 'rgb(var(--primary-dark) / <alpha-value>)',
          light: 'rgb(var(--primary-light) / <alpha-value>)',
          soft: 'rgb(var(--primary-soft) / <alpha-value>)',
        },
        // 金額紅：固定語意色，不跟主題走（見 globals.css 的 --amount）
        amount: 'rgb(var(--amount) / <alpha-value>)',
        accent: {
          red: '#DC2626',    // 獎項/價格紅
          yellow: '#FACC15', // 代幣金
          emerald: '#10B981', // 成功綠
          orange: '#FF5E00', // 任務/簽到橘（MissionFrame）
        },
        'item-bg': '#28324E', // 商品縮圖佔位背景（深藍灰）
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
        // 'GGB CJK' 一定要排在 system-ui 前面：後者會用 .notdef 方塊蓋掉中文並
        // 阻斷 fallback（見 globals.css 的 @font-face 說明）。
        // 它有 unicode-range 限制，只接管中日韓字，英數照舊走 system-ui。
        // 順序有意義：GGB CJK（繁中）→ GGB CJK JP（日文補缺字）→ system-ui（英數）。
        // 兩個 CJK 別名都必須排在 system-ui 前面，它會用 .notdef 方塊中斷 fallback。
        sans: ['"GGB CJK"', '"GGB CJK JP"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        // Oswald：與商城商品小卡的金額同一套（老闆 2026-08-23 指定統一）。
        // 變數字軸只到 700，所以 font-black(900) 會夾到 700 —— 那是真的字重，
        // 不是瀏覽器合成的假粗體。
        amount: ['Oswald', 'sans-serif'],
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
