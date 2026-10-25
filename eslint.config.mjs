import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const UI_AND_PLATFORM_IMPORTS = [
  {
    group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    message: 'Simulation code must not depend on React.',
  },
  {
    group: ['react-native', 'react-native/*', 'react-native-*'],
    message: 'Simulation code must not depend on React Native.',
  },
  {
    group: ['expo', 'expo/*', 'expo-*', '@expo/*'],
    message: 'Simulation code must not depend on Expo.',
  },
  { group: ['@shopify/*'], message: 'Simulation code must not depend on Skia.' },
  {
    group: ['zustand', 'zustand/*'],
    message: 'Zustand is for UI state only; simulation state lives in the engine.',
  },
];

const workspaceImports = (packages, message) =>
  packages.map((name) => ({ group: [name, `${name}/*`], message }));

export default defineConfig(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/.expo/',
      '**/coverage/',
      'apps/mobile/ios/',
      'apps/mobile/android/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...UI_AND_PLATFORM_IMPORTS,
            ...workspaceImports(
              ['@touchline/*'],
              '@touchline/shared must not depend on other workspace packages.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['packages/physics/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...UI_AND_PLATFORM_IMPORTS,
            ...workspaceImports(
              [
                '@touchline/match-engine',
                '@touchline/planning',
                '@touchline/renderer',
                '@touchline/mobile',
              ],
              '@touchline/physics may only depend on @touchline/shared.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['packages/match-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...UI_AND_PLATFORM_IMPORTS,
            ...workspaceImports(
              ['@touchline/planning', '@touchline/renderer', '@touchline/mobile'],
              '@touchline/match-engine may only depend on @touchline/shared and @touchline/physics.',
            ),
          ],
        },
      ],
    },
  },
  prettier,
);
