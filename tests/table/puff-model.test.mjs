import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const threeRoot = path.dirname(fileURLToPath(import.meta.resolve('three')));
const threePackage = path.resolve(threeRoot, '..');
const threeURL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/+esm';
const loaderURL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js/+esm';

test('all four puff flavors retain their artwork on the shared transparent uncapped body', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TABLE_BROWSER_EXECUTABLE,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      let file;
      if (url.href === threeURL) file = path.join(threeRoot, 'three.module.js');
      else if (url.href === loaderURL) {
        const body = (await readFile(path.join(threePackage, 'examples/jsm/loaders/GLTFLoader.js'), 'utf8'))
          .replace("from 'three'", `from '${threeURL}'`)
          .replace("'../utils/BufferGeometryUtils.js'", "'http://puff.test/__three__/BufferGeometryUtils.js'");
        return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'text/javascript', body });
      } else if (url.pathname === '/__three__/BufferGeometryUtils.js') {
        const body = (await readFile(path.join(threePackage, 'examples/jsm/utils/BufferGeometryUtils.js'), 'utf8'))
          .replace("from 'three'", `from '${threeURL}'`);
        return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'text/javascript', body });
      } else if (url.origin === 'http://puff.test' && url.pathname === '/fixture') {
        return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'text/html', body: `<!doctype html><body style="background:#10151e"><div id="stage" style="position:relative;width:340px;height:520px"></div><script type="module">
          const {create,SKINS}=await import('/shared/puff-3d.js');
          window.skinInfo=SKINS;window.api=await create({stage:document.querySelector('#stage')});window.api.show();window.ready=true;
        </script>` });
      } else if (url.origin === 'http://puff.test') file = path.resolve(root, '.' + url.pathname);
      if (!file || (!file.startsWith(root + path.sep) && !file.startsWith(threePackage + path.sep))) return route.abort();
      if (url.pathname === '/shared/puff-3d.js') {
        // Expose the actual loaded scene for assertions without changing rendering or skin logic.
        const body = (await readFile(file, 'utf8')).replace('scene.add(puff.group);', 'scene.add(puff.group); window.puffScene = scene; window.puffCamera = camera; window.puffRenderer = renderer;');
        return route.fulfill({contentType:'text/javascript',body});
      }
      const type = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp' }[path.extname(file)];
      return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: type || 'application/octet-stream', body: await readFile(file) });
    });
    await page.addInitScript(() => {
      const frames = new Map(); let next = 0;
      window.requestAnimationFrame = cb => { frames.set(++next, cb); return next; };
      window.cancelAnimationFrame = id => frames.delete(id);
      window.step = now => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); };
    });
    await page.goto('http://puff.test/fixture');
    await page.waitForFunction(() => window.ready, null, { polling: 100, timeout: 60000 });
    await page.evaluate(() => window.step(1000));
    const before = await page.evaluate(() => {
      const model = puffScene.getObjectByName('JNR_Falcon_X_Uncapped');
      const print = model.getObjectByName('Printed_wrap');
      const base = model.getObjectByName('Metal_base');
      const shell = model.getObjectByName('Transparent_outer_sleeve_and_neck');
      window.beforeModel = { geometry: print.geometry, baseColor: base.material.color.getHex(), shell: shell.material };
      return { names: model.children.map(n => n.name), silver: base.material.metalness, transmission: shell.material.transmission, transparent: shell.material.transparent, opacity: shell.material.opacity, depthWrite: shell.material.depthWrite,
        skinNames: Object.values(skinInfo).map(s => s.name), flavorNames: Object.values(skinInfo).filter(s => s.flavor).map(s => s.flavor),
        height: shell.geometry.boundingBox?.max.y ?? Math.max(...Array.from(shell.geometry.attributes.position.array).filter((_,i)=>i%3===1)) };
    });
    assert.equal(before.names.includes('Ivory_flat_mouthpiece'), false);
    assert.ok(before.names.includes('Visible_hollow_air_channel'));
    assert.ok(before.transmission > .95);
    assert.equal(before.transparent, true);
    assert.ok(before.opacity < .5);
    assert.equal(before.depthWrite, false);
    assert.ok(before.silver > .8);
    assert.ok(Math.abs(before.height - .1327) < .00001);
    assert.deepEqual(before.skinNames, ['Blackberry', 'Golden Falcon', 'Cherry Ice', 'Blue Razz']);
    assert.deepEqual(before.flavorNames, [['MANGO','PASSION FRUIT'],['CHERRY','ICE'],['BLUE','RAZZ']]);
    await page.evaluate(capture => {window.capturePuff=capture;}, !!process.env.PUFF_SCREENSHOT_DIR);
    const hashes = [];
    for (const [i, id] of ['blackberry', 'falcon', 'cherry', 'razz'].entries()) {
      const state = await page.evaluate(({id,now}) => {
        api.setSkin(id); api.setLevel(73); step(now);
        const model = puffScene.getObjectByName('JNR_Falcon_X_Uncapped');
        const print = model.getObjectByName('Printed_wrap');
        const pixels = print.material.map.image.getContext('2d').getImageData(0,0,887,1774).data;
        let hash=2166136261; for(let i=0;i<pixels.length;i+=113)hash=Math.imul(hash^pixels[i],16777619);
        if (window.capturePuff) window.puffPNG = document.querySelector('.puffCanvas').toDataURL();
        return { hash, sameGeometry:print.geometry===beforeModel.geometry,
          sameBase:model.getObjectByName('Metal_base').material.color.getHex()===beforeModel.baseColor,
          sameShell:model.getObjectByName('Transparent_outer_sleeve_and_neck').material===beforeModel.shell,
          hasCanvas:!!document.querySelector('.puffCanvas'), screenPixels:puffScene.getObjectByName('screen').material.map.image.width };
      }, {id,now:1100+i*100});
      hashes.push(state.hash);
      assert.equal(state.sameGeometry, true);
      assert.equal(state.sameBase, true);
      assert.equal(state.sameShell, true);
      assert.equal(state.hasCanvas, true);
      assert.equal(state.screenPixels, 512);
      if (process.env.PUFF_SCREENSHOT_DIR) {
        const png = await page.evaluate(() => window.puffPNG);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(path.join(process.env.PUFF_SCREENSHOT_DIR, id + '.png'), Buffer.from(png.split(',')[1], 'base64'));
      }
    }
    assert.equal(new Set(hashes).size, 4, 'each existing flavor must keep a distinct printed design');
    const counterVisible = await page.evaluate(() => {
      api.setLevel(11); puffRenderer.render(puffScene, puffCamera);
      const first = puffRenderer.domElement.toDataURL();
      api.setLevel(88); puffRenderer.render(puffScene, puffCamera);
      return first !== puffRenderer.domElement.toDataURL();
    });
    assert.equal(counterVisible, true, 'the illuminated counter must stay visible through the clear sleeve');
    await page.evaluate(() => {api.pull();step(1700);api.release(true);api.hide();api.clear();});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
