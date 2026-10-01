// node test_quota_pace.mjs — controllo del calcolo ritmo/tacca del pannello AI quote
import assert from 'node:assert/strict';
import { quotaPace } from './static/js/widgets.js';

const now = 1_000_000, H = 3600;
// 5h, metà finestra trascorsa, 25% usato → in linea, tacca a 0.5
let p = quotaPace(25, now + 2.5 * H, '5h', now);
assert.equal(p.elapsed, 0.5); assert.equal(p.level, 'ok'); assert.equal(p.exhaustIn, null);
// 5h, metà trascorsa, 80% usato → finisce prima del reset: 20% in ~0.625h
p = quotaPace(80, now + 2.5 * H, '5h', now);
assert.equal(p.level, 'warn'); assert.equal(Math.round(p.exhaustIn), 0.625 * H);
// inizio finestra (<10%): niente stima di ritmo anche se il consumo è alto
p = quotaPace(30, now + 4.9 * H, '5h', now);
assert.equal(p.level, 'ok');
// caso AGY weekly reale: 18.4% usato al 17.1% del tempo → proiezione 107%, in linea: niente avviso
p = quotaPace(18.4, now + (1 - 0.171) * 7 * 86400, 'weekly', now);
assert.equal(p.level, 'ok'); assert.equal(p.exhaustIn, null);
// caso Codex weekly reale: 42% al 18% → proiezione ~233%: avviso
assert.equal(quotaPace(42, now + 0.82 * 7 * 86400, 'weekly', now).level, 'warn');
// ≥95% → critico
assert.equal(quotaPace(96, now + H, 'weekly', now).level, 'crit');
// finestra sconosciuta o reset mancante → nessuna tacca
assert.equal(quotaPace(10, now + H, 'boh', now).elapsed, null);
assert.equal(quotaPace(10, null, '5h', now).elapsed, null);
// 'weekly sonnet' (Claude) usa la durata settimanale
assert.equal(quotaPace(0, now + 3.5 * 86400, 'weekly sonnet', now).elapsed, 0.5);
console.log('ok');
