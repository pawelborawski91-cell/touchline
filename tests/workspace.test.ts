import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface PackageManifest {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const PACKAGE_DIRS = {
  '@touchline/shared': 'packages/shared',
  '@touchline/physics': 'packages/physics',
  '@touchline/ball-engine': 'packages/ball-engine',
  '@touchline/match-engine': 'packages/match-engine',
  '@touchline/planning': 'packages/planning',
  '@touchline/renderer': 'packages/renderer',
  '@touchline/mobile': 'apps/mobile',
} as const;

type PackageName = keyof typeof PACKAGE_DIRS;

const ALLOWED_WORKSPACE_DEPS: Record<PackageName, readonly PackageName[]> = {
  '@touchline/shared': [],
  '@touchline/physics': ['@touchline/shared'],
  '@touchline/ball-engine': ['@touchline/shared'],
  '@touchline/match-engine': ['@touchline/shared', '@touchline/physics', '@touchline/ball-engine'],
  '@touchline/planning': ['@touchline/shared'],
  '@touchline/renderer': ['@touchline/shared'],
  '@touchline/mobile': [
    '@touchline/shared',
    '@touchline/physics',
    '@touchline/ball-engine',
    '@touchline/match-engine',
    '@touchline/planning',
    '@touchline/renderer',
  ],
};

const UI_PACKAGE_PATTERN =
  /^(react|react-native|react-dom|expo|zustand|@shopify\/|@expo\/)|^react-native-|^expo-/;

const packageNames = Object.keys(PACKAGE_DIRS) as PackageName[];

function readManifest(name: PackageName): PackageManifest {
  const raw = readFileSync(resolve(repoRoot, PACKAGE_DIRS[name], 'package.json'), 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

function runtimeDeps(manifest: PackageManifest): string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
}

function workspaceDeps(name: PackageName): PackageName[] {
  return runtimeDeps(readManifest(name)).filter((dep): dep is PackageName => dep in PACKAGE_DIRS);
}

describe('workspace', () => {
  it.each(packageNames)('%s manifest has the expected name', (name) => {
    expect(readManifest(name).name).toBe(name);
  });

  it('resolves every library package through the workspace', async () => {
    const modules = await Promise.all([
      import('@touchline/shared'),
      import('@touchline/physics'),
      import('@touchline/ball-engine'),
      import('@touchline/match-engine'),
      import('@touchline/planning'),
      import('@touchline/renderer/core'),
    ]);
    for (const mod of modules) {
      expect(mod).toBeTypeOf('object');
    }
  });

  it.each(packageNames)('%s only depends on allowed workspace packages', (name) => {
    for (const dep of workspaceDeps(name)) {
      expect(ALLOWED_WORKSPACE_DEPS[name]).toContain(dep);
    }
  });

  it.each([
    '@touchline/shared',
    '@touchline/physics',
    '@touchline/ball-engine',
    '@touchline/match-engine',
    '@touchline/planning',
  ] as const)('%s has no React Native, Expo, Skia, Zustand or UI dependencies', (name) => {
    const uiDeps = runtimeDeps(readManifest(name)).filter((dep) => UI_PACKAGE_PATTERN.test(dep));
    expect(uiDeps).toEqual([]);
  });

  it('has no circular workspace dependencies', () => {
    const visiting = new Set<PackageName>();
    const visited = new Set<PackageName>();

    const visit = (name: PackageName, path: PackageName[]): void => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency: ${[...path, name].join(' -> ')}`);
      }
      visiting.add(name);
      for (const dep of workspaceDeps(name)) visit(dep, [...path, name]);
      visiting.delete(name);
      visited.add(name);
    };

    expect(() => {
      for (const name of packageNames) visit(name, []);
    }).not.toThrow();
  });
});
