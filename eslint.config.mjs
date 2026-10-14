import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/out/',
    '**/release/',
    '**/.turbo/',
    '**/test-results/',
    '**/playwright-report/',
    'packages/db/migrations/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'smart'],
    },
  },

  // Plain JS config files aren't part of any TypeScript project.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Node-side code: Electron main + preload, packages, tool configs.
  {
    files: [
      'apps/desktop/src/main/**/*.ts',
      'apps/desktop/src/preload/**/*.ts',
      'apps/desktop/e2e/**/*.ts',
      'apps/desktop/*.config.ts',
      'packages/*/src/**/*.ts',
      'packages/*/*.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },

  // React UI: the renderer and the shared component library.
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },
  // Fast Refresh (hot reload) rules only matter for the app's own components.
  {
    files: ['apps/desktop/src/renderer/**/*.tsx'],
    extends: [reactRefresh.configs.vite],
  },
);
