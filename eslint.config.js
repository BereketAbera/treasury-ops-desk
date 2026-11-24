import js from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'storybook-static',
      'node_modules',
      'playwright-report',
      'test-results',
      'public/mockServiceWorker.js',
      'src/ds/tokens/tokens.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module' },
    },
  },
  {
    files: ['src/**/*.{ts,vue}', 'tests/unit/**/*.ts', 'tests/component/**/*.ts', '.storybook/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.mjs', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      // API data is only ever rendered as text.
      'vue/no-v-html': 'error',
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
)
