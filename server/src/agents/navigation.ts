interface Point { x: number; z: number }
/** Bounded 4m grid search. Only used when direct steering meets an obstacle. */
export function walkPath(start: Point, target: Point, blocked: (x: number, z: number) => boolean): Point[] {
  const step = 4, bound = 38;
  const cell = (p: Point) => ({ x: Math.round(p.x / step), z: Math.round(p.z / step) });
  const from = cell(start), to = cell(target);
  const key = (p: Point) => `${p.x},${p.z}`;
  const nodes = new Map<string, { point: Point; parent: string | null; cost: number }>();
  const open: { point: Point; score: number }[] = [{ point: from, score: 0 }];
  nodes.set(key(from), { point: from, parent: null, cost: 0 });
  let best = key(from), bestDistance = Infinity;
  for (let count = 0; open.length && count < 2400; count++) {
    open.sort((a, b) => b.score - a.score);
    const current = open.pop()!.point, id = key(current), node = nodes.get(id)!;
    const distance = Math.abs(current.x - to.x) + Math.abs(current.z - to.z);
    if (distance < bestDistance) { bestDistance = distance; best = id; }
    if (distance === 0) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx, z: current.z + dz }, nextKey = key(next);
      if (Math.abs(next.x) > bound || Math.abs(next.z) > bound || nodes.has(nextKey)) continue;
      // Check intermediate samples too: a thin obstacle must not be crossed.
      if ([1, 2, 3, 4].some(t => blocked(current.x * step + dx * t, current.z * step + dz * t))) continue;
      const cost = node.cost + 1;
      nodes.set(nextKey, { point: next, parent: id, cost });
      open.push({ point: next, score: cost + Math.abs(next.x - to.x) + Math.abs(next.z - to.z) });
    }
  }
  const path: Point[] = [];
  for (let id: string | null = best; id; id = nodes.get(id)!.parent) {
    const p = nodes.get(id)!.point;
    path.push({ x: p.x * step, z: p.z * step });
  }
  path.reverse();
  if (path.length > 1) path.shift();
  if (!blocked(target.x, target.z) && bestDistance === 0) path.push(target);
  return path;
}
