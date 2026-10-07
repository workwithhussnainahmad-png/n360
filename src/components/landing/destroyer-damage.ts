// Created only for surfaces touched during play; no pre-splitting of the DOM.
export type Fragment = { column: number; row: number; health: number; strength: number; hits: number; broken: boolean; cracks: { x: number; y: number; seed: number }[] };
export type DamageGrid = { columns: number; rows: number; fragments: Map<number, Fragment>; broken: number };

export function createDamageGrid(width: number, height: number): DamageGrid {
  return { columns: Math.max(1, Math.ceil(width / 52)), rows: Math.max(1, Math.ceil(height / 52)), fragments: new Map(), broken: 0 };
}

export function fragmentAt(grid: DamageGrid, x: number, y: number) {
  const column = Math.min(grid.columns - 1, Math.max(0, Math.floor(x * grid.columns)));
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(y * grid.rows)));
  const key = row * grid.columns + column;
  let fragment = grid.fragments.get(key);
  if (!fragment) {
    const strength = 2 + Math.floor(Math.random() * 2);
    fragment = { column, row, strength, health: strength, hits: 0, broken: false, cracks: [] };
    grid.fragments.set(key, fragment);
  }
  return fragment;
}

// Shared, deterministic vertices let neighboring broken pieces join cleanly.
// Coordinates are relative to the surface, so holes survive responsive resizing.
export function fragmentPolygon(grid: DamageGrid, column: number, row: number) {
  const vertex = (x: number, y: number): [number, number] => {
    const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const jitter = (noise - Math.floor(noise) - .5) * .24;
    return [(x + (x > 0 && x < grid.columns ? jitter : 0)) / grid.columns,
      (y + (y > 0 && y < grid.rows ? jitter : 0)) / grid.rows];
  };
  return [vertex(column, row), vertex(column + 1, row), vertex(column + 1, row + 1), vertex(column, row + 1)];
}

export function fragmentMask(grid: DamageGrid, repairs?: Map<Fragment, number>) {
  let path = "M0 0H1V1H0Z";
  for (const fragment of grid.fragments.values()) {
    if (!fragment.broken) continue;
    path += "M" + fragmentPolygon(grid, fragment.column, fragment.row).map(point => point.map(n => n.toFixed(6)).join(" ")).join("L") + "Z";
  }
  let restoring = "";
  repairs?.forEach((opacity, fragment) => {
    if (!fragment.broken) return;
    const polygon = fragmentPolygon(grid, fragment.column, fragment.row).map(point => point.map(n => n.toFixed(6)).join(" ")).join("L");
    restoring += `<path fill="white" opacity="${opacity.toFixed(3)}" d="M${polygon}Z"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path fill="white" fill-rule="evenodd" d="${path}"/>${restoring}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
