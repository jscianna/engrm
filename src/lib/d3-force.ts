export type SimulationNodeDatum = {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

export type SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> = {
  source: NodeDatum | string;
  target: NodeDatum | string;
};

type TickListener = () => void;

interface Force<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>> {
  apply(
    nodes: NodeDatum[],
    links: LinkDatum[],
    alpha: number,
    lookupNode: (value: NodeDatum | string) => NodeDatum | null,
  ): void;
}

class LinkForce<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>
  implements Force<NodeDatum, LinkDatum>
{
  private idAccessor: (node: NodeDatum) => string = (node) => {
    const record = node as Record<string, unknown>;
    return String(record.id ?? "");
  };

  private linkDistance = 80;
  private linkStrength = 0.06;

  id(accessor: (node: NodeDatum) => string): this {
    this.idAccessor = accessor;
    return this;
  }

  distance(value: number): this {
    this.linkDistance = value;
    return this;
  }

  strength(value: number): this {
    this.linkStrength = value;
    return this;
  }

  apply(
    _nodes: NodeDatum[],
    links: LinkDatum[],
    alpha: number,
    lookupNode: (value: NodeDatum | string) => NodeDatum | null,
  ) {
    for (const link of links) {
      const source = typeof link.source === "string" ? lookupNode(link.source) : link.source;
      const target = typeof link.target === "string" ? lookupNode(link.target) : link.target;
      if (!source || !target) {
        continue;
      }

      const sx = source.x ?? 0;
      const sy = source.y ?? 0;
      const tx = target.x ?? 0;
      const ty = target.y ?? 0;

      let dx = tx - sx;
      let dy = ty - sy;
      const distance = Math.hypot(dx, dy) || 1;
      const spring = (distance - this.linkDistance) * this.linkStrength * alpha;

      dx /= distance;
      dy /= distance;

      source.vx = (source.vx ?? 0) + spring * dx;
      source.vy = (source.vy ?? 0) + spring * dy;
      target.vx = (target.vx ?? 0) - spring * dx;
      target.vy = (target.vy ?? 0) - spring * dy;
    }
  }

  getId(node: NodeDatum): string {
    return this.idAccessor(node);
  }
}

class ManyBodyForce<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>
  implements Force<NodeDatum, LinkDatum>
{
  private strengthValue = -120;

  strength(value: number): this {
    this.strengthValue = value;
    return this;
  }

  apply(
    nodes: NodeDatum[],
    _links: LinkDatum[],
    alpha: number,
    _lookupNode: (value: NodeDatum | string) => NodeDatum | null,
  ) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const ax = a.x ?? 0;
        const ay = a.y ?? 0;
        const bx = b.x ?? 0;
        const by = b.y ?? 0;

        let dx = bx - ax;
        let dy = by - ay;
        const distSq = Math.max(dx * dx + dy * dy, 16);
        const force = (this.strengthValue * alpha) / distSq;
        const distance = Math.sqrt(distSq);
        dx /= distance;
        dy /= distance;

        a.vx = (a.vx ?? 0) - force * dx;
        a.vy = (a.vy ?? 0) - force * dy;
        b.vx = (b.vx ?? 0) + force * dx;
        b.vy = (b.vy ?? 0) + force * dy;
      }
    }
  }
}

class CenterForce<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>
  implements Force<NodeDatum, LinkDatum>
{
  constructor(
    private cx: number,
    private cy: number,
  ) {}

  apply(nodes: NodeDatum[], _links: LinkDatum[], alpha: number) {
    for (const node of nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      node.vx = (node.vx ?? 0) + (this.cx - x) * 0.01 * alpha;
      node.vy = (node.vy ?? 0) + (this.cy - y) * 0.01 * alpha;
    }
  }
}

export class ForceSimulation<
  NodeDatum extends SimulationNodeDatum,
  LinkDatum extends SimulationLinkDatum<NodeDatum>,
> {
  private alphaValue = 1;
  private alphaDecayValue = 0.03;
  private velocityDecayValue = 0.3;
  private running = false;
  private tickListener: TickListener | null = null;
  private forces = new Map<string, Force<NodeDatum, LinkDatum>>();
  private links: LinkDatum[] = [];
  private animationId: number | null = null;

  constructor(private nodeList: NodeDatum[]) {
    this.seedNodes();
  }

  private seedNodes() {
    const radius = 160;
    for (let i = 0; i < this.nodeList.length; i += 1) {
      const node = this.nodeList[i];
      node.x = node.x ?? Math.cos((i / Math.max(this.nodeList.length, 1)) * Math.PI * 2) * radius;
      node.y = node.y ?? Math.sin((i / Math.max(this.nodeList.length, 1)) * Math.PI * 2) * radius;
      node.vx = node.vx ?? 0;
      node.vy = node.vy ?? 0;
    }
  }

  nodes(nodes?: NodeDatum[]): NodeDatum[] | this {
    if (!nodes) {
      return this.nodeList;
    }
    this.nodeList = nodes;
    this.seedNodes();
    return this;
  }

  force(name: string): Force<NodeDatum, LinkDatum> | undefined;
  force(name: string, value: Force<NodeDatum, LinkDatum> | null): this;
  force(name: string, value?: Force<NodeDatum, LinkDatum> | null): this | Force<NodeDatum, LinkDatum> | undefined {
    if (typeof value === "undefined") {
      return this.forces.get(name);
    }
    if (value === null) {
      this.forces.delete(name);
      return this;
    }
    this.forces.set(name, value);
    return this;
  }

  setLinks(links: LinkDatum[]): this {
    this.links = links;
    return this;
  }

  on(event: "tick", listener: TickListener): this {
    if (event === "tick") {
      this.tickListener = listener;
    }
    return this;
  }

  alpha(): number;
  alpha(value: number): this;
  alpha(value?: number): number | this {
    if (typeof value === "undefined") {
      return this.alphaValue;
    }
    this.alphaValue = value;
    return this;
  }

  alphaDecay(): number;
  alphaDecay(value: number): this;
  alphaDecay(value?: number): number | this {
    if (typeof value === "undefined") {
      return this.alphaDecayValue;
    }
    this.alphaDecayValue = value;
    return this;
  }

  velocityDecay(): number;
  velocityDecay(value: number): this;
  velocityDecay(value?: number): number | this {
    if (typeof value === "undefined") {
      return this.velocityDecayValue;
    }
    this.velocityDecayValue = value;
    return this;
  }

  restart(): this {
    if (!this.running) {
      this.running = true;
      this.tickLoop();
    }
    return this;
  }

  stop(): this {
    this.running = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    return this;
  }

  private lookupNode(value: NodeDatum | string): NodeDatum | null {
    if (typeof value !== "string") {
      return value;
    }

    const linkForce = this.forces.get("link") as LinkForce<NodeDatum, LinkDatum> | undefined;
    if (linkForce) {
      const found = this.nodeList.find((node) => linkForce.getId(node) === value);
      if (found) {
        return found;
      }
    }

    const generic = this.nodeList.find((node) => {
      const record = node as Record<string, unknown>;
      return String(record.id ?? "") === value;
    });
    return generic ?? null;
  }

  private tickLoop() {
    if (!this.running) {
      return;
    }

    this.alphaValue *= 1 - this.alphaDecayValue;
    for (const force of this.forces.values()) {
      force.apply(this.nodeList, this.links, this.alphaValue, (value) => this.lookupNode(value));
    }

    for (const node of this.nodeList) {
      if (typeof node.fx === "number") {
        node.x = node.fx;
        node.vx = 0;
      }
      if (typeof node.fy === "number") {
        node.y = node.fy;
        node.vy = 0;
      }

      node.vx = (node.vx ?? 0) * (1 - this.velocityDecayValue);
      node.vy = (node.vy ?? 0) * (1 - this.velocityDecayValue);
      node.x = (node.x ?? 0) + (node.vx ?? 0);
      node.y = (node.y ?? 0) + (node.vy ?? 0);
    }

    this.tickListener?.();

    if (this.alphaValue < 0.005) {
      this.stop();
      return;
    }

    this.animationId = requestAnimationFrame(() => this.tickLoop());
  }
}

export function forceSimulation<
  NodeDatum extends SimulationNodeDatum,
  LinkDatum extends SimulationLinkDatum<NodeDatum>,
>(nodes: NodeDatum[]) {
  return new ForceSimulation<NodeDatum, LinkDatum>(nodes);
}

export function forceLink<
  NodeDatum extends SimulationNodeDatum,
  LinkDatum extends SimulationLinkDatum<NodeDatum>,
>(links: LinkDatum[]) {
  const force = new LinkForce<NodeDatum, LinkDatum>();
  const wrapper = {
    id(accessor: (node: NodeDatum) => string) {
      force.id(accessor);
      return wrapper;
    },
    distance(value: number) {
      force.distance(value);
      return wrapper;
    },
    strength(value: number) {
      force.strength(value);
      return wrapper;
    },
    apply(
      nodes: NodeDatum[],
      activeLinks: LinkDatum[],
      alpha: number,
      lookupNode: (value: NodeDatum | string) => NodeDatum | null,
    ) {
      const nextLinks = activeLinks.length > 0 ? activeLinks : links;
      force.apply(nodes, nextLinks, alpha, lookupNode);
    },
    getId(node: NodeDatum) {
      return force.getId(node);
    },
  };
  return wrapper;
}

export function forceManyBody<
  NodeDatum extends SimulationNodeDatum,
  LinkDatum extends SimulationLinkDatum<NodeDatum>,
>() {
  const force = new ManyBodyForce<NodeDatum, LinkDatum>();
  const wrapper = {
    strength(value: number) {
      force.strength(value);
      return wrapper;
    },
    apply(
      nodes: NodeDatum[],
      links: LinkDatum[],
      alpha: number,
      lookupNode: (value: NodeDatum | string) => NodeDatum | null,
    ) {
      force.apply(nodes, links, alpha, lookupNode);
    },
  };
  return wrapper;
}

export function forceCenter<
  NodeDatum extends SimulationNodeDatum,
  LinkDatum extends SimulationLinkDatum<NodeDatum>,
>(x: number, y: number) {
  return new CenterForce<NodeDatum, LinkDatum>(x, y);
}
