/** Deterministic PRNG so placeholder visuals are stable across renders. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1e6) / 1e6;
  };
}

/**
 * Monochrome "photograph" built from layered gradients — stands in for a real image
 * until `src` is set on the photo. Returns a CSS background value.
 */
export function placeholderTone(seed: number): string {
  const r = rng(seed * 7919);
  const layers: string[] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = Math.round(r() * 100);
    const y = Math.round(r() * 100);
    const g = Math.round(40 + r() * 190);
    const size = Math.round(30 + r() * 60);
    layers.push(`radial-gradient(circle at ${x}% ${y}%, rgb(${g} ${g} ${g} / ${(0.35 + r() * 0.5).toFixed(2)}) 0%, transparent ${size}%)`);
  }
  const angle = Math.round(r() * 360);
  const a = Math.round(8 + r() * 40);
  const b = Math.round(30 + r() * 90);
  layers.push(`linear-gradient(${angle}deg, rgb(${a} ${a} ${a}), rgb(${b} ${b} ${b}))`);
  return layers.join(', ');
}
