import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Tests run under Node (vitest), so they may read files from disk.
    files: ['src/test/**/*.{js,jsx}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Try Demo is frontend-only: anything under src/demo that reaches the
    // backend fails the build instead of shipping a prod write.
    files: ['src/demo/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['firebase', 'firebase/*', '@/firebase/*', '@/services/*'],
      }],
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      react,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Core ESLint doesn't count the object of a JSX member expression
      // (e.g. `motion` in <motion.div>) as a usage — this rule does.
      'react/jsx-uses-vars': 'error',
    },
  },
])
