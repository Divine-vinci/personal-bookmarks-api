import { cpSync, mkdirSync } from 'node:fs';

const src = 'src/db/migrations';
const dest = 'dist/db/migrations';

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
