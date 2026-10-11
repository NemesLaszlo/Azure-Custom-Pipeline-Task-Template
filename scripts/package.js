// Builds, tests and packages the extension into dist/*.vsix.
//
// The VSIX must contain the task's production node_modules, so dev
// dependencies are pruned before packaging and re-installed afterwards.
//
// Usage: node scripts/package.js [--rev-version] [--skip-tests]
//   --rev-version  let tfx bump the patch version in vss-extension.json
//   --skip-tests   package without running the test suite
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const taskDir = path.join(root, 'buildandreleasetask');
const args = process.argv.slice(2);
const revVersion = args.includes('--rev-version');
const skipTests = args.includes('--skip-tests');

function run(command, cwd = root) {
    console.log(`\n> ${command}`);
    execSync(command, { cwd, stdio: 'inherit' });
}

run('npm run build', taskDir);
if (!skipTests) {
    run('npm test', taskDir);
}

// Running the task locally leaves a .taskkey file behind; it must never ship.
fs.rmSync(path.join(taskDir, '.taskkey'), { force: true });

run('npm prune --omit=dev', taskDir);
try {
    const tfxArgs = ['extension', 'create', '--manifest-globs', 'vss-extension.json', '--output-path', 'dist'];
    if (revVersion) tfxArgs.push('--rev-version');
    run(`npx tfx ${tfxArgs.join(' ')}`);
} finally {
    run('npm ci', taskDir);
}
