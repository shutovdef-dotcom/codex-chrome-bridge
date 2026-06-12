#!/usr/bin/env node
import { main } from './cli/main.mjs';

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exit(1);
});
