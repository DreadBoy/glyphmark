// Reads `version` from the root package.json and writes it into every
// publishable sub-package. Also rewrites cli's `@glyphmark/core` dependency
// to the same exact version so the published pair stays in lockstep, and
// stamps the same version onto the IntelliJ plugin's Gradle build.
//
// Run by .github/workflows/release.yml before build+publish. Safe to run
// locally too — workspace symlinks resolve by name, not version, so local
// dev is unaffected.

import fs from 'node:fs';

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
const TARGETS = ['libs/core/package.json', 'apps/cli/package.json'];

// The plugin is versioned from the same root bump, but its version lives in a
// Gradle properties file rather than a package.json. Like the sub-packages, the
// committed value is a placeholder that a release overwrites.
const GRADLE_PROPERTIES = 'apps/intellij-plugin/gradle.properties';

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

const gradleProperties = fs.readFileSync(GRADLE_PROPERTIES, 'utf8');
const VERSION_LINE = /^version\s*=.*$/m;
if (!VERSION_LINE.test(gradleProperties)) {
  throw new Error(`No \`version =\` line found in ${GRADLE_PROPERTIES}`);
}
fs.writeFileSync(
  GRADLE_PROPERTIES,
  gradleProperties.replace(VERSION_LINE, `version = ${version}`),
);
console.log(`set glyphmark-intellij@${version}`);
