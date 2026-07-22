import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnConnectStartParams,
  type OnSelectionChangeParams,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { blueprintApi } from "../../shared/api.ts";
import type {
  BlueprintColumn,
  BlueprintData,
  BlueprintEdge,
  BlueprintGraph,
  BlueprintNode,
  BlueprintNodeKind,
  BlueprintPin,
} from "../../shared/types.ts";
import { EventNode } from "./nodes/EventNode.tsx";
import { RerouteNode } from "./nodes/RerouteNode.tsx";
import { EntryNode } from "./nodes/EntryNode.tsx";
import { ExitNode } from "./nodes/ExitNode.tsx";
import { ColumnsLayer } from "./ColumnsLayer.tsx";
import { BlueprintColumnsPanel } from "./BlueprintColumnsPanel.tsx";
import { BlueprintDetailsPanel } from "./BlueprintDetailsPanel.tsx";
import { BlueprintBreadcrumbs, type BreadcrumbEntry } from "./BlueprintBreadcrumbs.tsx";
import { ArcRegistryProvider } from "./arcRegistry.tsx";
import {
  assignLanes,
  laneTops,
  BASE_Y,
  MIN_NODE_HEIGHT,
  NODE_WIDTH,
  DEFAULT_UNIT_PX,
  MIN_UNIT_PX,
  MAX_UNIT_PX,
  DEFAULT_COLUMN_GAP,
  MAX_COLUMN_GAP,
  DEFAULT_LANE_GAP,
  MAX_LANE_GAP,
  deriveSpan,
  eventBox,
  newId,
  syncTunnelExits,
  timeToX,
  xToTime,
} from "./layout.ts";
import "./BlueprintCanvas.css";

const nodeTypes: NodeTypes = {
  event: EventNode,
  reroute: RerouteNode,
  entry: EntryNode,
  exit: ExitNode,
};

/** MiniMap swatch per node — mirrors the header gradients' mid tones. */
function miniMapNodeColor(rf: Node): string {
  const node = rf.data as unknown as BlueprintNode;
  if (node.kind === "reroute") return "#55555c";
  if (node.kind === "entry" || node.kind === "exit") return "#47474e";
  if (node.subGraphId) return "#2668b3";
  return node.status === "kanon" ? "#1f9d5c" : "#5a3ee0";
}

interface GridScale {
  columns: BlueprintColumn[];
  unitPx: number;
  columnGap: number;
}

/** Event nodes are positioned/sized from their Von–Bis span, inset by a
 * margin so they never touch their column's edges; every other kind keeps
 * its intrinsic size and sits flush on the time axis (a reroute is a dot,
 * a tunnel a fixed pill). */
function rfBox(n: BlueprintNode, grid: GridScale): { x: number; width?: number } {
  if (n.kind === "event") {
    const box = eventBox(n, grid.columns, grid.unitPx, grid.columnGap);
    if (box) return box;
  }
  return {
    x:
      n.from !== undefined
        ? timeToX(n.from, grid.columns, grid.unitPx, grid.columnGap)
        : n.x,
  };
}

function toRfNode(n: BlueprintNode, grid: GridScale): Node {
  const { x, width } = rfBox(n, grid);
  return {
    id: n.id,
    type: n.kind,
    position: { x, y: n.y },
    data: n as unknown as Record<string, unknown>,
    ...(width !== undefined ? { style: { width } } : {}),
  };
}

function toRfNodes(graph: BlueprintGraph, unitPx: number, columnGap: number): Node[] {
  const grid: GridScale = { columns: graph.columns ?? [], unitPx, columnGap };
  return graph.nodes.map((n) => toRfNode(n, grid));
}

/** Build a fresh content node whose X (and thus `from`) comes from the drop
 * position on the time axis. */
function makeNode(
  kind: Extract<BlueprintNodeKind, "event" | "reroute">,
  flowPos: XYPosition,
  grid: GridScale,
): BlueprintNode {
  const from = Math.round(xToTime(flowPos.x, grid.columns, grid.unitPx, grid.columnGap));
  const base = {
    id: newId("node"),
    description: "",
    status: "idee" as const,
    x: flowPos.x,
    y: flowPos.y,
    from,
  };
  return kind === "event"
    ? { ...base, kind: "event", title: "Neues Ereignis", outputs: [{ id: newId("pin"), label: "danach" }] }
    : { ...base, kind: "reroute", title: "", outputs: [{ id: "out", label: "" }] };
}

function toRfEdges(graph: BlueprintGraph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourcePin,
    target: e.target,
    targetHandle: "in",
  }));
}

interface ContextMenuState {
  screenX: number;
  screenY: number;
  flowPosition: XYPosition;
}

function BlueprintCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [columns, setColumns] = useState<BlueprintColumn[]>([]);
  const [unitPx, setUnitPx] = useState(DEFAULT_UNIT_PX);
  const [columnGap, setColumnGap] = useState(DEFAULT_COLUMN_GAP);
  const [laneGap, setLaneGap] = useState(DEFAULT_LANE_GAP);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  const { screenToFlowPosition } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const grid: GridScale = useMemo(
    () => ({ columns, unitPx, columnGap }),
    [columns, unitPx, columnGap],
  );

  const dataRef = useRef<BlueprintData | null>(null);
  const activeGraphRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const connectingPin = useRef<{ nodeId: string; handleId: string } | null>(null);
  const edgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    blueprintApi
      .read()
      .then((d) => {
        dataRef.current = d;
        activeGraphRef.current = d.rootGraphId;
        // Clamped, not taken raw: documents saved before a node ever had a
        // fixed width can carry a unit narrower than one node.
        const unit = Math.min(
          MAX_UNIT_PX,
          Math.max(MIN_UNIT_PX, d.unitPx ?? DEFAULT_UNIT_PX),
        );
        const gap = Math.min(MAX_COLUMN_GAP, Math.max(0, d.columnGap ?? DEFAULT_COLUMN_GAP));
        const graph = d.graphs[d.rootGraphId];
        setUnitPx(unit);
        setColumnGap(gap);
        setLaneGap(Math.min(MAX_LANE_GAP, Math.max(0, d.laneGap ?? DEFAULT_LANE_GAP)));
        setNodes(toRfNodes(graph, unit, gap));
        setEdges(toRfEdges(graph));
        setColumns(graph.columns ?? []);
        setBreadcrumbs([{ graphId: d.rootGraphId, label: "Blueprint" }]);
        loadedRef.current = true;
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const data = dataRef.current;
    const graphId = activeGraphRef.current;
    if (!data || !graphId) return;

    const prev = data.graphs[graphId];
    const nextNodes: BlueprintNode[] = nodes.map((rf) => ({
      ...(rf.data as unknown as BlueprintNode),
      x: rf.position.x,
      y: rf.position.y,
    }));
    const nextEdges: BlueprintEdge[] = edges.map((rf) => ({
      id: rf.id,
      source: rf.source,
      sourcePin: rf.sourceHandle ?? "",
      target: rf.target,
    }));
    const nextData: BlueprintData = {
      ...data,
      unitPx,
      columnGap,
      laneGap,
      graphs: {
        ...data.graphs,
        [graphId]: { ...prev, nodes: nextNodes, edges: nextEdges, columns },
      },
    };
    dataRef.current = nextData;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void blueprintApi.write(nextData).catch(() => {});
    }, 400);
  }, [nodes, edges, columns, unitPx, columnGap, laneGap]);

  /** The grid scale is derived, never hand-placed: whenever the spacing or the
   * columns themselves change, every node's X is re-derived from its `from`.
   * Returning the same array when nothing moved keeps this from looping. */
  useEffect(() => {
    if (!loadedRef.current) return;
    setNodes((nds) => {
      let moved = false;
      const next = nds.map((n) => {
        const data = n.data as unknown as BlueprintNode;
        if (data.from === undefined) return n;
        const { x, width } = rfBox(data, { columns, unitPx, columnGap });
        if (x === n.position.x && width === n.style?.width) return n;
        moved = true;
        return {
          ...n,
          position: { x, y: n.position.y },
          style: width !== undefined ? { ...n.style, width } : n.style,
        };
      });
      return moved ? next : nds;
    });
  }, [unitPx, columnGap, columns, setNodes]);

  /** Re-settles every node onto a lane derived from the execution wiring: a
   * linear chain shares one lane, each extra branch fans onto its own lane
   * below, and anything that would horizontally collide inside a lane drops to
   * the next free one. Lane Y comes from the rendered node heights, so a node
   * with many pins pushes the lanes below it down instead of being overlapped.
   * Re-run whenever the wiring, a node's time or the lane spacing changed. */
  const autoArrange = useCallback(
    (edgeList?: Edge[]) => {
      const activeEdges = edgeList ?? edgesRef.current;
      setNodes((nds) => {
        const boxes = new Map(
          nds.map((n) => {
            const width =
              (typeof n.style?.width === "number" ? n.style.width : n.measured?.width) ??
              NODE_WIDTH;
            return [
              n.id,
              {
                left: n.position.x,
                right: n.position.x + width,
                height: n.measured?.height ?? MIN_NODE_HEIGHT,
              },
            ];
          }),
        );
        const dataList = nds
          .map((n) => n.data as unknown as BlueprintNode)
          .filter((n) => n.kind === "event" || n.kind === "reroute");
        const lanes = assignLanes(
          dataList,
          activeEdges.map((e) => ({
            source: e.source,
            target: e.target,
            sourcePin: e.sourceHandle ?? undefined,
          })),
          (n) => boxes.get(n.id) ?? { left: n.x, right: n.x + NODE_WIDTH },
        );
        const laneHeights = new Map<number, number>();
        for (const [id, lane] of lanes) {
          const height = boxes.get(id)?.height ?? MIN_NODE_HEIGHT;
          laneHeights.set(lane, Math.max(laneHeights.get(lane) ?? 0, height));
        }
        const tops = laneTops(laneHeights, laneGap);
        return nds.map((n) => {
          const lane = lanes.get(n.id);
          if (lane === undefined) return n;
          return { ...n, position: { ...n.position, y: tops.get(lane) ?? BASE_Y } };
        });
      });
    },
    [setNodes, laneGap],
  );

  /** Horizontal scale and lane spacing both feed the vertical layout: a wider
   * grid changes which nodes collide inside a lane, a wider lane gap changes
   * every lane's Y. Runs after the X-remap effect above, so it already sees the
   * new positions — and waits for `nodesInitialized`, because lane heights come
   * from the rendered node boxes, which are unmeasured on the first frame after
   * a document (or sub-graph) loads. */
  useEffect(() => {
    if (!loadedRef.current || !nodesInitialized) return;
    autoArrange();
  }, [unitPx, columnGap, columns, laneGap, nodesInitialized, autoArrange]);

  /** Deleting nodes (Delete/Backspace) re-settles the remaining lanes. */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      if (changes.some((c) => c.type === "remove")) autoArrange();
    },
    [onNodesChange, autoArrange],
  );

  /** Deleting a wire re-settles lanes too — a disconnected chain re-packs. */
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      const removed = new Set(
        changes.filter((c) => c.type === "remove").map((c) => c.id),
      );
      if (removed.size > 0) {
        const next = edgesRef.current.filter((e) => !removed.has(e.id));
        edgesRef.current = next;
        autoArrange(next);
      }
    },
    [onEdgesChange, autoArrange],
  );

  /** An input pin accepts at most one wire — connecting a new one replaces
   * whatever was already plugged into that node's implicit "in" pin. */
  const onConnect = useCallback(
    (connection: Connection) => {
      const withoutExistingTarget = edgesRef.current.filter(
        (e) => e.target !== connection.target,
      );
      const next = addEdge(
        { ...connection, id: newId("edge"), targetHandle: "in" },
        withoutExistingTarget,
      );
      edgesRef.current = next;
      setEdges(next);
      autoArrange(next);
    },
    [setEdges, autoArrange],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<BlueprintNode>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const current = n.data as unknown as BlueprintNode;
          const nextData: BlueprintNode = { ...current, ...patch };
          // Either bound moving re-derives the whole box — position and
          // width both follow the span, so they have to update together.
          const spanChanged = "from" in patch || "to" in patch;
          const box = spanChanged ? rfBox(nextData, grid) : undefined;
          return {
            ...n,
            position: box ? { x: box.x, y: n.position.y } : n.position,
            style: box?.width !== undefined ? { ...n.style, width: box.width } : n.style,
            data: nextData as unknown as Record<string, unknown>,
          };
        }),
      );
    },
    [setNodes, grid],
  );

  /** Changing a node's output pins also has to keep its sub-graph's exit
   * tunnels in sync — those may live in a graph that isn't currently open. */
  const setNodeOutputs = useCallback(
    (nodeId: string, outputs: BlueprintPin[]) => {
      const node = nodes.find((n) => n.id === nodeId)?.data as unknown as
        | BlueprintNode
        | undefined;
      if (!node) return;
      const removedPinIds = node.outputs
        .filter((p) => !outputs.some((o) => o.id === p.id))
        .map((p) => p.id);

      updateNodeData(nodeId, { outputs });
      if (removedPinIds.length > 0) {
        setEdges((eds) =>
          eds.filter((e) => !(e.source === nodeId && removedPinIds.includes(e.sourceHandle ?? ""))),
        );
      }
      if (node.subGraphId && dataRef.current) {
        const sub = dataRef.current.graphs[node.subGraphId];
        if (sub) {
          dataRef.current = {
            ...dataRef.current,
            graphs: {
              ...dataRef.current.graphs,
              [node.subGraphId]: syncTunnelExits(sub, outputs),
            },
          };
        }
      }
    },
    [nodes, updateNodeData, setEdges],
  );

  /** Apply a from/to change and immediately re-settle every node's lane —
   * the automatic counterpart to the manual "Automatisch anordnen" action. */
  const updateNodeTime = useCallback(
    (nodeId: string, patch: Partial<Pick<BlueprintNode, "from" | "to">>) => {
      updateNodeData(nodeId, patch);
      autoArrange();
    },
    [updateNodeData, autoArrange],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodeId(params.nodes.length === 1 ? params.nodes[0].id : null);
  }, []);

  const addNode = useCallback(
    (kind: Extract<BlueprintNodeKind, "event" | "reroute">, position: XYPosition) => {
      setNodes((nds) => [...nds, toRfNode(makeNode(kind, position, grid), grid)]);
      autoArrange();
    },
    [setNodes, autoArrange, grid],
  );

  /** UE-style node authoring: dragging a wire out of an output pin and
   * releasing on empty canvas spawns a new event node, already wired from that
   * pin. Manual repositioning is disabled — this drag is the only way to create
   * a node (except the very first one, via the context menu). */
  const onConnectStart = useCallback(
    (_event: unknown, params: OnConnectStartParams) => {
      connectingPin.current =
        params.handleType === "source" && params.nodeId
          ? { nodeId: params.nodeId, handleId: params.handleId ?? "" }
          : null;
    },
    [],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const source = connectingPin.current;
      connectingPin.current = null;
      if (!source) return;
      const target = event.target as Element | null;
      if (!target?.classList?.contains("react-flow__pane")) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const flowPos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const node = makeNode("event", flowPos, grid);
      setNodes((nds) => [...nds, toRfNode(node, grid)]);
      const next = addEdge(
        {
          id: newId("edge"),
          source: source.nodeId,
          sourceHandle: source.handleId,
          target: node.id,
          targetHandle: "in",
        },
        edgesRef.current,
      );
      edgesRef.current = next;
      setEdges(next);
      autoArrange(next);
    },
    [screenToFlowPosition, setNodes, setEdges, autoArrange, grid],
  );

  const addColumn = useCallback(
    (flowPosition: XYPosition) => {
      const from = Math.round(
        xToTime(flowPosition.x, grid.columns, grid.unitPx, grid.columnGap),
      );
      setColumns((cols) => [
        ...cols,
        { id: newId("col"), label: "Neue Spalte", order: cols.length, from, to: from + 1 },
      ]);
    },
    [grid],
  );

  /** Grid scale knobs — the remap effect re-derives every node's X from these. */
  const changeUnitPx = useCallback((value: number) => {
    setUnitPx(Math.min(MAX_UNIT_PX, Math.max(MIN_UNIT_PX, Math.round(value))));
  }, []);

  const changeColumnGap = useCallback((value: number) => {
    setColumnGap(Math.min(MAX_COLUMN_GAP, Math.max(0, Math.round(value))));
  }, []);

  const changeLaneGap = useCallback((value: number) => {
    setLaneGap(Math.min(MAX_LANE_GAP, Math.max(0, Math.round(value))));
  }, []);

  const updateColumn = useCallback((id: string, patch: Partial<BlueprintColumn>) => {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeColumn = useCallback((id: string) => {
    setColumns((cols) => cols.filter((c) => c.id !== id));
  }, []);

  /** Loads a graph level into the live React Flow state. Does not itself
   * touch `dataRef` — the autosave effect keeps the *previous* level's data
   * current before this ever runs, since it's only called from a discrete
   * click after all prior state changes have already committed. */
  const loadGraphIntoRf = useCallback(
    (graphId: string) => {
      const graph = dataRef.current?.graphs[graphId];
      if (!graph) return;
      activeGraphRef.current = graphId;
      setNodes(toRfNodes(graph, unitPx, columnGap));
      setEdges(toRfEdges(graph));
      setColumns(graph.columns ?? []);
      setSelectedNodeId(null);
      setContextMenu(null);
    },
    [setNodes, setEdges, unitPx, columnGap],
  );

  const enterSubGraph = useCallback(
    (containerNodeId: string, subGraphId: string, label: string) => {
      const parentGraphId = activeGraphRef.current;
      loadGraphIntoRf(subGraphId);
      setBreadcrumbs((bc) => [
        ...bc,
        {
          graphId: subGraphId,
          label: label || "Ereignis",
          containerNodeId,
          parentGraphId: parentGraphId ?? undefined,
        },
      ]);
    },
    [loadGraphIntoRf],
  );

  const createAndEnterSubGraph = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)?.data as unknown as
        | BlueprintNode
        | undefined;
      if (!node) return;
      if (node.subGraphId) {
        enterSubGraph(nodeId, node.subGraphId, node.title);
        return;
      }
      const subGraphId = newId("graph");
      const entryNode: BlueprintNode = {
        id: newId("node"),
        kind: "entry",
        title: "Eingang",
        description: "",
        status: "idee",
        x: 80,
        y: BASE_Y,
        outputs: [{ id: "out", label: "" }],
        pinId: "in",
      };
      const seeded = syncTunnelExits(
        { id: subGraphId, nodes: [entryNode], edges: [], columns: [] },
        node.outputs,
      );
      if (dataRef.current) {
        dataRef.current = {
          ...dataRef.current,
          graphs: { ...dataRef.current.graphs, [subGraphId]: seeded },
        };
      }
      updateNodeData(nodeId, { subGraphId });
      enterSubGraph(nodeId, subGraphId, node.title);
    },
    [nodes, updateNodeData, enterSubGraph],
  );

  const onNodeDoubleClick = useCallback(
    (_event: unknown, node: Node) => {
      const current = node.data as unknown as BlueprintNode;
      if (current.kind === "event" && current.subGraphId) {
        enterSubGraph(node.id, current.subGraphId, current.title);
      }
    },
    [enterSubGraph],
  );

  /** Navigate up to an ancestor breadcrumb, deriving and propagating each
   * left sub-graph's time span into its container node on the way out. */
  const goToBreadcrumb = (index: number) => {
    if (index < 0 || index >= breadcrumbs.length - 1) return;
    const data = dataRef.current;
    if (data) {
      let graphs = data.graphs;
      for (let i = breadcrumbs.length - 1; i > index; i--) {
        const leaving = breadcrumbs[i];
        if (!leaving.containerNodeId || !leaving.parentGraphId) continue;
        const leavingGraph = graphs[leaving.graphId];
        const parentGraph = graphs[leaving.parentGraphId];
        if (!leavingGraph || !parentGraph) continue;
        const span = deriveSpan(leavingGraph);
        graphs = {
          ...graphs,
          [leaving.parentGraphId]: {
            ...parentGraph,
            nodes: parentGraph.nodes.map((n) =>
              n.id === leaving.containerNodeId ? { ...n, from: span.from, to: span.to } : n,
            ),
          },
        };
      }
      dataRef.current = { ...data, graphs };
    }
    loadGraphIntoRf(breadcrumbs[index].graphId);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    autoArrange(); // a container's time may have just changed and now overlaps a sibling
  };

  const removePin = useCallback(
    (nodeId: string, pinId: string) => {
      const node = nodes.find((n) => n.id === nodeId)?.data as unknown as
        | BlueprintNode
        | undefined;
      if (!node) return;
      setNodeOutputs(nodeId, node.outputs.filter((p) => p.id !== pinId));
    },
    [nodes, setNodeOutputs],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      const { clientX, clientY } = event;
      setContextMenu({
        screenX: clientX,
        screenY: clientY,
        flowPosition: screenToFlowPosition({ x: clientX, y: clientY }),
      });
    },
    [screenToFlowPosition],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)?.data as
    | unknown as BlueprintNode
    | undefined;

  const hasEventNodes = nodes.some(
    (n) => (n.data as unknown as BlueprintNode).kind === "event",
  );

  if (error) {
    return <div className="bp-error">Blueprint konnte nicht laden: {error}</div>;
  }

  return (
    <div className="bp-root">
      <div className="bp-canvas-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodeDoubleClick={onNodeDoubleClick}
          onSelectionChange={onSelectionChange}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={closeContextMenu}
          onMove={closeContextMenu}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          panOnDrag={[2]}
          selectionOnDrag
          selectionKeyCode={null}
          zoomOnDoubleClick={false}
          fitView
          minZoom={0.2}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background
            id="bp-grid-minor"
            variant={BackgroundVariant.Lines}
            gap={28}
            color="#242428"
          />
          <Background
            id="bp-grid-major"
            variant={BackgroundVariant.Lines}
            gap={140}
            color="#2e2e34"
          />
          <MiniMap
            pannable
            zoomable
            nodeColor={miniMapNodeColor}
            nodeStrokeWidth={0}
            maskColor="rgba(10, 10, 12, 0.65)"
          />
          <Controls showInteractive={false} />
          <ColumnsLayer columns={columns} unitPx={unitPx} columnGap={columnGap} />
        </ReactFlow>
        <BlueprintBreadcrumbs items={breadcrumbs} onNavigate={goToBreadcrumb} />
        {!hasEventNodes && (
          <div className="bp-empty-hint">
            Rechtsklick auf die Fläche, um das erste Ereignis zu erstellen —
            weitere Ereignisse entstehen durch Ziehen einer Verbindung von einem
            Ausgangs-Pin ins Leere.
          </div>
        )}
        {contextMenu && (
          <div
            className="bp-context-menu"
            style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          >
            {!hasEventNodes && (
              <button
                type="button"
                onClick={() => {
                  addNode("event", contextMenu.flowPosition);
                  closeContextMenu();
                }}
              >
                Erstes Ereignis erstellen
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                addColumn(contextMenu.flowPosition);
                closeContextMenu();
              }}
            >
              Spalte erstellen
            </button>
            <div className="bp-context-menu__divider" />
            <button
              type="button"
              onClick={() => {
                autoArrange();
                closeContextMenu();
              }}
            >
              Automatisch anordnen
            </button>
          </div>
        )}
        <BlueprintColumnsPanel
          columns={columns}
          unitPx={unitPx}
          onUnitPxChange={changeUnitPx}
          columnGap={columnGap}
          onColumnGapChange={changeColumnGap}
          laneGap={laneGap}
          onLaneGapChange={changeLaneGap}
          onAdd={() => addColumn({ x: 0, y: 0 })}
          onChange={updateColumn}
          onRemove={removeColumn}
        />
      </div>
      {selectedNode && selectedNode.kind === "event" && (
        <BlueprintDetailsPanel
          node={selectedNode}
          onChange={(patch) => {
            if (patch.outputs) {
              setNodeOutputs(selectedNode.id, patch.outputs);
            } else if ("from" in patch || "to" in patch) {
              updateNodeTime(selectedNode.id, patch);
            } else {
              updateNodeData(selectedNode.id, patch);
            }
          }}
          onRemovePin={(pinId) => removePin(selectedNode.id, pinId)}
          onOpenOrCreateSubGraph={() => createAndEnterSubGraph(selectedNode.id)}
        />
      )}
    </div>
  );
}

export function BlueprintCanvas() {
  return (
    <ReactFlowProvider>
      <ArcRegistryProvider>
        <BlueprintCanvasInner />
      </ArcRegistryProvider>
    </ReactFlowProvider>
  );
}
