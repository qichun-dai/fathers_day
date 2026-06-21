import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sourceId(link) {
  return typeof link?.source === "object" ? link.source?.id : link?.source;
}

function targetId(link) {
  return typeof link?.target === "object" ? link.target?.id : link?.target;
}

function getFiniteDistance(link) {
  const d = Number(link?.distance_euclidean);
  return Number.isFinite(d) && d > 0 ? d : null;
}

function buildDistanceMatrix(nodes, links) {
  const size = nodes.length;
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const matrix = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => (i === j ? 0 : Number.POSITIVE_INFINITY))
  );

  let sum = 0;
  let count = 0;

  for (const link of links) {
    const s = indexById.get(sourceId(link));
    const t = indexById.get(targetId(link));
    const distance = getFiniteDistance(link);

    if (s === undefined || t === undefined || distance == null) {
      continue;
    }

    matrix[s][t] = distance;
    matrix[t][s] = distance;
    sum += distance;
    count += 1;
  }

  const fallback = count > 0 ? sum / count : 1;
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      if (i !== j && !Number.isFinite(matrix[i][j])) {
        matrix[i][j] = fallback;
      }
    }
  }

  return matrix;
}

function classicalInit(count) {
  const radius = Math.max(1, count / 4);
  return Array.from({ length: count }, (_, i) => {
    const theta = (2 * Math.PI * i) / Math.max(1, count);
    return [Math.cos(theta) * radius, Math.sin(theta) * radius];
  });
}

function centerCoords(coords) {
  if (!coords.length) {
    return coords;
  }

  let meanX = 0;
  let meanY = 0;
  for (const [x, y] of coords) {
    meanX += x;
    meanY += y;
  }
  meanX /= coords.length;
  meanY /= coords.length;

  return coords.map(([x, y]) => [x - meanX, y - meanY]);
}

function runSmacof(distanceMatrix, maxIterations = 220) {
  const n = distanceMatrix.length;
  if (n === 0) {
    return [];
  }

  let coords = classicalInit(n);
  const epsilon = 1e-6;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const bx = new Array(n).fill(0);
    const by = new Array(n).fill(0);

    for (let i = 0; i < n; i += 1) {
      let diag = 0;

      for (let j = 0; j < n; j += 1) {
        if (i === j) {
          continue;
        }

        const target = distanceMatrix[i][j];
        const dx = coords[i][0] - coords[j][0];
        const dy = coords[i][1] - coords[j][1];
        const current = Math.sqrt(dx * dx + dy * dy);
        const ratio = target / Math.max(current, epsilon);
        const bij = -ratio;

        bx[i] += bij * coords[j][0];
        by[i] += bij * coords[j][1];
        diag -= bij;
      }

      bx[i] += diag * coords[i][0];
      by[i] += diag * coords[i][1];
    }

    const next = new Array(n);
    for (let i = 0; i < n; i += 1) {
      next[i] = [bx[i] / n, by[i] / n];
    }

    coords = centerCoords(next);
  }

  return coords;
}

function buildDistanceStats(links) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;

  for (const link of links) {
    const distance = getFiniteDistance(link);
    if (distance == null) {
      continue;
    }
    min = Math.min(min, distance);
    max = Math.max(max, distance);
    sum += distance;
    count += 1;
  }

  return {
    min: count > 0 ? min : 1,
    max: count > 0 ? max : 1,
    avg: count > 0 ? sum / count : 1,
  };
}

function scaleDistanceToPixels(distance, stats, width, height) {
  const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : stats.avg;
  const range = Math.max(stats.max - stats.min, 1e-6);
  const normalized = (safeDistance - stats.min) / range;
  const minPixels = 56;
  const maxPixels = Math.max(120, Math.min(width, height) * 0.44);
  return minPixels + normalized * (maxPixels - minPixels);
}

function projectToViewport(coords, width, height, padding = 44) {
  if (!coords.length) {
    return [];
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const availableWidth = Math.max(width - padding * 2, 1);
  const availableHeight = Math.max(height - padding * 2, 1);
  const scale = Math.min(availableWidth / rangeX, availableHeight / rangeY);
  const contentWidth = rangeX * scale;
  const contentHeight = rangeY * scale;
  const offsetX = padding + (availableWidth - contentWidth) / 2;
  const offsetY = padding + (availableHeight - contentHeight) / 2;

  return coords.map(([x, y]) => ({
    x: clamp((x - minX) * scale + offsetX, padding, width - padding),
    y: clamp((y - minY) * scale + offsetY, padding, height - padding),
  }));
}

function clampX(x, width) {
  return clamp(x, 24, Math.max(24, width - 24));
}

function clampY(y, height) {
  return clamp(y, 24, Math.max(24, height - 24));
}

export function useForceLayout(graph, width, height, options = {}) {
  const { mode = "mds", pinnedNodeId = null, mdsLinks = null } = options;
  const [nodes, setNodes] = useState([]);
  const simulationRef = useRef(null);
  const nodesByIdRef = useRef(new Map());
  const previousByIdRef = useRef(new Map());
  const pinnedNodeIdRef = useRef(pinnedNodeId);
  pinnedNodeIdRef.current = pinnedNodeId;

  const prepared = useMemo(() => {
    const clonedNodes = graph.nodes.map((node) => ({ ...node }));
    const clonedLinks = graph.links.map((link) => ({ ...link }));
    return { nodes: clonedNodes, links: clonedLinks };
  }, [graph.nodes, graph.links]);

  // Always reflects the latest star-topology links without triggering re-renders
  const preparedLinksRef = useRef(prepared.links);
  preparedLinksRef.current = prepared.links;

  // MDS layout uses full pairwise links (mdsLinks) so it stays stable across
  // language changes. Fall back to prepared.links only if no mdsLinks provided.
  const mdsLinksForLayout = mdsLinks ?? prepared.links;
  const mdsPositions = useMemo(() => {
    if (!width || !height || !prepared.nodes.length) {
      return [];
    }

    const baseCoordinates = mdsLinksForLayout.length
      ? runSmacof(buildDistanceMatrix(prepared.nodes, mdsLinksForLayout), 220)
      : prepared.nodes.map((node, index) => {
          if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
            return [node.x, node.y];
          }
          const theta = (2 * Math.PI * index) / Math.max(1, prepared.nodes.length);
          return [Math.cos(theta), Math.sin(theta)];
        });

    const projected = projectToViewport(baseCoordinates, width, height, 44);
    return prepared.nodes.map((node, index) => ({
      ...node,
      x: projected[index]?.x ?? width / 2,
      y: projected[index]?.y ?? height / 2,
    }));
  }, [prepared.nodes, mdsLinksForLayout, width, height]);

  const mdsById = useMemo(() => {
    return new Map(mdsPositions.map((node) => [node.id, node]));
  }, [mdsPositions]);

  useEffect(() => {
    previousByIdRef.current = new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  useEffect(() => {
    simulationRef.current?.stop();
    simulationRef.current = null;
    nodesByIdRef.current = new Map();

    if (!width || !height || !prepared.nodes.length) {
      setNodes([]);
      return;
    }

    if (mode === "mds") {
      setNodes(mdsPositions);
      return;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const simulationNodes = prepared.nodes.map((node, index) => {
      const previous = previousByIdRef.current.get(node.id);
      const mdsNode = mdsById.get(node.id);
      return {
        ...node,
        x:
          previous?.x ??
          mdsNode?.x ??
          (Number.isFinite(node.x) ? node.x : centerX + Math.cos(index) * 6),
        y:
          previous?.y ??
          mdsNode?.y ??
          (Number.isFinite(node.y) ? node.y : centerY + Math.sin(index) * 6),
      };
    });

    const stats = buildDistanceStats(prepared.links);
    const simulationLinks = prepared.links
      .map((link) => {
        const s = sourceId(link);
        const t = targetId(link);
        if (!s || !t) {
          return null;
        }
        return {
          source: s,
          target: t,
          distance_euclidean: getFiniteDistance(link) ?? stats.avg,
        };
      })
      .filter(Boolean);

    for (const node of simulationNodes) {
      if (node.id === pinnedNodeIdRef.current) {
        node.fx = centerX;
        node.fy = centerY;
      }
    }

    setNodes(
      simulationNodes.map((node) => ({
        ...node,
        x: clampX(node.x ?? centerX, width),
        y: clampY(node.y ?? centerY, height),
      }))
    );

    const simulation = forceSimulation(simulationNodes)
      .alpha(0.95)
      .alphaDecay(0.028)
      .velocityDecay(0.35)
      .force("charge", forceManyBody().strength(-95))
      .force("collide", forceCollide(20).strength(0.9))
      .force("center", forceCenter(centerX, centerY));

    if (simulationLinks.length) {
      simulation.force(
        "link",
        forceLink(simulationLinks)
          .id((node) => node.id)
          .distance((link) => scaleDistanceToPixels(link.distance_euclidean, stats, width, height))
          .strength((link) => {
            const ratio = link.distance_euclidean / Math.max(stats.avg, 1e-6);
            return clamp(0.75 / (1 + ratio), 0.16, 0.58);
          })
      );
    }

    nodesByIdRef.current = new Map(simulationNodes.map((node) => [node.id, node]));
    simulation.on("tick", () => {
      setNodes(
        simulationNodes.map((node) => ({
          ...node,
          x: clampX(node.x ?? centerX, width),
          y: clampY(node.y ?? centerY, height),
        }))
      );
    });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      if (simulationRef.current === simulation) {
        simulationRef.current = null;
      }
      nodesByIdRef.current = new Map();
    };
  // prepared.links intentionally excluded: handled by pinnedNodeId effect below.
  }, [height, mdsById, mdsPositions, mode, prepared.nodes, width]); // eslint-disable-line react-hooks/exhaustive-deps

  // Separate effect: update pinned node + link forces when language changes
  // without recreating the simulation.
  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation || mode !== "focus") {
      return;
    }
    const centerX = width / 2;
    const centerY = height / 2;

    // Update which node is pinned to center
    for (const node of nodesByIdRef.current.values()) {
      if (node.id === pinnedNodeId) {
        node.fx = centerX;
        node.fy = centerY;
      } else {
        node.fx = null;
        node.fy = null;
      }
    }

    // Update link forces with the new star-topology links in-place
    const linkForce = simulation.force("link");
    const currentLinks = preparedLinksRef.current;
    if (linkForce && currentLinks.length) {
      const stats = buildDistanceStats(currentLinks);
      const newSimLinks = currentLinks
        .map((link) => {
          const s = nodesByIdRef.current.get(sourceId(link));
          const t = nodesByIdRef.current.get(targetId(link));
          if (!s || !t) return null;
          return {
            source: s,
            target: t,
            distance_euclidean: getFiniteDistance(link) ?? stats.avg,
          };
        })
        .filter(Boolean);
      linkForce
        .links(newSimLinks)
        .distance((link) => scaleDistanceToPixels(link.distance_euclidean, stats, width, height))
        .strength((link) => {
          const ratio = link.distance_euclidean / Math.max(stats.avg, 1e-6);
          return clamp(0.75 / (1 + ratio), 0.16, 0.58);
        });
    }

    simulation.alpha(0.55).restart();
  }, [pinnedNodeId, mode, width, height]);

  const beginDragNode = useCallback(
    (nodeId, x, y) => {
      if (mode !== "focus") {
        return;
      }
      const simulation = simulationRef.current;
      const node = nodesByIdRef.current.get(nodeId);
      if (!simulation || !node) {
        return;
      }
      node.fx = clampX(x, width);
      node.fy = clampY(y, height);
      simulation.alphaTarget(0.28).restart();
    },
    [height, mode, width]
  );

  const dragNode = useCallback(
    (nodeId, x, y) => {
      if (mode !== "focus") {
        return;
      }
      const node = nodesByIdRef.current.get(nodeId);
      if (!node) {
        return;
      }
      node.fx = clampX(x, width);
      node.fy = clampY(y, height);
    },
    [height, mode, width]
  );

  const endDragNode = useCallback(
    (nodeId) => {
      if (mode !== "focus") {
        return;
      }
      const simulation = simulationRef.current;
      const node = nodesByIdRef.current.get(nodeId);
      if (!simulation || !node) {
        return;
      }
      node.fx = null;
      node.fy = null;
      simulation.alphaTarget(0);
    },
    [mode]
  );

  return {
    nodes,
    links: prepared.links,
    isDraggable: mode === "focus",
    beginDragNode,
    dragNode,
    endDragNode,
  };
}
