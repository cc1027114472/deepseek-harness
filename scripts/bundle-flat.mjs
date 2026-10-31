import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist', 'flat-bundle');
const flatNm = path.join(outDir, 'node_modules');

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

console.log('[1/5] Copying root configs & binaries...');
fs.copyFileSync('package.json', path.join(outDir, 'package.json'));
fs.copyFileSync('pnpm-workspace.yaml', path.join(outDir, 'pnpm-workspace.yaml'));
if (fs.existsSync('Mowan-Agent.exe')) {
  fs.copyFileSync('Mowan-Agent.exe', path.join(outDir, 'Mowan-Agent.exe'));
}
if (fs.existsSync('Uninstall.exe')) {
  fs.copyFileSync('Uninstall.exe', path.join(outDir, 'Uninstall.exe'));
}

const runtimeOut = path.join(outDir, 'runtime');
fs.mkdirSync(runtimeOut, { recursive: true });
if (fs.existsSync('runtime/node.exe')) {
  fs.copyFileSync('runtime/node.exe', path.join(runtimeOut, 'node.exe'));
}

function copyCleanSourceDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (['.git', '.gocache', 'tests', 'src', 'coverage', '.turbo', '__tests__', 'node_modules'].includes(entry.name)) continue;
      copyCleanSourceDir(srcPath, destPath);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.map') || entry.name.endsWith('.log')) continue;
      if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.md')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyCleanDepDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (['.git', '.gocache', 'coverage', '.turbo', '__tests__', 'node_modules'].includes(entry.name)) continue;
      copyCleanDepDir(srcPath, destPath);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.map') || entry.name.endsWith('.log')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('[2/5] Copying apps, packages, vendor, and native...');
copyCleanSourceDir('apps', path.join(outDir, 'apps'));
copyCleanSourceDir('packages', path.join(outDir, 'packages'));
copyCleanSourceDir('vendor', path.join(outDir, 'vendor'));
copyCleanSourceDir('native', path.join(outDir, 'native'));

console.log('[3/5] Hoisting workspace packages into node_modules/@deepseek-ai...');
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
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      copyCleanSourceDir(pkgDir, targetDir);
    }
  } catch {}
}

function scanAndHoist(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.isSymbolicLink()) continue;
      if (['tests', 'coverage', 'node_modules', 'src'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      hoistWorkspacePkg(full);
      scanAndHoist(full);
    }
  }
}

scanAndHoist(path.join(outDir, 'vendor'));
scanAndHoist(path.join(outDir, 'packages'));
scanAndHoist(path.join(outDir, 'apps'));
scanAndHoist(path.join(outDir, 'native'));

console.log('[4/5] Creating hoisted flat node_modules (zero symlinks)...');

function getPkgVersion(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function isNewerVersion(v1, v2) {
  const p1 = (v1 || '0.0.0').split(/[-+]/)[0].split('.').map(Number);
  const p2 = (v2 || '0.0.0').split(/[-+]/)[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return true;
    if (n1 < n2) return false;
  }
  return false;
}

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
  'javascript-obfuscator',
  'bytenode',
]);

const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
if (fs.existsSync(pnpmDir)) {
  const pnpmEntries = fs.readdirSync(pnpmDir, { withFileTypes: true });
  for (const pe of pnpmEntries) {
    if (!pe.isDirectory() || pe.isSymbolicLink()) continue;
    const subNm = path.join(pnpmDir, pe.name, 'node_modules');
    if (fs.existsSync(subNm)) {
      let pkgs;
      try {
        pkgs = fs.readdirSync(subNm, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const p of pkgs) {
        if (p.isSymbolicLink()) continue;
        if (IGNORED_PNPM_PACKAGES.has(p.name)) continue;

        if (p.name.startsWith('@')) {
          if (p.name === '@deepseek-ai') continue;
          const scopeDir = path.join(subNm, p.name);
          let scopedPkgs;
          try {
            scopedPkgs = fs.readdirSync(scopeDir, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const sp of scopedPkgs) {
            if (sp.isSymbolicLink()) continue;
            const fullName = `${p.name}/${sp.name}`;
            if (IGNORED_PNPM_PACKAGES.has(fullName) || IGNORED_PNPM_PACKAGES.has(p.name)) continue;
            const targetScopeDir = path.join(flatNm, p.name);
            const targetPkgDir = path.join(targetScopeDir, sp.name);
            const sourcePkgDir = path.join(scopeDir, sp.name);
            if (!fs.existsSync(targetPkgDir)) {
              copyCleanDepDir(sourcePkgDir, targetPkgDir);
            } else if (isNewerVersion(getPkgVersion(sourcePkgDir), getPkgVersion(targetPkgDir))) {
              fs.rmSync(targetPkgDir, { recursive: true, force: true });
              copyCleanDepDir(sourcePkgDir, targetPkgDir);
            }
          }
        } else {
          const targetPkgDir = path.join(flatNm, p.name);
          const sourcePkgDir = path.join(subNm, p.name);
          if (!fs.existsSync(targetPkgDir)) {
            copyCleanDepDir(sourcePkgDir, targetPkgDir);
          } else if (isNewerVersion(getPkgVersion(sourcePkgDir), getPkgVersion(targetPkgDir))) {
            fs.rmSync(targetPkgDir, { recursive: true, force: true });
            copyCleanDepDir(sourcePkgDir, targetPkgDir);
          }
        }
      }
    }
  }
}

// Special case: execa@10.0.0 needs its specific bundled peer dependencies (signal-exit@4, npm-run-path@6, is-stream@4, etc.)
// directly in node_modules/execa/node_modules to avoid conflicting with root-hoisted legacy versions.
if (fs.existsSync(pnpmDir)) {
  const execaEntries = fs.readdirSync(pnpmDir).filter(n => n.startsWith('execa@10'));
  if (execaEntries.length > 0) {
    const execaNm = path.join(pnpmDir, execaEntries[0], 'node_modules');
    const targetExecaNm = path.join(flatNm, 'execa', 'node_modules');
    if (fs.existsSync(execaNm)) {
      fs.mkdirSync(targetExecaNm, { recursive: true });
      for (const item of fs.readdirSync(execaNm)) {
        if (item === 'execa') continue;
        const srcItem = path.join(execaNm, item);
        try {
          const realItem = fs.realpathSync(srcItem);
          const dstItem = path.join(targetExecaNm, item);
          if (!fs.existsSync(dstItem)) {
            copyCleanDepDir(realItem, dstItem);
          }
        } catch {}
      }
    }
  }
}

// Copy mowan.ico
const icoPath = path.join(rootDir, 'mowan.ico');
if (fs.existsSync(icoPath)) {
  fs.copyFileSync(icoPath, path.join(outDir, 'mowan.ico'));
  console.log('✓ Copied mowan.ico to flat bundle');
}

// Clean any nested Setup.exe copies inside flat bundle
const webDist = path.join(outDir, 'apps', 'web', 'dist');
if (fs.existsSync(webDist)) {
  for (const f of fs.readdirSync(webDist)) {
    if (f.endsWith('Setup.exe')) {
      fs.rmSync(path.join(webDist, f), { force: true });
    }
  }
}

console.log('🎉 Clean flat bundle created successfully at:', outDir);
