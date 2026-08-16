import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Braces,
  ChevronDown,
  FileJson,
  FileUp,
  Filter,
  GitBranch,
  Move,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { edgePath, kindColors, kindLabels, layoutShapes } from './diagram';
import { parseBizTalkXml } from './parser';
import { sampleOrchestration } from './sample';
import type { DiagramNode, ParsedArtifact, ShapeKind } from './types';
import './styles.css';

const visibleKinds: ShapeKind[] = [
  'receive',
  'send',
  'construct',
  'transform',
  'decision',
  'loop',
  'scope',
  'expression',
  'call',
  'listen',
  'delay',
  'terminate',
  'exception',
  'artifact',
  'unknown',
];

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      if (!(buffer instanceof ArrayBuffer)) {
        reject(new Error('Could not read file contents.'));
        return;
      }

      resolve(decodeTextFile(buffer));
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsArrayBuffer(file);
  });
}

function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  }

  const sampleLength = Math.min(bytes.length, 200);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0 && index % 2 === 0) evenNulls += 1;
    if (bytes[index] === 0 && index % 2 === 1) oddNulls += 1;
  }

  if (oddNulls > sampleLength * 0.2) return new TextDecoder('utf-16le').decode(bytes);
  if (evenNulls > sampleLength * 0.2) return new TextDecoder('utf-16be').decode(bytes);

  return new TextDecoder('utf-8').decode(bytes);
}

function App() {
  const [artifact, setArtifact] = useState<ParsedArtifact>(() => parseBizTalkXml('sample-orchestration.xml', sampleOrchestration));
  const [displayFileName, setDisplayFileName] = useState(artifact.fileName);
  const [selectedId, setSelectedId] = useState<string>('shape-1');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ShapeKind | 'all'>('all');
  const [zoom, setZoom] = useState(0.9);
  const [error, setError] = useState('');
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type !== 'openArtifact' || typeof message.source !== 'string') return;

      const fileName = message.fileName || 'artifact.odx';
      setDisplayFileName(fileName);
      try {
        const parsed = parseBizTalkXml(fileName, message.source);
        setArtifact(parsed);
        setSelectedId(parsed.shapes[0]?.id || '');
        setQuery('');
        setKindFilter('all');
        setManualPositions({});
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to parse this file.');
      }
    };

    window.addEventListener('message', onMessage);
    const acquireVsCodeApi = (globalThis as typeof globalThis & {
      acquireVsCodeApi?: () => { postMessage: (message: unknown) => void };
    }).acquireVsCodeApi;
    acquireVsCodeApi?.().postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const filteredShapes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artifact.shapes.filter((shape) => {
      const kindMatch = kindFilter === 'all' || shape.kind === kindFilter;
      if (!q) return kindMatch;
      const haystack = [
        shape.name,
        shape.kind,
        shape.sourceTag,
        ...Object.values(shape.attributes),
        ...shape.references.map((ref) => ref.name),
      ]
        .join(' ')
        .toLowerCase();
      return kindMatch && haystack.includes(q);
    });
  }, [artifact.shapes, kindFilter, query]);

  const visibleIds = useMemo(() => new Set(filteredShapes.map((shape) => shape.id)), [filteredShapes]);
  const nodes = useMemo(
    () =>
      layoutShapes(filteredShapes).map((node) => ({
        ...node,
        ...(manualPositions[node.id] || {}),
      })),
    [filteredShapes, manualPositions],
  );
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edges = artifact.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  const selected = artifact.shapes.find((shape) => shape.id === selectedId) || filteredShapes[0] || artifact.shapes[0];
  const diagramHeight = Math.max(520, Math.max(...nodes.map((node) => node.y + node.height + 80), 520));
  const diagramWidth = Math.max(940, Math.max(...nodes.map((node) => node.x + node.width + 80), 940));

  async function loadFile(file: File) {
    setError('');
    setDisplayFileName(file.name);
    try {
      const text = await readFile(file);
      const parsed = parseBizTalkXml(file.name, text);
      setArtifact(parsed);
      setSelectedId(parsed.shapes[0]?.id || '');
      setQuery('');
      setKindFilter('all');
      setManualPositions({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse this file.');
    }
  }

  function onDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  function exportModel() {
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${artifact.fileName.replace(/\.[^.]+$/, '')}.viewer-model.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function startDrag(event: React.PointerEvent<SVGGElement>, node: DiagramNode) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      id: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
    };
    setSelectedId(node.id);
  }

  function moveDrag(event: React.PointerEvent<SVGGElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const gridSize = 14;
    const nextX = drag.startX + (event.clientX - drag.startClientX) / zoom;
    const nextY = drag.startY + (event.clientY - drag.startClientY) / zoom;
    setManualPositions((positions) => ({
      ...positions,
      [drag.id]: {
        x: Math.round(nextX / gridSize) * gridSize,
        y: Math.round(nextY / gridSize) * gridSize,
      },
    }));
  }

  function endDrag() {
    dragState.current = null;
  }

  return (
    <main className="app" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={20} />
          </div>
          <div>
            <h1>BizTalk Orchestration Viewer</h1>
            <p>{displayFileName}</p>
          </div>
        </div>

        <section className="upload-panel">
          <input
            ref={fileInput}
            type="file"
            accept=".xml,.odx,.btm,.xsd,.binding,.config,.txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
          <button type="button" className="primary-action" onClick={() => fileInput.current?.click()}>
            <Upload size={18} />
            Open Artifact
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              const parsed = parseBizTalkXml('sample-orchestration.xml', sampleOrchestration);
              setArtifact(parsed);
              setDisplayFileName(parsed.fileName);
              setSelectedId(parsed.shapes[0]?.id || '');
              setError('');
              setManualPositions({});
            }}
            title="Reload sample"
          >
            <RefreshCw size={17} />
            Sample
          </button>
        </section>

        {error && (
          <div className="error-box">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        <section className="stats-grid">
          <Stat label="Shapes" value={artifact.summary.totalShapes} />
          <Stat label="Receive" value={artifact.summary.receives} />
          <Stat label="Send" value={artifact.summary.sends} />
          <Stat label="Maps" value={artifact.summary.transforms} />
          <Stat label="Decide" value={artifact.summary.decisions} />
          <Stat label="Refs" value={artifact.summary.references} />
        </section>

        <section className="control-stack">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shapes" />
          </label>
          <label className="select-box">
            <Filter size={16} />
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as ShapeKind | 'all')}>
              <option value="all">All shapes</option>
              {visibleKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabels[kind]}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </label>
        </section>

        <section className="shape-list">
          {filteredShapes.map((shape) => (
            <button
              key={shape.id}
              type="button"
              className={shape.id === selected?.id ? 'shape-row selected' : 'shape-row'}
              onClick={() => setSelectedId(shape.id)}
            >
              <span className={`kind-dot ${shape.kind}`} />
              <span>
                <strong>{shape.name}</strong>
                <small>{kindLabels[shape.kind]} · {shape.sourceTag}</small>
              </span>
            </button>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{artifact.title}</h2>
            <p>{artifact.namespace || 'No namespace detected'}</p>
          </div>
          <div className="toolbar">
            <button type="button" onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))} title="Zoom out">
              <ZoomOut size={18} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.45, value + 0.1))} title="Zoom in">
              <ZoomIn size={18} />
            </button>
            <button type="button" onClick={exportModel} title="Export parsed model">
              <FileJson size={18} />
            </button>
            <button type="button" onClick={() => setManualPositions({})} title="Auto arrange">
              <RotateCcw size={18} />
            </button>
          </div>
        </header>

        <div className="content">
          <section className="canvas-wrap">
            <div className="drop-hint">
              <FileUp size={16} />
              Drop BizTalk XML artifacts anywhere
            </div>
            <svg
              className="diagram"
              width={diagramWidth * zoom}
              height={diagramHeight * zoom}
              viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
              role="img"
              aria-label="BizTalk orchestration diagram"
            >
              <defs>
                <marker id="arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                  <path d="M 0 0 L 10 4 L 0 8 z" fill="#64748b" />
                </marker>
              </defs>

              {edges.map((edge) => (
                <path
                  key={edge.id}
                  d={edgePath(edge, nodeMap.get(edge.from), nodeMap.get(edge.to))}
                  className={edge.kind === 'contains' ? 'edge contains' : 'edge'}
                  markerEnd={edge.kind === 'sequence' ? 'url(#arrow)' : undefined}
                />
              ))}

              {nodes.map((node) => (
                <DiagramShape
                  key={node.id}
                  node={node}
                  selected={node.id === selected?.id}
                  onSelect={() => setSelectedId(node.id)}
                  onDragStart={startDrag}
                  onDragMove={moveDrag}
                  onDragEnd={endDrag}
                />
              ))}
            </svg>
          </section>

          <ShapeInspector selected={selected} diagnostics={artifact.diagnostics} />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DiagramShape({
  node,
  selected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  node: DiagramNode;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent<SVGGElement>, node: DiagramNode) => void;
  onDragMove: (event: React.PointerEvent<SVGGElement>) => void;
  onDragEnd: () => void;
}) {
  const colors = kindColors[node.kind];
  const refSummary = node.references.slice(0, 2).map((ref) => ref.name).join(', ');
  return (
    <g
      className={selected ? 'node selected' : 'node'}
      onClick={onSelect}
      onPointerDown={(event) => onDragStart(event, node)}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      tabIndex={0}
      role="button"
      aria-label={node.name}
    >
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="8" fill={colors.fill} stroke={colors.stroke} />
      <Move x={node.x + node.width - 30} y={node.y + 15} width={14} height={14} color={colors.text} opacity={0.55} />
      <text x={node.x + 18} y={node.y + 26} fill={colors.text} className="node-kind">
        {kindLabels[node.kind]}
      </text>
      <text x={node.x + 18} y={node.y + 49} fill="#0f172a" className="node-title">
        {truncate(node.name, 29)}
      </text>
      <text x={node.x + 18} y={node.y + 69} fill="#475569" className="node-meta">
        {truncate(refSummary || node.sourceTag, 33)}
      </text>
    </g>
  );
}

function ShapeInspector({ selected, diagnostics }: { selected?: DiagramNode | ParsedArtifact['shapes'][number]; diagnostics: string[] }) {
  if (!selected) {
    return (
      <aside className="inspector empty">
        <Braces size={22} />
        <span>No shape selected</span>
      </aside>
    );
  }

  const attrEntries = Object.entries(selected.attributes).slice(0, 22);

  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span className={`kind-dot ${selected.kind}`} />
        <div>
          <h3>{selected.name}</h3>
          <p>{kindLabels[selected.kind]} · {selected.sourceTag}</p>
        </div>
      </div>

      <section>
        <h4>Migration Note</h4>
        <p className="hint">{selected.migrationHint}</p>
      </section>

      <section>
        <h4>References</h4>
        {selected.references.length ? (
          <div className="chips">
            {selected.references.map((ref) => (
              <span className="chip" key={`${ref.kind}-${ref.name}`}>
                {ref.kind}: {ref.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">No direct references detected.</p>
        )}
      </section>

      <section>
        <h4>Attributes</h4>
        {attrEntries.length ? (
          <dl className="attributes">
            {attrEntries.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : (
          <p className="muted">No attributes on this node.</p>
        )}
      </section>

      {diagnostics.length > 0 && (
        <section>
          <h4>Diagnostics</h4>
          {diagnostics.map((diagnostic) => (
            <p className="diagnostic" key={diagnostic}>{diagnostic}</p>
          ))}
        </section>
      )}
    </aside>
  );
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

createRoot(document.getElementById('root')!).render(<App />);
