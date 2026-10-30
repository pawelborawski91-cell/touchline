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

const RENDERER_WORKSPACE_IMPORTS = workspaceImports(
  [
    '@touchline/match-engine',
    '@touchline/physics',
    '@touchline/ball-engine',
    '@touchline/planning',
    '@touchline/mobile',
  ],
  '@touchline/renderer consumes snapshots typed in @touchline/shared and may only depend on it.',
);

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
                '@touchline/ball-engine',
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
    files: ['packages/ball-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...UI_AND_PLATFORM_IMPORTS,
            ...workspaceImports(
              [
                '@touchline/physics',
                '@touchline/match-engine',
                '@touchline/planning',
                '@touchline/renderer',
                '@touchline/mobile',
              ],
              '@touchline/ball-engine may only depend on @touchline/shared.',
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
              '@touchline/match-engine may only depend on @touchline/shared, @touchline/physics and @touchline/ball-engine.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['packages/planning/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...UI_AND_PLATFORM_IMPORTS,
            ...workspaceImports(
              [
                '@touchline/physics',
                '@touchline/ball-engine',
                '@touchline/match-engine',
                '@touchline/renderer',
                '@touchline/mobile',
              ],
              '@touchline/planning is pure planning logic and may only depend on @touchline/shared.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['packages/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['zustand', 'zustand/*'],
              message:
                'The renderer is stateless with respect to the match; UI state lives in the app.',
            },
            ...RENDERER_WORKSPACE_IMPORTS,
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/renderer/src/core.ts',
      'packages/renderer/src/ball/**/*.ts',
      'packages/renderer/src/camera/cameraTransforms.ts',
      'packages/renderer/src/coordinates/**/*.ts',
      'packages/renderer/src/interaction/**/*.ts',
      'packages/renderer/src/path/**/*.ts',
      'packages/renderer/src/types/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...UI_AND_PLATFORM_IMPORTS, ...RENDERER_WORKSPACE_IMPORTS] },
      ],
    },
  },
  prettier,
);
