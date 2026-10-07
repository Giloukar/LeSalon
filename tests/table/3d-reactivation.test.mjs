import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));

test('3D reactivation establishes a motion-free baseline before the visible render',async()=>{
  const source=await readFile(path.join(root,'shared/table-3d-loader.js'),'utf8');
  assert.match(source,/let modulePromise=null,renderer=null,freshActivation=true/);
  assert.match(source,/function renderFreshBaseline\(payload\)/);
  assert.match(source,/root\.dataset\.motion='off'/);
  assert.match(source,/try\{renderer\?\.render\?\.\(payload\)\}finally\{/);
  assert.match(source,/if\(hadMotion\)root\.setAttribute\('data-motion',previousMotion\?\?' '\)|if\(hadMotion\)root\.setAttribute\('data-motion',previousMotion\?\?''\)/);
  assert.match(source,/else root\.removeAttribute\('data-motion'\)/);
  assert.match(source,/\}\n  renderer\?\.render\?\.\(payload\);\n\}/);
  assert.match(source,/activate\(\)\{freshActivation=true;renderer\?\.activate\?\.\(\)\}/);
  assert.match(source,/if\(freshActivation\)\{freshActivation=false;renderFreshBaseline\(payload\);return\}/);
  assert.match(source,/destroy\(\)\{renderer\?\.destroy\?\.\(\);renderer=null;freshActivation=true\}/);
});
