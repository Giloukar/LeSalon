import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));

test('Shut the Box shutter animation only follows confirmed engine state',async()=>{
 const source=await readFile(path.join(root,'shared/table-3d.js'),'utf8');
 assert.match(source,/lastBoxSnapshot=null/);
 assert.match(source,/previousOpen=new Set\(previousBox\?\.open\|\|\[\]\)/);
 assert.match(source,/newlyClosed=!!previousBox&&previousBox\.round===Number\(s\?\.boxRound\|\|0\)&&previousOpen\.has\(n\)&&!isOpen/);
 assert.match(source,/manipAnimations\.push\(\{mesh:tile,from:tileFrom/);
 assert.match(source,/manipAnimations\.push\(\{mesh:label,from:labelFrom/);
 assert.match(source,/lastBoxSnapshot=\{open:\[\.\.\.open\]/);
 assert.match(source,/if\(diceAnimations\.length\|\|manipAnimations\.length\)startMotion\(\)/);
 const block=source.slice(source.indexOf('function syncBox'),source.indexOf('function syncSpecialCards'));
 assert.doesNotMatch(block,/dispatch\(/);
 assert.doesNotMatch(block,/boxCombinations\(/);
});
