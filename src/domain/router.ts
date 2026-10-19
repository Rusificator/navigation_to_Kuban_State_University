import type {
  CampusPackage,
  NavEdge,
  NavNode,
  RouteProfile,
  RouteResult,
  RouteStep,
} from "./types";

class MinHeap {
  private values: [number, string][] = [];
  get length() {
    return this.values.length;
  }
  push(cost: number, id: string) {
    const entry: [number, string] = [cost, id];
    let i = this.values.push(entry) - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.values[p][0] <= cost) break;
      this.values[i] = this.values[p];
      i = p;
    }
    this.values[i] = entry;
  }
  pop(): [number, string] {
    const first = this.values[0],
      last = this.values.pop()!;
    if (this.values.length) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let c = i * 2 + 1;
        if (
          c + 1 < this.values.length &&
          this.values[c + 1][0] < this.values[c][0]
        )
          c++;
        if (this.values[c][0] >= last[0]) break;
        this.values[i] = this.values[c];
        i = c;
      }
      this.values[i] = last;
    }
    return first;
  }
}

/** Multi-source Dijkstra. No fabricated links, distances or disconnected fallback lines. */
export class Router {
  readonly nodes: Map<string, NavNode>;
  readonly edges: Map<string, NavEdge>;
  private adj = new Map<string, { node: string; edge: NavEdge }[]>();
  constructor(private campus: CampusPackage) {
    this.nodes = new Map(campus.nodes.map((n) => [n.id, n]));
    this.edges = new Map(campus.edges.map((e) => [e.id, e]));
    for (const n of campus.nodes) this.adj.set(n.id, []);
    for (const edge of campus.edges) {
      this.adj.get(edge.from)?.push({ node: edge.to, edge });
      if (edge.bidirectional)
        this.adj.get(edge.to)?.push({ node: edge.from, edge });
    }
  }
  find(
    from: string[],
    to: string[],
    profile: RouteProfile = "walking",
  ): RouteResult {
    const starts = from.filter((id) => this.nodes.has(id)),
      goals = new Set(to.filter((id) => this.nodes.has(id)));
    if (!starts.length || !goals.size)
      return { ok: false, reason: "invalid-point" };
    const heap = new MinHeap(),
      distance = new Map<string, number>();
    const previous = new Map<string, { node: string; edge: string }>();
    for (const id of starts) {
      distance.set(id, 0);
      heap.push(0, id);
    }
    let goal: string | undefined;
    while (heap.length) {
      const [cost, id] = heap.pop();
      if (cost !== distance.get(id)) continue;
      if (goals.has(id)) {
        goal = id;
        break;
      }
      for (const { node, edge } of this.adj.get(id) ?? []) {
        if (
          edge.closed ||
          (profile === "stepFree" &&
            (edge.kind === "stairs" || edge.accessible !== "yes"))
        )
          continue;
        const next = cost + edge.cost;
        if (next < (distance.get(node) ?? Infinity)) {
          distance.set(node, next);
          previous.set(node, { node: id, edge: edge.id });
          heap.push(next, node);
        }
      }
    }
    if (!goal)
      return {
        ok: false,
        reason:
          profile === "stepFree" ? "accessibility-unverified" : "no-route",
      };
    const nodeIds = [goal],
      edgeIds: string[] = [];
    let cursor = goal;
    while (previous.has(cursor)) {
      const p = previous.get(cursor)!;
      nodeIds.push(p.node);
      edgeIds.push(p.edge);
      cursor = p.node;
    }
    nodeIds.reverse();
    edgeIds.reverse();
    const path = nodeIds.map((id) => this.nodes.get(id)!);
    const planarUnits = path
      .slice(1)
      .reduce(
        (sum, node, i) =>
          sum +
          (node.floor === path[i].floor
            ? Math.hypot(node.x - path[i].x, node.y - path[i].y)
            : 0),
        0,
      );
    return {
      ok: true,
      route: {
        nodeIds,
        edgeIds,
        cost: distance.get(goal)!,
        floors: [...new Set(path.map((n) => n.floor))],
        steps: makeSteps(
          path,
          edgeIds.map((id) => this.edges.get(id)!),
        ),
        distanceMeters:
          this.campus.coordinates.metersPerUnit === null
            ? null
            : planarUnits * this.campus.coordinates.metersPerUnit,
      },
    };
  }
}

export function makeSteps(path: NavNode[], edges: NavEdge[]): RouteStep[] {
  if (!path.length) return [];
  const steps: RouteStep[] = [
    {
      id: "start",
      kind: "start",
      floor: path[0].floor,
      nodeId: path[0].id,
      pathIndex: 0,
    },
  ];
  let lastTurn = 0;
  for (let i = 1; i < path.length; i++) {
    const before = path[i - 1],
      node = path[i],
      next = path[i + 1];
    if (before.floor !== node.floor) {
      // Transitions are explicit: GPS must never infer a floor change.
      steps.push({
        id: `floor-${i}`,
        kind:
          edges[i - 1]?.kind === "lift"
            ? "lift"
            : node.floor > before.floor
              ? "stairsUp"
              : "stairsDown",
        floor: before.floor,
        toFloor: node.floor,
        nodeId: before.id,
        pathIndex: i - 1,
      });
      lastTurn = i;
    } else if (edges[i - 1]?.instruction) {
      steps.push({
        id: `passage-${i}`,
        kind: "passage",
        floor: before.floor,
        nodeId: before.id,
        pathIndex: i - 1,
        instruction: edges[i - 1].instruction,
      });
      lastTurn = i;
    } else if (next && next.floor === node.floor && i > lastTurn) {
      const a = { x: node.x - before.x, y: node.y - before.y },
        b = { x: next.x - node.x, y: next.y - node.y };
      const angle =
        (Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180) /
        Math.PI;
      if (
        Math.abs(angle) > 40 &&
        Math.hypot(a.x, a.y) > 1 &&
        Math.hypot(b.x, b.y) > 1
      ) {
        steps.push({
          id: `turn-${i}`,
          kind: angle > 0 ? "right" : "left",
          floor: node.floor,
          nodeId: node.id,
          pathIndex: i,
        });
        lastTurn = i;
      }
    }
  }
  const last = path.at(-1)!;
  steps.push({
    id: "arrive",
    kind: "arrive",
    floor: last.floor,
    nodeId: last.id,
    pathIndex: path.length - 1,
  });
  return steps;
}
