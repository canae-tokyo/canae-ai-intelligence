"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import type { CompanyNode } from "@/lib/types";

const TIER_X = [40, 340, 640];
const ROW_HEIGHT = 64;

const baseNodeStyle = {
  border: "1px solid #2a2b30",
  borderRadius: 8,
  minHeight: 44,
  padding: "10px 14px",
  fontSize: 12,
  color: "#f2f1ed",
  maxWidth: 160,
  overflowWrap: "anywhere" as const,
};

export default function CorrelationDiagram({
  data,
  onSelectTool,
}: {
  data: CompanyNode[];
  onSelectTool: (toolId: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let productRow = 0;

    data.forEach((company) => {
      const companyModelCenters: number[] = [];

      (company.children ?? []).forEach((model) => {
        const products = model.children ?? [];
        const modelStartRow = productRow;

        if (products.length === 0) {
          const y = productRow * ROW_HEIGHT;
          nodes.push({
            id: model.id,
            position: { x: TIER_X[1], y },
            data: { label: model.name },
            style: { ...baseNodeStyle, background: "#1a1b1f" },
          });
          edges.push({
            id: `e-${company.id}-${model.id}`,
            source: company.id,
            target: model.id,
            type: "smoothstep",
            style: { stroke: "#2a2b30" },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#2a2b30" },
          });
          companyModelCenters.push(productRow);
          productRow += 1;
          return;
        }

        products.forEach((product) => {
          const y = productRow * ROW_HEIGHT;
          nodes.push({
            id: product.id,
            position: { x: TIER_X[2], y },
            data: { label: product.name },
            style: {
              ...baseNodeStyle,
              background: product.toolId ? "#20231d" : "#1a1b1f",
              borderColor: product.toolId ? "#4ac97c66" : "#2a2b30",
              cursor: product.toolId ? "pointer" : "default",
            },
          });
          edges.push({
            id: `e-${model.id}-${product.id}`,
            source: model.id,
            target: product.id,
            type: "smoothstep",
            style: { stroke: "#2a2b30" },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#2a2b30" },
          });
          productRow += 1;
        });

        const modelCenterRow = (modelStartRow + productRow - 1) / 2;
        nodes.push({
          id: model.id,
          position: { x: TIER_X[1], y: modelCenterRow * ROW_HEIGHT },
          data: { label: model.name },
          style: { ...baseNodeStyle, background: "#1a1b1f" },
        });
        edges.push({
          id: `e-${company.id}-${model.id}`,
          source: company.id,
          target: model.id,
          type: "smoothstep",
          style: { stroke: "#2a2b30" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#2a2b30" },
        });
        companyModelCenters.push(modelCenterRow);
      });

      const companyCenterRow =
        companyModelCenters.length > 0
          ? (Math.min(...companyModelCenters) + Math.max(...companyModelCenters)) / 2
          : 0;

      nodes.push({
        id: company.id,
        position: { x: TIER_X[0], y: companyCenterRow * ROW_HEIGHT },
        data: { label: company.name },
        style: {
          ...baseNodeStyle,
          background: "#26201a",
          borderColor: "#c9a45c66",
          fontWeight: 600,
        },
      });
    });

    return { nodes, edges };
  }, [data]);

  const toolIdByProductId = useMemo(() => {
    const map: Record<string, string> = {};
    data.forEach((company) =>
      (company.children ?? []).forEach((model) =>
        (model.children ?? []).forEach((product) => {
          if (product.toolId) map[product.id] = product.toolId;
        })
      )
    );
    return map;
  }, [data]);

  const height = Math.max(360, Math.min(720, nodes.length * 26));

  return (
    <div
      className="overflow-hidden rounded-lg border border-base-border bg-base-card"
      style={{ height: `clamp(360px, 76vw, ${height}px)` }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.35}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll={false}
        zoomOnScroll={false}
        preventScrolling
        onNodeClick={(_, node) => {
          const toolId = toolIdByProductId[node.id];
          if (toolId) onSelectTool(toolId);
        }}
      >
        <Background color="#2a2b30" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
