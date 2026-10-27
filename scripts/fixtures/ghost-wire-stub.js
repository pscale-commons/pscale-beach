/* A stand-in for Matthew's Ghost Wire engine, for the room smoke test only: the same surface the ping page
   uses (wire, start, step, bound, encode, rerun, seconds, shape, RATE, HEIGHT, LAW), on one straight wire
   from the foot of the box to its head, so a test can feed a finger's moves and know the run finishes. The
   real engine is https://phenomemental.github.io/happyseaurchin-beach/ghost-wire.js. */
(function (root) {
  var RATE = 60, HEIGHT = 1.6, DS = 0.0025;
  var LAW = { half: 0.045, unit: 0.001, most: 20, maxSteps: 180 * RATE };
  function wire(track) {
    var y0 = 1.5, y1 = 0.1, n = Math.floor((y0 - y1) / DS) + 1, x = new Float64Array(n), y = new Float64Array(n);
    for (var i = 0; i < n; i++) { x[i] = 0.5; y[i] = y0 - i * DS; }
    return { track: track, length: y0 - y1, n: n, x: x, y: y };
  }
  function start(w) { return { step: 0, x: w.x[0], y: w.y[0], i: 0, near: 0, status: 'running' }; }
  function bound(q) { q = Math.round(+q || 0); return q > LAW.most ? LAW.most : q < -LAW.most ? -LAW.most : q; }
  function step(st, qx, qy, w) {
    if (st.status !== 'running') return st;
    st.x += bound(qx) * LAW.unit; st.y += bound(qy) * LAW.unit; st.step++;
    st.i = Math.max(0, Math.min(w.n - 1, Math.round((w.y[0] - st.y) / DS)));
    st.near = (st.x - 0.5) * (st.x - 0.5);
    if (st.near > LAW.half * LAW.half) st.status = 'buzzed';
    else if (st.y <= w.y[w.n - 1]) st.status = 'finished';
    else if (st.step >= LAW.maxSteps) st.status = 'stalled';
    return st;
  }
  function encode(track, moves, steps) { return ['gw1', track, steps, moves.map(function (m) { return bound(m[0]) + 'x' + bound(m[1]); }).join('_')].join('.'); }
  function rerun(replay, w) {
    var parts = String(replay).split('.');
    if (parts.length !== 4 || parts[0] !== 'gw1') return null;
    w = w && w.track === parts[1] ? w : wire(parts[1]);
    var st = start(w), moves = parts[3] ? parts[3].split('_') : [];
    for (var k = 0; k < moves.length && st.status === 'running'; k++) { var q = moves[k].split('x'); step(st, +q[0], +q[1], w); }
    return { ok: st.status === 'finished' && st.step === +parts[2], track: parts[1], steps: st.step, status: st.status };
  }
  root.GhostWire = { RATE: RATE, HEIGHT: HEIGHT, LAW: LAW, wire: wire, start: start, step: step, bound: bound, encode: encode, rerun: rerun,
    seconds: function (s) { return (s / RATE).toFixed(2); }, shape: function () { return 'a straight test wire'; }, validTrack: function (t) { return /^[a-z0-9-]{1,40}$/.test(t); } };
})(this);
