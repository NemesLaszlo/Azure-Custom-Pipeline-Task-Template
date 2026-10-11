// Removes compiled output and packaged VSIX files. Sources (.ts) are untouched.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const taskDir = path.join(root, 'buildandreleasetask');

function removeCompiledJs(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules') removeCompiledJs(full);
        } else if (/\.js(\.map)?$/.test(entry.name) && fs.existsSync(full.replace(/\.js(\.map)?$/, '.ts'))) {
            fs.rmSync(full);
            console.log(`removed ${path.relative(root, full)}`);
        }
    }
}

removeCompiledJs(taskDir);
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
console.log('removed dist/');
