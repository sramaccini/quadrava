/*
 * Chart geometry: pure functions, without Angular and without DOM.
 */

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * «Round» scale for the value axis: it always includes zero and reaches a multiple of 1, 2, 2.5 or 5 times a
 * power of ten, with about `count` intervals. With all values null it returns 0–1.
 */
export function niceScale(values: number[], count = 4): Scale {
  const finite = values.filter((v) => Number.isFinite(v));
  const lo = Math.min(0, ...finite);
  const hi = Math.max(0, ...finite);
  if (lo === hi) return { min: 0, max: 1, ticks: [0, 1] };
  const raw = (hi - lo) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return { min, max, ticks };
}

/** Point on a circle; angle 0 is at the top and grows clockwise. */
function point(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

const f = (n: number): string => n.toFixed(2);

/**
 * SVG paths of the slices of a doughnut. Negative or non-numeric values count as zero; a slice that takes
 * the whole circle is drawn as two half circles (a single 360° arc cannot be represented).
 */
export function pieSlices(values: number[], cx: number, cy: number, outer: number, inner: number): { path: string; share: number }[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total === 0) return clean.map(() => ({ path: '', share: 0 }));
  let start = 0;
  return clean.map((v) => {
    const share = v / total;
    if (share === 0) return { path: '', share };
    if (share >= 0.9999) {
      const [ax, ay] = point(cx, cy, outer, 0);
      const [bx, by] = point(cx, cy, outer, Math.PI);
      const [ix, iy] = point(cx, cy, inner, 0);
      const [jx, jy] = point(cx, cy, inner, Math.PI);
      return {
        share,
        path: `M${f(ax)},${f(ay)} A${outer},${outer} 0 1 1 ${f(bx)},${f(by)} A${outer},${outer} 0 1 1 ${f(ax)},${f(ay)} M${f(ix)},${f(iy)} A${inner},${inner} 0 1 0 ${f(jx)},${f(jy)} A${inner},${inner} 0 1 0 ${f(ix)},${f(iy)} Z`,
      };
    }
    const end = start + share * 2 * Math.PI;
    const large = end - start > Math.PI ? 1 : 0;
    const [x1, y1] = point(cx, cy, outer, start);
    const [x2, y2] = point(cx, cy, outer, end);
    const [x3, y3] = point(cx, cy, inner, end);
    const [x4, y4] = point(cx, cy, inner, start);
    start = end;
    return {
      share,
      path: `M${f(x1)},${f(y1)} A${outer},${outer} 0 ${large} 1 ${f(x2)},${f(y2)} L${f(x3)},${f(y3)} A${inner},${inner} 0 ${large} 0 ${f(x4)},${f(y4)} Z`,
    };
  });
}
