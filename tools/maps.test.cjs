const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'mapedits.js'), 'utf8') + ';this.maps=MAP_EDITS_SHIPPED;', ctx);
for (const id of ['mansion', 'sewer', 'sugar', 'gallery']) {
  test(`shipped ${id} edits exactly preserve Lucas's export`, () => {
    const exported = JSON.parse(fs.readFileSync(path.join(root, `peperhide-${id}-edits.json`), 'utf8'));
    assert.equal(exported.map, id);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.maps[id])), exported.edits);
  });
}
test('player local map edits retain priority without changing shipped edits', () => {
  const local = {mansion: {v: 1, objects: {custom: {del: 1}}, added: []}};
  const saved = JSON.stringify(local);
  const c = vm.createContext({localStorage: {getItem: () => saved}});
  vm.runInContext(fs.readFileSync(path.join(root, 'mapedits.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'editcore.js'), 'utf8').split('const _r2 =')[0] + ';this.selected=MapEdits.get("mansion");this.fallback=MapEdits.get("sewer");', c);
  assert.deepEqual(JSON.parse(JSON.stringify(c.selected)), local.mansion);
  assert.deepEqual(JSON.parse(JSON.stringify(c.fallback)), JSON.parse(JSON.stringify(ctx.maps.sewer)));
});
