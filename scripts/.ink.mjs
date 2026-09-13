import sharp from "sharp";
const [file, x, y, w, h] = process.argv.slice(2);
const { data, info } = await sharp(file)
  .extract({ left: +x, top: +y, width: +w, height: +h })
  .greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const T = 150; // ink threshold
let x0 = W, x1 = -1, y0 = H, y1 = -1;
const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  if (data[j * W + i] < T) { rows[j]++; cols[i]++; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
}
console.log(JSON.stringify({ inkW: x1 - x0 + 1, inkH: y1 - y0 + 1, x0, x1, y0, y1,
  rowProfile: rows.map((n, j) => (n ? j : null)).filter((v) => v !== null).join(","),
}));
