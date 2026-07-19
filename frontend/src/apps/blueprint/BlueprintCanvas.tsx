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
import {
  assignLanes,
  BASE_Y,
  NODE_LANE_HEIGHT,
  TIME_UNIT_PX,
  deriveSpan,
  newId,
  syncTunnelExits,
} from "./layout.ts";
import "./BlueprintCanvas.css";

const nodeTypes: NodeTypes = {
  event: EventNode,
  reroute: RerouteNode,
  entry: EntryNode,
  exit: ExitNode,
};

function toRfNodes(graph: BlueprintGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
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
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
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

  /** An input pin accepts at most one wire — connecting a new one replaces
   * whatever was already plugged into that node's implicit "in" pin. */
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const withoutExistingTarget = eds.filter((e) => e.target !== connection.target);
        return addEdge(
          { ...connection, id: newId("edge"), targetHandle: "in" },
          withoutExistingTarget,
        );
      });
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
      const dataList = nds
        .map((n) => n.data as unknown as BlueprintNode)
        .filter((n) => n.kind === "event" || n.kind === "reroute");
      const lanes = assignLanes(dataList);
      return nds.map((n) => {
        const lane = lanes.get(n.id);
        if (lane === undefined) return n;
        return { ...n, position: { ...n.position, y: BASE_Y + lane * NODE_LANE_HEIGHT } };
      });
    });
  }, [setNodes]);

  /** Loads a graph level into the live React Flow state. Does not itself
   * touch `dataRef` — the autosave effect keeps the *previous* level's data
   * current before this ever runs, since it's only called from a discrete
   * click after all prior state changes have already committed. */
  const loadGraphIntoRf = useCallback(
    (graphId: string) => {
      const graph = dataRef.current?.graphs[graphId];
      if (!graph) return;
      activeGraphRef.current = graphId;
      setNodes(toRfNodes(graph));
      setEdges(toRfEdges(graph));
      setColumns(graph.columns ?? []);
      setSelectedNodeId(null);
      setContextMenu(null);
    },
    [setNodes, setEdges],
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
          onNodeDoubleClick={onNodeDoubleClick}
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
        <BlueprintBreadcrumbs items={breadcrumbs} onNavigate={goToBreadcrumb} />
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
          onChange={(patch) => {
            if (patch.outputs) {
              setNodeOutputs(selectedNode.id, patch.outputs);
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
      <BlueprintCanvasInner />
    </ReactFlowProvider>
  );
}
