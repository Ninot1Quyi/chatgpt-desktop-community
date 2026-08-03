const DESIGN_ROOT_SIZE = 16;

function compact(value) {
  return Number(value.toFixed(6));
}

export function rem(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return `${compact(value / DESIGN_ROOT_SIZE)}rem`;
}

export function cssPixelsToRem(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  let rootSize = DESIGN_ROOT_SIZE;
  try {
    rootSize = Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    ) || DESIGN_ROOT_SIZE;
  } catch {}
  return `${compact(value / rootSize)}rem`;
}
