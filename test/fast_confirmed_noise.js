'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../worker.js'), 'utf8');
const start = src.indexOf('function classifyFastChanges('), end = src.indexOf('let lastFastNoiseAt', start);
const classify = vm.runInNewContext(src.slice(start, end) + '\nclassifyFastChanges;');
const confirmed = vm.runInNewContext(src.slice(start, end) + '\nconfirmedFastPicks;');
const changes = (before, after, known) => classify(new Set(before), new Set(after), new Set(known));
// Actual shape of godzhu 17:59:19: two previously picked cells return dark,
// alongside a genuinely new Doppelganger pick. The old count blocks fast handling.
let r = changes([], ['metamorphosis', 'earth_spike', 'doppelganger'], ['metamorphosis', 'earth_spike']);
assert.equal(r.rawAdded.length, 3); assert.deepEqual(Array.from(r.added), ['doppelganger']);
assert.equal(r.gone.length, 0); assert.equal(r.ignored.length, 2);
// Rebrightening a confirmed pick must not mask a concurrent real new pick.
r = changes(['old'], ['new'], ['old']);
assert.deepEqual(Array.from(r.added), ['new']); assert.equal(r.gone.length, 0);
// All twelve confirmed cells flickering back to dark create no new pick.
const old = Array.from({ length: 12 }, (_, i) => 'old' + i);
r = changes([], old, old); assert.equal(r.added.length, 0); assert.equal(r.ignored.length, 12);
// Unconfirmed tooltip-like multi-cell darkening still requires a full frame.
r = changes([], ['a', 'b', 'c'], []); assert.equal(r.added.length, 3);
r = changes(['a'], ['b'], []); assert.equal(r.gone.length, 1);
// A corrected/retracted ownership ceases to be ignored; use current known set.
r = changes([], ['retracted'], []); assert.deepEqual(Array.from(r.added), ['retracted']);
// Raw inputs are never rewritten: recorded observations remain suitable for replay.
const previous = new Set(['old']), dark = new Set(['new']), known = new Set(['old']);
classify(previous, dark, known);
assert.deepEqual([...previous], ['old']); assert.deepEqual([...dark], ['new']);
const accepted = confirmed({ owner: { picked: ['L', 0] }, heroOf: { lion: ['R', 0] },
  known: new Set(['picked', 'suspect', 'hero:orphan']), suspect: { suspect: true }, orphan: { 'hero:orphan': true } });
assert(accepted.has('picked')); assert(accepted.has('hero:lion'));
assert(!accepted.has('suspect')); assert(!accepted.has('hero:orphan'));
console.log('通过：已确认暗格翻转不再遮住真实新落子；未确认多格变化仍完整复核，撤销与原始轨迹保留。');
