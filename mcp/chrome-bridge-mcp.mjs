#!/usr/bin/env node
import { main } from './server/main.mjs';

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exit(1);
});
