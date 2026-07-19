import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { blueprintApi } from "../../shared/api.ts";
import type {
  BlueprintData,
  BlueprintEdge,
  BlueprintGraph,
  BlueprintNode,
} from "../../shared/types.ts";
import { EventNode } from "./nodes/EventNode.tsx";
import "./BlueprintCanvas.css";

const nodeTypes: NodeTypes = { event: EventNode };

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function toRfNodes(graph: BlueprintGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: "event",
    position: { x: n.x, y: n.y },
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

function BlueprintCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);

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
        [graphId]: { ...prev, nodes: nextNodes, edges: nextEdges },
      },
    };
    dataRef.current = nextData;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void blueprintApi.write(nextData).catch(() => {});
    }, 400);
  }, [nodes, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...connection, id: newId("edge"), targetHandle: "in" },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const addNode = useCallback(() => {
    const node: BlueprintNode = {
      id: newId("node"),
      kind: "event",
      title: "Neues Ereignis",
      description: "",
      status: "idee",
      x: 120 + Math.random() * 160,
      y: 120 + Math.random() * 160,
      outputs: [{ id: newId("pin"), label: "danach" }],
    };
    setNodes((nds) => [
      ...nds,
      {
        id: node.id,
        type: "event",
        position: { x: node.x, y: node.y },
        data: node as unknown as Record<string, unknown>,
      },
    ]);
  }, [setNodes]);

  if (error) {
    return <div className="bp-error">Blueprint konnte nicht laden: {error}</div>;
  }

  return (
    <div className="bp-root">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#3a3a3d" />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.6)" />
        <Controls />
        <Panel position="top-left" className="bp-toolbar">
          <button type="button" onClick={addNode}>
            + Ereignis
          </button>
        </Panel>
      </ReactFlow>
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
