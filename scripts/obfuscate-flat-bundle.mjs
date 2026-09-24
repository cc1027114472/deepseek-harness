import fs from 'node:fs';
import path from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const rootDir = process.cwd();
const flatDir = path.join(rootDir, 'dist', 'flat-bundle');

if (!fs.existsSync(flatDir)) {
  console.log('flat-bundle directory not found, skipping obfuscation.');
  process.exit(0);
}

console.log('🔒 Starting focused code obfuscation and encryption on Mowan core modules...');
const startTime = Date.now();

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  numbersToExpressions: true,
  simplify: true,
  stringArrayShuffle: true,
  splitStrings: true,
  stringArrayThreshold: 0.85,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  deadCodeInjection: false,
  renameGlobals: false,
  identifierNamesGenerator: 'hexadecimal'
};

const targetFiles = [
  // CLI launcher & bootloader
  'apps/cli/lib/bin.js',
  'apps/cli/lib/dump-config-D-jtgwY3.js',
  'apps/cli/lib/plugin-9h8shc4d.js',
  'apps/cli/lib/profile-boot-BnJoK_kl.js',
  'apps/cli/lib/profile-boot-DG5t9aNs.js',
  
  // Mowan LLM provider & core logic
  'packages/llm/llm-mowan/lib/index.js',
  'packages/llm/llm-mowan/lib/invariant.js',
  'packages/llm/llm-deepseek/lib/index.js',
  'packages/llm/llm/lib/index.js',
  'node_modules/@deepseek-ai/dsh-llm-mowan/lib/index.js',
  'node_modules/@deepseek-ai/dsh-llm-mowan/lib/invariant.js',
  'node_modules/@deepseek-ai/dsh-llm-deepseek/lib/index.js',

  // Provider editor settings
  'packages/client/ui-settings-models/lib/index.js',
  'node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/index.js',
];

let processedCount = 0;
let skippedCount = 0;

function obfuscateFile(fullPath) {
  if (!fs.existsSync(fullPath)) return;
  let code = fs.readFileSync(fullPath, 'utf8');
  if (code.length < 30 || code.includes('/* obfuscated */')) {
    skippedCount++;
    return;
  }

  let hasHashbang = false;
  let hashbangLine = '';
  if (code.startsWith('#!')) {
    hasHashbang = true;
    const firstNewline = code.indexOf('\n');
    if (firstNewline !== -1) {
      hashbangLine = code.substring(0, firstNewline + 1);
      code = code.substring(firstNewline + 1);
    }
  }

  try {
    const res = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
    const finalCode = hasHashbang
      ? hashbangLine + '/* obfuscated */\n' + res.getObfuscatedCode()
      : '/* obfuscated */\n' + res.getObfuscatedCode();
    fs.writeFileSync(fullPath, finalCode, 'utf8');
    processedCount++;
    const rel = path.relative(flatDir, fullPath);
    console.log(`  ✓ Protected: ${rel} (${(code.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.warn(`  [WARN] Failed to obfuscate ${fullPath}: ${err.message}`);
  }
}

for (const rel of targetFiles) {
  obfuscateFile(path.join(flatDir, rel));
}

// Obfuscate frontend entry in apps/web/dist/assets
const webAssetsDir = path.join(flatDir, 'apps', 'web', 'dist', 'assets');
if (fs.existsSync(webAssetsDir)) {
  const assets = fs.readdirSync(webAssetsDir);
  for (const a of assets) {
    if (a.startsWith('index-') && a.endsWith('.js')) {
      const fullPath = path.join(webAssetsDir, a);
      obfuscateFile(fullPath);
    }
  }
}

// Clean any SourceMaps in flatDir
function cleanSourceMaps(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanSourceMaps(full);
    } else if (entry.isFile() && entry.name.endsWith('.map')) {
      fs.unlinkSync(full);
    }
  }
}
cleanSourceMaps(flatDir);

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`🎉 Code obfuscation finished in ${elapsedSec}s: ${processedCount} core proprietary files encrypted & protected, SourceMaps purged.`);
