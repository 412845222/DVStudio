import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DIST_DIR = 'dist';
const NOTES_PATH = '.release-notes.md';

function getBuildVersion() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const baseVersion = pkg.version;
  const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const ref = process.env.GITHUB_REF || '';
  const runNumber = process.env.GITHUB_RUN_NUMBER || '0';

  if (ref.startsWith('refs/tags/v')) {
    const tagVersion = ref.replace('refs/tags/v', '');
    return {
      version: tagVersion,
      tag: `v${tagVersion}`,
      isPrerelease: false,
      releaseName: `DVStudio v${tagVersion}`,
      sha
    };
  }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return {
    version: `${baseVersion}-dev.${date}.${runNumber}`,
    tag: `v${baseVersion}-dev.${date}.${runNumber}`,
    isPrerelease: true,
    releaseName: `DVStudio v${baseVersion}-dev.${date}.${runNumber} (Dev Preview)`,
    sha,
    baseVersion
  };
}

function findInstaller() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[prepare-release] ${DIST_DIR}/ directory not found!`);
    process.exit(1);
  }

  const files = fs.readdirSync(DIST_DIR);
  const installer = files.find(f => f.endsWith('.exe') && f.includes('Setup') && !f.includes('blockmap'));
  if (!installer) {
    console.error('[prepare-release] No .exe Setup installer found in dist/. Files:', files);
    process.exit(1);
  }

  return path.join(DIST_DIR, installer);
}

function getRecentCommits(sha) {
  try {
    const prevTag = execSync('git describe --tags --abbrev=0 2>nul', { encoding: 'utf8' }).trim();
    const range = `${prevTag}..HEAD`;
    const log = execSync(`git log ${range} --oneline -20`, { encoding: 'utf8' }).trim();
    return log || 'No commits since last tag.';
  } catch {
    try {
      const log = execSync(`git log -10 --oneline`, { encoding: 'utf8' }).trim();
      return log;
    } catch {
      return 'Could not fetch commit history.';
    }
  }
}

async function getExistingDevReleaseCount(baseVersion, date) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return 0;

  try {
    const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
    const prefix = `v${baseVersion}-dev.${date}.`;
    let count = 0;
    let page = 1;

    while (page <= 5) {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'DVStudio-CI'
        }
      });
      if (!res.ok) break;
      const releases = await res.json();
      if (!releases.length) break;
      for (const r of releases) {
        if (r.tag_name && r.tag_name.startsWith(prefix)) {
          const numStr = r.tag_name.slice(prefix.length);
          const n = parseInt(numStr, 10);
          if (!isNaN(n) && n >= count) count = n;
        }
      }
      page++;
    }
    return count;
  } catch {
    return 0;
  }
}

async function main() {
  const installer = findInstaller();
  const absoluteInstaller = path.resolve(installer);
  let versionInfo = getBuildVersion();

  if (versionInfo.isPrerelease) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const existingCount = await getExistingDevReleaseCount(versionInfo.baseVersion, date);
    const devNumber = existingCount + 1;
    versionInfo.version = `${versionInfo.baseVersion}-dev.${date}.${devNumber}`;
    versionInfo.tag = `v${versionInfo.baseVersion}-dev.${date}.${devNumber}`;
    versionInfo.releaseName = `DVStudio v${versionInfo.baseVersion}-dev.${date}.${devNumber} (Dev Preview)`;
  }

  const commitLog = getRecentCommits(versionInfo.sha);
  const buildTime = new Date().toISOString();

  const releaseType = versionInfo.isPrerelease ? '🔴 Dev Preview' : '🟢 Official Release';

  const notes = `## ${versionInfo.releaseName}

${releaseType}

**Build Info:**
- **Version:** \`${versionInfo.version}\`
- **Commit:** \`${versionInfo.sha}\`
- **Build Time:** ${buildTime}
- **Run Number:** ${process.env.GITHUB_RUN_NUMBER || 'N/A'}
- **Branch:** ${process.env.GITHUB_REF_NAME || 'main'}

---

## Changes

${versionInfo.isPrerelease ? 'Recent commits:' : 'See changelog for details.'}

\`\`\`
${commitLog}
\`\`\`

---

## Installation

Download and run \`${path.basename(installer)}\` to install.

⚠️ **Note**: This is a Windows x64 build signed with self-signed certificate. You may see a Windows Defender SmartScreen warning. Click "More info" → "Run anyway" to proceed.
`;

  fs.writeFileSync(NOTES_PATH, notes);

  const output = {
    tag: versionInfo.tag,
    release_name: versionInfo.releaseName,
    version: versionInfo.version,
    is_prerelease: versionInfo.isPrerelease ? 'true' : 'false',
    installer_path: absoluteInstaller,
    notes_path: path.resolve(NOTES_PATH)
  };

  console.log('[prepare-release] Release info:');
  for (const [k, v] of Object.entries(output)) {
    console.log(`  ${k}: ${v}`);
  }

  const outputs = Object.entries(output)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    fs.appendFileSync(githubOutput, outputs + '\n');
    console.log('[prepare-release] Outputs written to GITHUB_OUTPUT');
  }
}

main().catch(err => {
  console.error('[prepare-release] Error:', err);
  process.exit(1);
});
