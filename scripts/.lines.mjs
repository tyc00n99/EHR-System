import sharp from "sharp";
const [file, X, Y, W, H, thr, gapArg] = process.argv.slice(2);
const GAP = gapArg ? +gapArg : 26;
let T = thr && +thr > 0 ? +thr : 0;
const { data, info } = await sharp(file)
  .extract({ left: +X, top: +Y, width: +W, height: +H })
  .greyscale().raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height;
if (!T) { let mn = 255; for (let k = 0; k < data.length; k++) if (data[k] < mn) mn = data[k]; T = Math.round((mn + 255) / 2); }
console.error("threshold", T);
const rowHas = [];
for (let j = 0; j < h; j++) { let n = 0; for (let i = 0; i < w; i++) if (data[j * w + i] < T) n++; rowHas.push(n); }
// group consecutive inked rows into lines
const lines = [];
let start = -1;
for (let j = 0; j <= h; j++) {
  const on = j < h && rowHas[j] > 0;
  if (on && start < 0) start = j;
  if (!on && start >= 0) { if (j - start >= 6) lines.push([start, j - 1]); start = -1; }
}
const out = [];
for (const [a, b] of lines) {
  let x0 = w, x1 = -1;
  for (let j = a; j <= b; j++) for (let i = 0; i < w; i++) if (data[j * w + i] < T) { if (i < x0) x0 = i; if (i > x1) x1 = i; }
  // horizontal runs separated by gaps of >= 18px (a word space at this scale is ~8-10px)
  const colHas = new Array(w).fill(0);
  for (let j = a; j <= b; j++) for (let i = 0; i < w; i++) if (data[j * w + i] < T) colHas[i]++;
  const runs = []; let s = -1, gap = 0;
  for (let i = 0; i < w; i++) {
    if (colHas[i]) { if (s < 0) s = i; gap = 0; }
    else if (s >= 0 && ++gap >= GAP) { runs.push([s, i - gap]); s = -1; }
  }
  if (s >= 0) runs.push([s, w - 1]);
  out.push({ absY: +Y + a, y: [a, b], height: b - a + 1, x: [x0, x1], width: x1 - x0 + 1, runs: runs.map(([p, q]) => `${+X + p}-${+X + q}:${q - p + 1}`) });
}
console.log(JSON.stringify(out, null, 0));
