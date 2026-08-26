import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        React: 'readonly',
      },
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
      /*
       * hook 順序規則。這條開之前，`npm run lint` 是抓不到它的 ——
       * 目錄裡的 .eslintrc.json（extends next/core-web-vitals，本來含這條）
       * 在 ESLint 9 的 flat config 下根本不會被讀，等於一直沒人在看。
       *
       * 2026-08-27 就是這樣讓 ConfirmDialog 把 useState 寫在
       * `if (!isOpen) return null` 底下推上正式站：彈窗一開就多出一個 hook，
       * React 丟例外，整頁變成「Application error」。
       */
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]
