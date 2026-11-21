import { compileFile } from 'cashc';
import { writeFileSync } from 'node:fs';
const artifact = compileFile(new URL('./CupDeposit.cash', import.meta.url));
writeFileSync(new URL('./contract.json', import.meta.url), JSON.stringify(artifact, null, 2));
