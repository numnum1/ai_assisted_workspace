import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
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
} from "../../shared/types.ts";
import { EventNode } from "./nodes/EventNode.tsx";
import { RerouteNode } from "./nodes/RerouteNode.tsx";
import { ColumnsLayer } from "./ColumnsLayer.tsx";
import { BlueprintColumnsPanel } from "./BlueprintColumnsPanel.tsx";
import { BlueprintDetailsPanel } from "./BlueprintDetailsPanel.tsx";
import { assignLanes, BASE_Y, NODE_LANE_HEIGHT, TIME_UNIT_PX } from "./layout.ts";
import "./BlueprintCanvas.css";

const nodeTypes: NodeTypes = { event: EventNode, reroute: RerouteNode };

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function toRfNodes(graph: BlueprintGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.kind === "reroute" ? "reroute" : "event",
    position: { x: n.from !== undefined ? n.from * TIME_UNIT_PX : n.x, y: n.y },
    data: n as unknown as Record<string, unknown>,
  }));
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
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const dataRef = useRef<BlueprintData | null>(null);
  const activeGraphRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    blueprintApi
      .read()
      .then((d) => {
        dataRef.current = d;
        activeGraphRef.current = d.rootGraphId;
        const graph = d.graphs[d.rootGraphId];
        setNodes(toRfNodes(graph));
        setEdges(toRfEdges(graph));
        setColumns(graph.columns ?? []);
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
  }, [nodes, edges, columns]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge({ ...connection, id: newId("edge"), targetHandle: "in" }, eds),
      );
    },
    [setEdges],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<BlueprintNode>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const current = n.data as unknown as BlueprintNode;
          const nextData: BlueprintNode = { ...current, ...patch };
          const position =
            patch.from !== undefined
              ? { x: patch.from * TIME_UNIT_PX, y: n.position.y }
              : n.position;
          return { ...n, position, data: nextData as unknown as Record<string, unknown> };
        }),
      );
    },
    [setNodes],
  );

  const removePin = useCallback(
    (nodeId: string, pinId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const current = n.data as unknown as BlueprintNode;
          return {
            ...n,
            data: {
              ...current,
              outputs: current.outputs.filter((p) => p.id !== pinId),
            } as unknown as Record<string, unknown>,
          };
        }),
      );
      setEdges((eds) => eds.filter((e) => !(e.source === nodeId && e.sourceHandle === pinId)));
    },
    [setNodes, setEdges],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      const current = node.data as unknown as BlueprintNode;
      if (current.kind !== "event" && current.kind !== "reroute") return;
      const from = Math.round((node.position.x / TIME_UNIT_PX) * 100) / 100;
      const duration =
        current.from !== undefined && current.to !== undefined
          ? current.to - current.from
          : undefined;
      updateNodeData(node.id, {
        from,
        to: duration !== undefined ? from + duration : current.to,
      });
    },
    [updateNodeData],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodeId(params.nodes.length === 1 ? params.nodes[0].id : null);
  }, []);

  const addNode = useCallback(
    (kind: Extract<BlueprintNodeKind, "event" | "reroute">, position: XYPosition) => {
      const from = Math.round((position.x / TIME_UNIT_PX) * 100) / 100;
      const node: BlueprintNode =
        kind === "event"
          ? {
              id: newId("node"),
              kind: "event",
              title: "Neues Ereignis",
              description: "",
              status: "idee",
              x: position.x,
              y: position.y,
              from,
              outputs: [{ id: newId("pin"), label: "danach" }],
            }
          : {
              id: newId("node"),
              kind: "reroute",
              title: "",
              description: "",
              status: "idee",
              x: position.x,
              y: position.y,
              from,
              outputs: [{ id: "out", label: "" }],
            };
      setNodes((nds) => [
        ...nds,
        {
          id: node.id,
          type: kind,
          position: { x: node.x, y: node.y },
          data: node as unknown as Record<string, unknown>,
        },
      ]);
    },
    [setNodes],
  );

  const addColumn = useCallback((flowPosition: XYPosition) => {
    const from = Math.round(flowPosition.x / TIME_UNIT_PX);
    setColumns((cols) => [
      ...cols,
      { id: newId("col"), label: "Neue Spalte", order: cols.length, from, to: from + 1 },
    ]);
  }, []);

  const updateColumn = useCallback((id: string, patch: Partial<BlueprintColumn>) => {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeColumn = useCallback((id: string) => {
    setColumns((cols) => cols.filter((c) => c.id !== id));
  }, []);

  const autoArrange = useCallback(() => {
    setNodes((nds) => {
      const dataList = nds.map((n) => n.data as unknown as BlueprintNode);
      const lanes = assignLanes(dataList);
      return nds.map((n) => {
        const lane = lanes.get(n.id);
        if (lane === undefined) return n;
        return { ...n, position: { ...n.position, y: BASE_Y + lane * NODE_LANE_HEIGHT } };
      });
    });
  }, [setNodes]);

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

  if (error) {
    return <div className="bp-error">Blueprint konnte nicht laden: {error}</div>;
  }

  return (
    <div className="bp-root">
      <div className="bp-canvas-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={closeContextMenu}
          onMove={closeContextMenu}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#3a3a3d" />
          <ColumnsLayer columns={columns} />
        </ReactFlow>
        {contextMenu && (
          <div
            className="bp-context-menu"
            style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
          >
            <button
              type="button"
              onClick={() => {
                addNode("event", contextMenu.flowPosition);
                closeContextMenu();
              }}
            >
              Ereignis erstellen
            </button>
            <button
              type="button"
              onClick={() => {
                addNode("reroute", contextMenu.flowPosition);
                closeContextMenu();
              }}
            >
              Reroute-Punkt einfügen
            </button>
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
          onAdd={() => addColumn({ x: 0, y: 0 })}
          onChange={updateColumn}
          onRemove={removeColumn}
        />
      </div>
      {selectedNode && selectedNode.kind === "event" && (
        <BlueprintDetailsPanel
          node={selectedNode}
          onChange={(patch) => updateNodeData(selectedNode.id, patch)}
          onRemovePin={(pinId) => removePin(selectedNode.id, pinId)}
        />
      )}
    </div>
  );
}

export function BlueprintCanvas() {
  return (
    <ReactFlowProvider>
      <BlueprintCanvasInner />
    </ReactFlowProvider>
  );
}
