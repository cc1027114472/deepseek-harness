import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist', 'flat-bundle');

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

console.log('[1/4] Copying root configs & binaries...');
fs.copyFileSync('package.json', path.join(outDir, 'package.json'));
fs.copyFileSync('pnpm-workspace.yaml', path.join(outDir, 'pnpm-workspace.yaml'));
if (fs.existsSync('Mowan-Harness.exe')) {
  fs.copyFileSync('Mowan-Harness.exe', path.join(outDir, 'Mowan-Harness.exe'));
}

// 1. Copy runtime node.exe
const runtimeOut = path.join(outDir, 'runtime');
fs.mkdirSync(runtimeOut, { recursive: true });
if (fs.existsSync('runtime/node.exe')) {
  fs.copyFileSync('runtime/node.exe', path.join(runtimeOut, 'node.exe'));
}

// Helper: copy directory recursively ignoring non-runtime stuff
function copyCleanDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (['.git', '.gocache', 'tests', 'src', 'coverage', '.turbo', '__tests__'].includes(entry.name)) continue;
      if (entry.name === 'node_modules') continue;
      copyCleanDir(srcPath, destPath);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.map') || entry.name.endsWith('.log')) continue;
      if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.md')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('[2/4] Copying apps, packages and vendor (built output only)...');
copyCleanDir('apps', path.join(outDir, 'apps'));
copyCleanDir('packages', path.join(outDir, 'packages'));
copyCleanDir('vendor', path.join(outDir, 'vendor'));

console.log('[3/4] Creating hoisted flat node_modules (zero symlinks)...');
const flatNm = path.join(outDir, 'node_modules');
fs.mkdirSync(flatNm, { recursive: true });

const IGNORED_PNPM_PACKAGES = new Set([
  '@openai',
  '@anthropic-ai',
  'typescript',
  'playwright',
  'playwright-core',
  'lefthook',
  'lefthook-windows-x64',
  'lefthook-windows-arm64',
  'lefthook-darwin-arm64',
  'lefthook-darwin-x64',
  'lefthook-linux-x64',
  'lefthook-linux-arm64',
  '@oxlint',
  '@oxlint-tsgolint',
  '@oxlint-windows-x64',
  '@rolldown',
  '@esbuild',
  'esbuild',
  'vitest',
  '@vitest',
  '@testing-library',
  'knip',
  'jscpd',
  'fast-check',
  'eslint-plugin-sonarjs',
  'istanbul-lib-report',
]);

// Copy all packages from .pnpm directly into flat node_modules
const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
if (fs.existsSync(pnpmDir)) {
  const pnpmEntries = fs.readdirSync(pnpmDir, { withFileTypes: true });
  for (const pe of pnpmEntries) {
    if (pe.isDirectory()) {
      const subNm = path.join(pnpmDir, pe.name, 'node_modules');
      if (fs.existsSync(subNm)) {
        const pkgs = fs.readdirSync(subNm, { withFileTypes: true });
        for (const p of pkgs) {
          if (IGNORED_PNPM_PACKAGES.has(p.name)) continue;

          if (p.name.startsWith('@')) {
            const scopeDir = path.join(subNm, p.name);
            const scopedPkgs = fs.readdirSync(scopeDir, { withFileTypes: true });
            for (const sp of scopedPkgs) {
              const fullName = `${p.name}/${sp.name}`;
              if (IGNORED_PNPM_PACKAGES.has(fullName) || IGNORED_PNPM_PACKAGES.has(p.name)) continue;
              const targetScopeDir = path.join(flatNm, p.name);
              const targetPkgDir = path.join(targetScopeDir, sp.name);
              if (!fs.existsSync(targetPkgDir)) {
                copyCleanDir(path.join(scopeDir, sp.name), targetPkgDir);
              }
            }
          } else {
            const targetPkgDir = path.join(flatNm, p.name);
            if (!fs.existsSync(targetPkgDir)) {
              copyCleanDir(path.join(subNm, p.name), targetPkgDir);
            }
          }
        }
      }
    }
  }
}

// Also link/copy workspace @deepseek-ai/* packages into flat node_modules/@deepseek-ai
console.log('[4/4] Hoisting workspace packages into node_modules/@deepseek-ai...');
const deepseekScopeDir = path.join(flatNm, '@deepseek-ai');
fs.mkdirSync(deepseekScopeDir, { recursive: true });

function hoistWorkspacePkg(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (pkg.name && pkg.name.startsWith('@deepseek-ai/')) {
      const shortName = pkg.name.replace('@deepseek-ai/', '');
      const targetDir = path.join(deepseekScopeDir, shortName);
      if (!fs.existsSync(targetDir)) {
        copyCleanDir(pkgDir, targetDir);
      }
    }
  } catch {}
}

function scanAndHoist(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (['tests', 'coverage', 'node_modules', 'src'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      hoistWorkspacePkg(full);
      scanAndHoist(full);
    }
  }
}

scanAndHoist(path.join(outDir, 'packages'));
scanAndHoist(path.join(outDir, 'vendor'));
scanAndHoist(path.join(outDir, 'apps'));

console.log('🎉 Clean flat bundle created successfully at:', outDir);
