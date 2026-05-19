// Reads `version` from the root package.json and writes it into every
// publishable sub-package. Also rewrites cli's `@glyphmark/core` dependency
// to the same exact version so the published pair stays in lockstep.
//
// Run by .github/workflows/release.yml before build+publish. Safe to run
// locally too — workspace symlinks resolve by name, not version, so local
// dev is unaffected.

import fs from 'node:fs';

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
const TARGETS = ['libs/core/package.json', 'apps/cli/package.json'];

const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = root.version;
if (!SEMVER.test(version)) {
  throw new Error(`Root package.json version "${version}" is not valid semver`);
}

for (const path of TARGETS) {
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  pkg.version = version;
  if (pkg.dependencies?.['@glyphmark/core']) {
    pkg.dependencies['@glyphmark/core'] = version;
  }
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`set ${pkg.name}@${version}`);
}
