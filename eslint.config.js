import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import globals from 'globals'

const tsRules = {
  ...ts.configs.recommended.rules,
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  'no-debugger': 'error',
  'no-unused-vars': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-useless-assignment': 'warn',
  'no-control-regex': 'warn',
  'preserve-caught-error': 'off',
  'no-redeclare': 'warn',
  'no-constant-binary-expression': 'warn',
  'no-prototype-builtins': 'warn',
  'no-useless-escape': 'warn',
  'no-self-assign': 'warn',
  'no-undef': 'warn',
  'no-case-declarations': 'warn',
  'no-extra-boolean-cast': 'warn',
  'no-unsafe-finally': 'warn',
  '@typescript-eslint/no-unused-vars': ['warn', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_'
  }],
  '@typescript-eslint/no-explicit-any': ['warn', {
    fixToUnknown: false,
    ignoreRestArgs: true
  }],
  '@typescript-eslint/ban-ts-comment': 'warn',
  '@typescript-eslint/no-namespace': 'off',
  '@typescript-eslint/no-empty-object-type': 'off'
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
  'vue/multiline-html-element-content-newline': 'off',
  'vue/html-indent': 'off',
  'vue/valid-template-root': 'warn',
  'vue/no-dupe-keys': 'warn',
  'vue/no-unused-vars': 'warn',
  'vue/no-side-effects-in-computed-properties': 'warn'
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
      'AIPlan/**',
      'electron/static/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
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
      },
      globals: {
        ...globals.browser,
        ...globals.es2021
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
    files: ['src/workers/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.worker,
        ...globals.browser,
        ...globals.es2021
      }
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: {
      ...tsRules,
      'no-undef': 'off'
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
        global: 'readonly',
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
      'no-control-regex': 'warn',
      'preserve-caught-error': 'off',
      'no-redeclare': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'no-self-assign': 'warn'
    }
  },
  {
    files: ['tests/**/*.{test,spec}.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off'
    }
  },
  {
    files: ['scripts/**/*.{mjs,js}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
]