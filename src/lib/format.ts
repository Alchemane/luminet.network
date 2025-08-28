export function bytes(n: number) {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length-1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)}${u[i]}`;
}
export function percent(p: number) {
  return `${Math.round(p)}%`;
}