#!/usr/bin/env node
// Copies the canonical tooling from the extension template into the publish skill (validate.mjs checks they match).
import { copyFileSync } from 'node:fs';
const S = new URL('../plugins/openplatform/skills/', import.meta.url).pathname;
for (const f of ['publish.mjs', 'check.mjs']) {
  copyFileSync(`${S}openplatform-ext-init/assets/template/scripts/finamx/${f}`, `${S}openplatform-ext-publish/scripts/${f}`);
  console.log('synced ' + f);
}
