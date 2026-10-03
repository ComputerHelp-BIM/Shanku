// Writes docs/roadmap.md from apps/web/src/home/roadmap.ts (npm run roadmap). A test fails when they differ.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { roadmapMarkdown } from '../apps/web/src/home/roadmap.ts';

const out = fileURLToPath(new URL('../docs/roadmap.md', import.meta.url));
writeFileSync(out, roadmapMarkdown());
console.log('Wrote docs/roadmap.md');
