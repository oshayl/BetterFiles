import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Host modules are reached through UXP's global require(); the codebase
      // funnels these through adapters, which are allowed to use it.
      '@typescript-eslint/no-require-imports': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      /*
       * `<button>` is not usable in this codebase.
       *
       * UXP renders it as a NATIVE control: children are flattened into a
       * single text label and `display: flex`, `height`, `gap`, `text-align`
       * and `data-*` styling are all ignored. That is why icon-only controls
       * came out as empty grey pills, why toggles showed no active state, and
       * why a row asking for 20px rendered at 30 and pushed the action bar off
       * the panel. `Pressable` restores button semantics on a div.
       *
       * See docs/UXP-CONSTRAINTS.md.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="button"]',
          message:
            'Use Pressable (components/controls/Pressable.tsx) instead of <button>: UXP renders a native button that flattens children and ignores the CSS box. See docs/UXP-CONSTRAINTS.md.',
        },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off', // the logger is the only intended caller
      'prefer-const': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Build scripts run under Node, unlike src/ which targets UXP.
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
