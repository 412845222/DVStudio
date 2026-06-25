import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

const tsRules = {
  ...ts.configs.recommended.rules,
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  'no-debugger': 'error',
  'no-unused-vars': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  '@typescript-eslint/no-unused-vars': ['warn', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_'
  }],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/ban-ts-comment': 'warn',
  '@typescript-eslint/no-namespace': 'off'
}

const vueRules = {
  'vue/multi-word-component-names': 'off',
  'vue/no-v-html': 'warn',
  'vue/require-default-prop': 'off',
  'vue/no-mutating-props': 'warn',
  'vue/no-template-shadow': 'warn',
  'vue/attribute-hyphenation': 'off',
  'vue/attributes-order': 'off',
  'vue/max-attributes-per-line': 'off',
  'vue/singleline-html-element-content-newline': 'off',
  'vue/html-self-closing': 'off',
  'vue/multiline-html-element-content-newline': 'off'
}

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      'coverage/**',
      'out/**',
      'DVSResource/**',
      '*.min.js',
      '*.d.ts',
      'public/**',
      'samples/**',
      'agent_docs/**',
      'AIPlan/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: tsRules
  },
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue']
      }
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: {
      ...tsRules,
      ...vueRules
    }
  },
  {
    files: ['electron/**/*.{mjs,js}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off'
    }
  },
  {
    files: ['tests/**/*.{test,spec}.{ts,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off'
    }
  },
  {
    files: ['scripts/**/*.{mjs,js}'],
    rules: {
      'no-console': 'off'
    }
  }
]
