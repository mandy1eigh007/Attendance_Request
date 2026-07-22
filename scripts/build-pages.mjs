import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const publicFiles = ['index.html', 'form.html', 'app.css', '_redirects'];
const publicDirectories = ['admin', 'gradebook', 'tests', 'tools'];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const file of publicFiles) {
  cpSync(resolve(root, file), resolve(output, file));
}

for (const directory of publicDirectories) {
  cpSync(resolve(root, directory), resolve(output, directory), { recursive: true });
}

console.log(`Built Pages assets in ${output}`);
