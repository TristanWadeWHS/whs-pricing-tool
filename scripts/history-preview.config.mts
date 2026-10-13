import { defineConfig } from 'vitest/config';
// Never included by npm test or the normal application build. Explicit Preview setup only.
export default defineConfig({test:{environment:'node',include:['scripts/history-preview.verify.ts'],testTimeout:120000,hookTimeout:30000,fileParallelism:false}});
