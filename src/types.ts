export type ShapeKind =
  | 'start'
  | 'receive'
  | 'send'
  | 'construct'
  | 'transform'
  | 'decision'
  | 'loop'
  | 'scope'
  | 'expression'
  | 'call'
  | 'listen'
  | 'delay'
  | 'terminate'
  | 'exception'
  | 'artifact'
  | 'unknown';

export interface ArtifactReference {
  kind: 'message' | 'port' | 'map' | 'schema' | 'binding' | 'operation' | 'correlation' | 'variable';
  name: string;
}

export interface OrchestrationShape {
  id: string;
  name: string;
  kind: ShapeKind;
  sourceTag: string;
  depth: number;
  parentId?: string;
  attributes: Record<string, string>;
  references: ArtifactReference[];
  migrationHint: string;
}

export interface OrchestrationEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind: 'sequence' | 'contains' | 'branch';
}

export interface ParsedArtifact {
  fileName: string;
  title: string;
  namespace?: string;
  summary: {
    totalShapes: number;
    receives: number;
    sends: number;
    transforms: number;
    decisions: number;
    scopes: number;
    references: number;
  };
  shapes: OrchestrationShape[];
  edges: OrchestrationEdge[];
  diagnostics: string[];
}

export interface DiagramNode extends OrchestrationShape {
  x: number;
  y: number;
  width: number;
  height: number;
}
