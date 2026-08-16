
import type { ArtifactReference, OrchestrationEdge, OrchestrationShape, ParsedArtifact, ShapeKind } from './types';

const shapeTerms: Array<[ShapeKind, RegExp]> = [
  ['receive', /(receive|receiveshape)/i],
  ['send', /(^send$|sendshape|sendport|transmit)/i],
  ['construct', /(construct|constructmessage|messageassignment)/i],
  ['transform', /(transform|map|mapping|btm)/i],
  ['decision', /(decide|decision|branch|rule|condition|if)/i],
  ['loop', /(loop|while|foreach|repeat)/i],
  ['scope', /(scope|transaction|compensation)/i],
  ['expression', /(expression|assignment|code)/i],
  ['call', /(callorchestration|startorchestration|call)/i],
  ['listen', /(listen|parallel|pick)/i],
  ['delay', /(delay|timeout|wait)/i],
  ['terminate', /(terminate|suspend|throw)/i],
  ['exception', /(exception|faulthandler|catch)/i],
  ['artifact', /(schema|element|record|binding|service|porttype|operation)/i],
];

const shapeNameAttrs = ['Name', 'name', 'Identifier', 'identifier', 'DisplayName', 'displayName', 'ShapeName', 'shapeName', 'Type', 'type'];
const referenceAttrMap: Array<[ArtifactReference['kind'], RegExp]> = [
  ['message', /(message|messagetype|source|target)/i],
  ['port', /(port|portname|sendport|receiveport)/i],
  ['map', /(map|mapname|transform)/i],
  ['schema', /(schema|namespace|elementtype|documenttype)/i],
  ['binding', /(binding|address|uri|transport)/i],
  ['operation', /(operation|action|method)/i],
  ['correlation', /(correlation|correlationset)/i],
  ['variable', /(variable|property)/i],
];

const ignoredTags = new Set([
  'annotation',
  'appinfo',
  'documentation',
  'import',
  'include',
  'restriction',
  'extension',
  'simpletype',
  'complextype',
  'property',
]);

function localName(node: Element): string {
  return node.localName || node.nodeName.replace(/^.*:/, '');
}

function getProperty(node: Element, name: string): string | undefined {
  const property = Array.from(node.children).find((child) => {
    if (!/property/i.test(localName(child))) return false;
    return child.getAttribute('Name')?.toLowerCase() === name.toLowerCase();
  });

  return property?.getAttribute('Value') || property?.textContent?.trim() || undefined;
}

function attrs(node: Element): Record<string, string> {
  return Array.from(node.attributes).reduce<Record<string, string>>((bag, attr) => {
    bag[attr.name] = attr.value;
    return bag;
  }, {});
}

function pickName(node: Element, fallback: string): string {
  for (const attr of shapeNameAttrs) {
    const value = node.getAttribute(attr);
    if (value) return value;
  }

  const propertyName = getProperty(node, 'Name') || getProperty(node, 'Identifier') || getProperty(node, 'DisplayName');
  if (propertyName) return propertyName;

  const directName = Array.from(node.children).find((child) => /name/i.test(localName(child)));
  const text = directName?.textContent?.trim();
  return text || fallback;
}

function detectKind(node: Element): ShapeKind {
  const haystack = [
    localName(node),
    node.getAttribute('Type'),
    node.getAttribute('type'),
    node.getAttribute('ShapeType'),
    node.getAttribute('ClassName'),
    node.getAttribute('Name'),
    getProperty(node, 'Type'),
    getProperty(node, 'ClassName'),
    getProperty(node, 'Name'),
  ]
    .filter(Boolean)
    .join(' ');

  for (const [kind, matcher] of shapeTerms) {
    if (matcher.test(haystack)) return kind;
  }

  return 'unknown';
}

function isCandidate(node: Element, kind: ShapeKind): boolean {
  const tag = localName(node).toLowerCase();
  if (ignoredTags.has(tag)) return false;
  if (kind !== 'unknown') return true;
  if (node.hasAttribute('Name') || node.hasAttribute('name') || node.hasAttribute('Identifier')) {
    return Array.from(node.attributes).some((attr) => /(shape|message|port|map|operation|service|schema|type)/i.test(attr.name + attr.value));
  }
  return false;
}

function referencesFrom(node: Element): ArtifactReference[] {
  const found = new Map<string, ArtifactReference>();

  for (const attr of Array.from(node.attributes)) {
    if (!attr.value || attr.value.length > 240) continue;
    const hit = referenceAttrMap.find(([, matcher]) => matcher.test(attr.name));
    if (!hit) continue;
    const ref: ArtifactReference = { kind: hit[0], name: attr.value };
    found.set(`${ref.kind}:${ref.name}`, ref);
  }

  for (const property of Array.from(node.children).filter((child) => /property/i.test(localName(child)))) {
    const key = property.getAttribute('Name') || '';
    const value = property.getAttribute('Value') || property.textContent?.trim() || '';
    if (!key || !value || value.length > 240) continue;
    const hit = referenceAttrMap.find(([, matcher]) => matcher.test(key));
    if (!hit) continue;
    const ref: ArtifactReference = { kind: hit[0], name: value };
    found.set(`${ref.kind}:${ref.name}`, ref);
  }

  for (const child of Array.from(node.children).slice(0, 18)) {
    const tag = localName(child);
    if (!/(message|port|map|schema|operation|correlation|variable|binding)/i.test(tag)) continue;
    const text = child.textContent?.trim();
    const name = child.getAttribute('Name') || child.getAttribute('name') || child.getAttribute('Type') || text;
    if (!name || name.length > 240) continue;
    const hit = referenceAttrMap.find(([, matcher]) => matcher.test(tag));
    const ref: ArtifactReference = { kind: hit?.[0] || 'variable', name };
    found.set(`${ref.kind}:${ref.name}`, ref);
  }

  return Array.from(found.values());
}

function migrationHint(kind: ShapeKind): string {
  switch (kind) {
    case 'receive':
      return 'Logic Apps trigger or Request action. Confirm activation, correlation, and port binding behavior.';
    case 'send':
      return 'Logic Apps connector/action. Preserve operation, retry policy, response handling, and promoted context values.';
    case 'construct':
      return 'Compose, Variables, or inline code. Watch for message immutability and distinguished/promoted properties.';
    case 'transform':
      return 'Map action, Liquid, XSLT, or custom function depending on map complexity and functoids.';
    case 'decision':
      return 'Condition or Switch. Review rule expressions and branch ordering.';
    case 'loop':
      return 'For each or Until. Check concurrency, ordering, and timeout semantics.';
    case 'scope':
      return 'Scope action. Map exception, compensation, and transaction behavior explicitly.';
    case 'expression':
      return 'Expression, variable assignment, or Azure Function when XLANG/s code is non-trivial.';
    case 'call':
      return 'Child workflow invocation. Confirm synchronous/asynchronous behavior.';
    case 'listen':
      return 'Parallel branches with trigger-like waits. Confirm first-wins behavior.';
    case 'delay':
      return 'Delay action. Confirm timeout and dehydration assumptions.';
    case 'terminate':
      return 'Terminate action. Preserve fault details and status codes.';
    case 'exception':
      return 'Run-after failure path or Scope error handling. Preserve compensation logic.';
    case 'artifact':
      return 'Referenced artifact. Link this to schemas, maps, ports, and deployment bindings.';
    default:
      return 'Unrecognized BizTalk/XML node. Inspect attributes and map manually.';
  }
}

function summarize(shapes: OrchestrationShape[]) {
  return {
    totalShapes: shapes.length,
    receives: shapes.filter((shape) => shape.kind === 'receive').length,
    sends: shapes.filter((shape) => shape.kind === 'send').length,
    transforms: shapes.filter((shape) => shape.kind === 'transform').length,
    decisions: shapes.filter((shape) => shape.kind === 'decision').length,
    scopes: shapes.filter((shape) => shape.kind === 'scope').length,
    references: shapes.reduce((sum, shape) => sum + shape.references.length, 0),
  };
}

export function parseBizTalkXml(fileName: string, source: string): ParsedArtifact {
  const firstMarkup = source.search(/<[\w!?]/);
  const xmlSource = firstMarkup > 0 ? source.slice(firstMarkup) : source;
  const parser = new DOMParser();
  const document = parser.parseFromString(xmlSource, 'application/xml');
  const parseError = document.querySelector('parsererror');
  if (parseError) {
    throw new Error('The file could not be parsed as XML. If this is an ODX file, check that it was uploaded from source control rather than a compiled artifact.');
  }

  const root = document.documentElement;
  const namespace = root.getAttribute('targetNamespace') || root.namespaceURI || undefined;
  const title =
    root.getAttribute('Name') ||
    root.getAttribute('name') ||
    root.getAttribute('targetNamespace') ||
    fileName.replace(/\.[^.]+$/, '');

  const shapes: OrchestrationShape[] = [];
  const edges: OrchestrationEdge[] = [];
  const elementShapeId = new WeakMap<Element, string>();
  const diagnostics: string[] = [];

  function visit(node: Element, depth: number, parentId?: string) {
    const kind = detectKind(node);
    const candidate = isCandidate(node, kind);
    let currentParentId = parentId;

    if (candidate) {
      const id = `shape-${shapes.length + 1}`;
      elementShapeId.set(node, id);
      const name = pickName(node, `${localName(node)} ${shapes.length + 1}`);
      const shape: OrchestrationShape = {
        id,
        name,
        kind,
        sourceTag: localName(node),
        depth,
        parentId,
        attributes: attrs(node),
        references: referencesFrom(node),
        migrationHint: migrationHint(kind),
      };
      shapes.push(shape);
      currentParentId = id;

      if (parentId) {
        edges.push({
          id: `edge-${edges.length + 1}`,
          from: parentId,
          to: id,
          kind: 'contains',
        });
      }
    }

    for (const child of Array.from(node.children)) {
      visit(child, depth + 1, currentParentId);
    }
  }

  visit(root, 0);

  const flowShapes = shapes.filter((shape) => shape.kind !== 'artifact' || shapes.length < 8);
  for (let i = 0; i < flowShapes.length - 1; i += 1) {
    const current = flowShapes[i];
    const next = flowShapes[i + 1];
    if (current.parentId === next.parentId || Math.abs(current.depth - next.depth) <= 1) {
      edges.push({
        id: `edge-${edges.length + 1}`,
        from: current.id,
        to: next.id,
        kind: 'sequence',
      });
    }
  }

  if (!shapes.length) {
    diagnostics.push('No orchestration shapes were detected. The file may be a schema/map-only artifact or a compiled export that needs a custom reader.');
  }

  if (shapes.length > 160) {
    diagnostics.push('Large artifact detected. The viewer rendered the full model, but filtering by shape type may be easier to read.');
  }

  return {
    fileName,
    title,
    namespace,
    summary: summarize(shapes),
    shapes,
    edges,
    diagnostics,
  };
}

