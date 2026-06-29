export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function snapDegrees(value: number, step = 45): number {
  return normalizeDegrees(Math.round(value / step) * step);
}

export function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function radiansFromDegrees(value: number): number {
  return (normalizeDegrees(value) * Math.PI) / 180;
}
