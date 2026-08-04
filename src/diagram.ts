import type { DiagramNode, OrchestrationEdge, OrchestrationShape, ShapeKind } from './types';

export const kindLabels: Record<ShapeKind, string> = {
  start: 'Start',
  receive: 'Receive',
  send: 'Send',
  construct: 'Construct',
  transform: 'Transform',
  decision: 'Decide',
  loop: 'Loop',
  scope: 'Scope',
  expression: 'Expression',
  call: 'Call',
  listen: 'Listen',
  delay: 'Delay',
  terminate: 'Terminate',
  exception: 'Exception',
  artifact: 'Artifact',
  unknown: 'Unknown',
};

export const kindColors: Record<ShapeKind, { fill: string; stroke: string; text: string }> = {
  start: { fill: '#ecfdf5', stroke: '#059669', text: '#064e3b' },
  receive: { fill: '#e0f2fe', stroke: '#0284c7', text: '#0c4a6e' },
  send: { fill: '#fef3c7', stroke: '#d97706', text: '#78350f' },
  construct: { fill: '#f3e8ff', stroke: '#9333ea', text: '#581c87' },
  transform: { fill: '#fce7f3', stroke: '#db2777', text: '#831843' },
  decision: { fill: '#fff7ed', stroke: '#ea580c', text: '#7c2d12' },
  loop: { fill: '#ecfeff', stroke: '#0891b2', text: '#164e63' },
  scope: { fill: '#eef2ff', stroke: '#4f46e5', text: '#312e81' },
  expression: { fill: '#f1f5f9', stroke: '#475569', text: '#0f172a' },
  call: { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d' },
  listen: { fill: '#ede9fe', stroke: '#7c3aed', text: '#4c1d95' },
  delay: { fill: '#fafaf9', stroke: '#78716c', text: '#292524' },
  terminate: { fill: '#fee2e2', stroke: '#dc2626', text: '#7f1d1d' },
  exception: { fill: '#ffe4e6', stroke: '#e11d48', text: '#881337' },
  artifact: { fill: '#f8fafc', stroke: '#64748b', text: '#334155' },
  unknown: { fill: '#f4f4f5', stroke: '#71717a', text: '#27272a' },
};

export function layoutShapes(shapes: OrchestrationShape[]): DiagramNode[] {
  const width = 260;
  const height = 84;
  const gapY = 38;
  const centerX = 360;
  const branchGapX = 320;
  const containerIndentX = 150;
  const startY = 58;
  const branchKinds = new Set<ShapeKind>(['decision', 'listen']);
  const containerKinds = new Set<ShapeKind>(['scope', 'loop', 'construct', 'exception']);
  const childCounts = shapes.reduce<Map<string, number>>((counts, shape) => {
    if (!shape.parentId) return counts;
    counts.set(shape.parentId, (counts.get(shape.parentId) || 0) + 1);
    return counts;
  }, new Map());
  const siblingsSeen = new Map<string, number>();
  const positioned = new Map<string, DiagramNode>();

  const nodes = shapes.map((shape, index) => {
    const parent = shape.parentId ? positioned.get(shape.parentId) : undefined;
    const siblingIndex = shape.parentId ? siblingsSeen.get(shape.parentId) || 0 : 0;
    if (shape.parentId) siblingsSeen.set(shape.parentId, siblingIndex + 1);

    let x = centerX;
    if (parent) {
      const count = childCounts.get(parent.id) || 1;
      const isBranchChild = branchKinds.has(parent.kind) && count > 1;
      const isContainerChild = containerKinds.has(parent.kind);

      if (isBranchChild) {
        x = parent.x + (siblingIndex - (count - 1) / 2) * branchGapX;
      } else if (isContainerChild) {
        x = parent.x + containerIndentX;
      } else {
        x = parent.x;
      }
    }

    const node: DiagramNode = {
      ...shape,
      x,
      y: startY + index * (height + gapY),
      width,
      height,
    };
    positioned.set(shape.id, node);
    return node;
  });

  const minX = Math.min(...nodes.map((node) => node.x), centerX);
  const shiftX = minX < 48 ? 48 - minX : 0;
  return shiftX ? nodes.map((node) => ({ ...node, x: node.x + shiftX })) : nodes;
}

export function edgePath(edge: OrchestrationEdge, from?: DiagramNode, to?: DiagramNode): string {
  if (!from || !to) return '';
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const c1y = y1 + Math.max(24, (y2 - y1) / 2);
  const c2y = y2 - Math.max(24, (y2 - y1) / 2);

  if (edge.kind === 'contains') {
    const startX = from.x + from.width;
    const endX = to.x;
    const midX = startX + Math.max(24, (endX - startX) / 2);
    return `M ${startX} ${from.y + from.height / 2} C ${midX} ${from.y + from.height / 2}, ${midX} ${to.y + to.height / 2}, ${endX} ${to.y + to.height / 2}`;
  }

  return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
}
