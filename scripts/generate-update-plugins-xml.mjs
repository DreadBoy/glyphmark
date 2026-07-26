// Generates `updatePlugins.xml`, the descriptor that turns a GitHub Release into
// a custom plugin repository. Users add its URL once under
// Settings | Plugins | Manage Plugin Repositories, and the IntelliJ plugin then
// installs and self-updates through the normal IDE flow — no Marketplace, no
// review, no manual re-download.
//
// Everything except the download URL is read back out of the *built* plugin,
// whose `plugin.xml` Gradle has already patched with the version and
// `since-build`. Reading the artifact rather than re-declaring those values here
// is what keeps this file from drifting out of step with build.gradle.kts.
//
// Run by .github/workflows/release.yml after `nx build intellij-plugin`.
//
// Format: https://plugins.jetbrains.com/docs/intellij/custom-plugin-repository.html

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = 'apps/intellij-plugin/build/distributions';
const OUT = 'updatePlugins.xml';
const REPO = process.env.GITHUB_REPOSITORY ?? 'DreadBoy/glyphmark';

function findDistributionZip() {
  const zips = fs
    .readdirSync(DIST_DIR)
    .filter((f) => f.endsWith('.zip'))
    .sort();
  if (zips.length !== 1) {
    throw new Error(
      `Expected exactly one .zip in ${DIST_DIR}, found ${zips.length}: ${zips.join(', ')}. ` +
        'A stale build output would otherwise be published silently.',
    );
  }
  return zips[0];
}

/**
 * The distribution is a zip containing a lib/*.jar, which in turn contains the
 * patched META-INF/plugin.xml — hence unzipping twice.
 */
function readPatchedPluginXml(zipName) {
  const zipPath = path.join(DIST_DIR, zipName);
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const jarEntry = entries.find((e) => /\/lib\/[^/]+\.jar$/.test(e));
  if (!jarEntry) {
    throw new Error(`No lib/*.jar found inside ${zipName}`);
  }

  const jarBytes = execFileSync('unzip', ['-p', zipPath, jarEntry], {
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
  });
  const tmpJar = path.join(DIST_DIR, '.plugin-xml-probe.jar');
  fs.writeFileSync(tmpJar, jarBytes);
  try {
    return execFileSync('unzip', ['-p', tmpJar, 'META-INF/plugin.xml'], {
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(tmpJar, { force: true });
  }
}

/**
 * Targeted extraction rather than a full XML parse: the input is our own
 * generated descriptor, not arbitrary third-party XML, and this avoids adding a
 * parser dependency to a workspace that has none.
 */
function extract(xml) {
  const attr = (tag, name) =>
    xml.match(new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`))?.[1];
  const text = (tag) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];

  const id = text('id');
  const version = text('version');
  const sinceBuild = attr('idea-version', 'since-build');
  if (!id || !version || !sinceBuild) {
    throw new Error(
      `Built plugin.xml is missing id/version/since-build (got id=${id}, version=${version}, since-build=${sinceBuild})`,
    );
  }

  return {
    id,
    version,
    sinceBuild,
    untilBuild: attr('idea-version', 'until-build'),
    name: text('name'),
    vendor: text('vendor'),
    // Carried across verbatim so the IDE's plugin list shows the same blurb the
    // plugin itself declares.
    description: text('description')
      ?.replace(/^<!\[CDATA\[/, '')
      .replace(/\]\]>$/, '')
      .trim(),
  };
}

const zipName = findDistributionZip();
const plugin = extract(readPatchedPluginXml(zipName));

// Points at this exact release's asset, not `latest`, so an installed version
// always resolves to the build it was published as.
const downloadUrl = `https://github.com/${REPO}/releases/download/v${plugin.version}/${zipName}`;

const ideaVersion = plugin.untilBuild
  ? `<idea-version since-build="${plugin.sinceBuild}" until-build="${plugin.untilBuild}" />`
  : `<idea-version since-build="${plugin.sinceBuild}" />`;

const optional = [
  plugin.name && `    <name>${plugin.name}</name>`,
  plugin.description &&
    `    <description><![CDATA[${plugin.description}]]></description>`,
  plugin.vendor && `    <vendor>${plugin.vendor}</vendor>`,
]
  .filter(Boolean)
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plugins>
  <plugin id="${plugin.id}" url="${downloadUrl}" version="${plugin.version}">
    ${ideaVersion}
${optional}
  </plugin>
</plugins>
`;

fs.writeFileSync(OUT, xml);
console.log(`wrote ${OUT} for ${plugin.id}@${plugin.version}`);
console.log(`  download: ${downloadUrl}`);
