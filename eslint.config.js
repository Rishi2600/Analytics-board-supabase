import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Generated output and vendored code. supabase/functions is Deno rather than Node and
    // gets its own configuration when the ingest function lands in phase 4.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/src/types/database.ts',
      'supabase/functions/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // An unused argument named with a leading underscore is a deliberate signal, not an
      // oversight, and is the standard escape hatch for required-but-unused parameters.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // A promise dropped on the floor in an ingestion or rollup path fails silently,
      // which is the worst failure mode this system can have.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    // shadcn primitives are vendored generated code, kept unmodified so the CLI can
    // update them. Several export a cva variants helper next to the component, which the
    // fast refresh rule flags. Editing generated files to satisfy a developer experience
    // rule is the wrong trade, so the rule is off for this directory only.
    files: ['apps/web/src/components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  {
    // Same reason, for the chart and sidebar primitives added in the redesign. chart.tsx types
    // Recharts payloads loosely, and use-mobile reads the viewport once on mount. Both are
    // vendored and left as the CLI wrote them, so an update stays a clean overwrite.
    files: ['apps/web/src/components/ui/chart.tsx', 'apps/web/src/hooks/use-mobile.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  {
    files: ['scripts/**/*.ts', 'packages/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    // Config files are plain JavaScript and carry no type information, so the type aware
    // rules above must be switched off for them. This block stays after every block that
    // enables a typed rule.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Must stay last: turns off every rule that would fight Prettier.
  prettierConfig,
)
