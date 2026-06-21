import { useEffect, useMemo, useRef, useState } from "react";
import { useForceLayout } from "../hooks/useForceLayout";

const BASE_NODE_COLOR = "#8ba1c7";
const TOOLTIP_MARGIN = 12;
const TOOLTIP_ESTIMATED_WIDTH = 300;
const TOOLTIP_ESTIMATED_HEIGHT = 140;
const MIN_FLAG_RADIUS = 8;
const MAX_FLAG_RADIUS = 14;
const DOUBLE_TAP_THRESHOLD_MS = 320;

function isTouchPointerType(pointerType) {
  return pointerType === "touch" || pointerType === "pen";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function circleIntersectsRect(cx, cy, radius, left, top, right, bottom) {
  const nearestX = clamp(cx, left, right);
  const nearestY = clamp(cy, top, bottom);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function rectsOverlap(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}


function getNodeLabel(node) {
  return node?.word || node?.language || node?.id;
}

function getCompareOptionLabel(node) {
  const displayName = node?.language || node?.word || node?.id;
  const country = node?.country ? ` (${node.country})` : "";
  return `${displayName}${country}`;
}

function getNodeLabelStyle(label) {
  const text = String(label || "");
  const hasKorean = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(text);
  const hasJapanese = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]/.test(text);
  const hasCjkHan = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(text);
  const hasGreek = /[\u0370-\u03FF\u1F00-\u1FFF]/.test(text);

  if (hasKorean) {
    return {
      fontFamily: '"Gamja Flower", "Noto Sans KR", sans-serif',
      fill: "var(--cerulean)",
      fontWeight: 400,
      letterSpacing: "0",
    };
  }

  if (hasJapanese) {
    return {
      fontFamily: '"Yomogi", "Noto Sans JP", sans-serif',
      fill: "var(--cerulean)",
      fontWeight: 600,
      fontSize: "12px",
      letterSpacing: "0",
    };
  }

  if (hasCjkHan) {
    return {
      fontFamily: '"Zhi Mang Xing", "Noto Sans SC", sans-serif',
      fill: "var(--cerulean)",
      fontWeight: 400,
      letterSpacing: "0",
    };
  }

  if (hasGreek) {
    return {
      fontFamily: '"Manrope", sans-serif',
      fill: "var(--cerulean)",
      fontWeight: 300,
      fontSize: "12px",
      letterSpacing: "0",
    };
  }

  return {
    fontFamily: '"Caveat", cursive',
    fill: "var(--cerulean)",
    fontWeight: 400,
    letterSpacing: "0",
  };
}

function getNodePosition(node, fallbackX, fallbackY) {
  return {
    x: Number.isFinite(node?.x) ? node.x : fallbackX,
    y: Number.isFinite(node?.y) ? node.y : fallbackY,
  };
}

function sourceId(link) {
  return typeof link?.source === "object" ? link.source?.id : link?.source;
}

function targetId(link) {
  return typeof link?.target === "object" ? link.target?.id : link?.target;
}

function hasNodeId(link, nodeId) {
  return sourceId(link) === nodeId || targetId(link) === nodeId;
}

function getTooltipPosition(event, bounds) {
  return getTooltipPositionFromPoint(event.clientX, event.clientY, bounds);
}

function getTooltipPositionFromPoint(clientX, clientY, bounds) {
  const cursorX = clientX - (bounds?.left ?? 0);
  const cursorY = clientY - (bounds?.top ?? 0);
  const boundsWidth = bounds?.width ?? window.innerWidth;
  const boundsHeight = bounds?.height ?? window.innerHeight;

  let x = cursorX + TOOLTIP_MARGIN;
  let y = cursorY + TOOLTIP_MARGIN;

  if (x + TOOLTIP_ESTIMATED_WIDTH > boundsWidth - TOOLTIP_MARGIN) {
    x = cursorX - TOOLTIP_ESTIMATED_WIDTH - TOOLTIP_MARGIN;
  }

  if (y + TOOLTIP_ESTIMATED_HEIGHT > boundsHeight - TOOLTIP_MARGIN) {
    y = cursorY - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_MARGIN;
  }

  x = Math.max(TOOLTIP_MARGIN, Math.min(x, boundsWidth - TOOLTIP_ESTIMATED_WIDTH - TOOLTIP_MARGIN));
  y = Math.max(TOOLTIP_MARGIN, Math.min(y, boundsHeight - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_MARGIN));

  return {
    x,
    y,
    visible: true,
  };
}

export default function NetworkGraph({
  graph,
  layoutLinks,
  layoutMode,
  pinnedNodeId,
  selectedNodeId,
  onSelectNode,
}) {
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const transitionStartTimeRef = useRef(0);
  const prevSelectedRef = useRef(null);
  const lastTapRef = useRef({ nodeId: null, timestamp: 0 });
  const lastPointerTypeRef = useRef("mouse");
  const [size, setSize] = useState({ width: 1200, height: 680 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0, visible: false });
  const [showLinksPhase, setShowLinksPhase] = useState(false);
  const [flagLoadFailedByNodeId, setFlagLoadFailedByNodeId] = useState({});
  const layoutGraph = useMemo(
    () => ({
      nodes: graph.nodes,
      links: layoutLinks ?? [],
    }),
    [graph.nodes, layoutLinks]
  );
  const activeDragNodeIdRef = useRef(null);
  const dragMoveCountRef = useRef(0);
  const {
    nodes: layoutNodes,
    isDraggable,
    beginDragNode,
    dragNode,
    endDragNode,
  } = useForceLayout(layoutGraph, size.width, size.height, {
    mode: layoutMode,
    pinnedNodeId,
    mdsLinks: graph.links,  // stable full pairwise distances — never changes
  });

  const nodeById = useMemo(() => {
    return new Map(layoutNodes.map((node) => [node.id, node]));
  }, [layoutNodes]);

  const baseFlagRadius = useMemo(() => {
    const minDim = Math.min(size.width, size.height);
    return clamp(minDim * 0.018, MIN_FLAG_RADIUS, MAX_FLAG_RADIUS);
  }, [size.height, size.width]);

  const renderedNodes = useMemo(() => {
    const nodesSorted = [...layoutNodes].sort((a, b) => {
      const aSelected = a.id === selectedNodeId ? 1 : 0;
      const bSelected = b.id === selectedNodeId ? 1 : 0;
      return aSelected - bSelected;
    });

    const acceptedLabelRects = [];

    return nodesSorted.map((node) => {
      const isSelected = node.id === selectedNodeId;
      const pos = getNodePosition(node, size.width / 2, size.height / 2);
      const countryCode = node.country_code?.toLowerCase();
      const nodeRadius = isSelected ? baseFlagRadius + 4 : baseFlagRadius;
      const label = getNodeLabel(node);
      const labelY = nodeRadius + 18;

      const estimatedLabelWidth = Math.max(28, String(label || "").length * 7.2);
      const labelRect = {
        left: pos.x - estimatedLabelWidth / 2,
        right: pos.x + estimatedLabelWidth / 2,
        top: pos.y + labelY - 13,
        bottom: pos.y + labelY + 3,
      };

      let showLabel = true;
      for (const other of layoutNodes) {
        if (other.id === node.id) {
          continue;
        }

        const otherPos = getNodePosition(other, size.width / 2, size.height / 2);
        const otherIsSelected = other.id === selectedNodeId;
        const otherRadius = (otherIsSelected ? baseFlagRadius + 4 : baseFlagRadius) + 2;

        if (
          circleIntersectsRect(
            otherPos.x,
            otherPos.y,
            otherRadius,
            labelRect.left,
            labelRect.top,
            labelRect.right,
            labelRect.bottom
          )
        ) {
          showLabel = false;
          break;
        }
      }

      // If multiple labels overlap each other, keep the first visible one.
      if (showLabel) {
        const overlapsVisibleLabel = acceptedLabelRects.some((rect) => rectsOverlap(rect, labelRect));
        if (overlapsVisibleLabel) {
          showLabel = false;
        } else {
          acceptedLabelRects.push(labelRect);
        }
      }

      return {
        node,
        pos,
        isSelected,
        countryCode,
        nodeRadius,
        label,
        labelY,
        showLabel,
      };
    });
  }, [baseFlagRadius, layoutNodes, selectedNodeId, size.height, size.width]);

  function getPointerGraphPosition(event) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) {
      return { x: size.width / 2, y: size.height / 2 };
    }

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * size.width,
      y: ((event.clientY - bounds.top) / bounds.height) * size.height,
    };
  }

  function stopDraggingNode(nodeId) {
    if (!activeDragNodeIdRef.current || activeDragNodeIdRef.current !== nodeId) {
      return;
    }
    endDragNode(nodeId);
    activeDragNodeIdRef.current = null;
  }

  const renderedLinks = useMemo(() => {
    if (!selectedNodeId || !showLinksPhase) {
      return [];
    }

    return (layoutLinks ?? [])
      .map((link, index) => {
        const source = nodeById.get(sourceId(link));
        const target = nodeById.get(targetId(link));
        if (!source || !target) {
          return null;
        }

        const distance = Number(link?.distance_euclidean);
        const opacity = Number.isFinite(distance)
          ? Math.max(0.16, Math.min(0.58, 0.82 - distance * 0.08))
          : 0.32;

        return {
          key: `${source.id}-${target.id}-${index}`,
          sourceId: source.id,
          targetId: target.id,
          sourceLabel: getNodeLabel(source),
          targetLabel: getNodeLabel(target),
          distance: Number.isFinite(distance) ? distance : null,
          rank: Number.isFinite(Number(link?.distance_rank)) ? Number(link.distance_rank) : null,
          rankTotal: Number.isFinite(Number(link?.distance_rank_total))
            ? Number(link.distance_rank_total)
            : null,
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y,
          opacity,
        };
      })
      .filter(Boolean);
  }, [layoutLinks, nodeById, selectedNodeId, showLinksPhase]);

  useEffect(() => {
    function updateSize() {
      const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth;
      const containerHeight = containerRef.current?.clientHeight ?? window.innerHeight;
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const width = Math.max(320, containerWidth);
      const height = Math.max(240, containerHeight - headerHeight - 8);

      setSize({
        width: Math.round(width),
        height: Math.round(height),
      });
    }

    updateSize();
    window.addEventListener("resize", updateSize);

    let observer;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      observer = new ResizeObserver(updateSize);
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateSize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const wasNull = prevSelectedRef.current === null;
    prevSelectedRef.current = selectedNodeId;

    if (selectedNodeId) {
      if (wasNull) {
        // MDS → focus: delay links so nodes animate into position first
        transitionStartTimeRef.current = performance.now();
        setShowLinksPhase(false);
        const timer = setTimeout(() => setShowLinksPhase(true), 350);
        return () => clearTimeout(timer);
      } else {
        // focus → focus (dropdown change): show links immediately
        setShowLinksPhase(true);
      }
    } else {
      setShowLinksPhase(false);
      transitionStartTimeRef.current = 0;
    }
  }, [selectedNodeId]);

  const hoveredNodeLabel = hoveredNode?.word || hoveredNode?.language || hoveredNode?.id;
  const hoveredNodeSimilarityRank = useMemo(() => {
    if (!selectedNodeId || !hoveredNode || hoveredNode.id === selectedNodeId) {
      return null;
    }

    const rankLink = (layoutLinks ?? []).find(
      (link) =>
        hasNodeId(link, selectedNodeId) &&
        hasNodeId(link, hoveredNode.id) &&
        Number.isFinite(Number(link?.distance_rank)) &&
        Number.isFinite(Number(link?.distance_rank_total))
    );

    if (!rankLink) {
      return null;
    }

    return {
      rank: Number(rankLink.distance_rank),
      total: Number(rankLink.distance_rank_total),
    };
  }, [hoveredNode, layoutLinks, selectedNodeId]);
  const selectedOptionText = useMemo(() => {
    if (!selectedNodeId) {
      return "my language";
    }

    const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode) {
      return "my language";
    }

    return getCompareOptionLabel(selectedNode);
  }, [graph.nodes, selectedNodeId]);

  const selectWidthCh = useMemo(() => {
    return clamp(String(selectedOptionText || "").length + 1.5, 12, 44);
  }, [selectedOptionText]);

  return (
    <section className="graph-shell" ref={containerRef}>
      <div className="graph-header" ref={headerRef}>
        <label className="graph-compare-row" htmlFor="language-compare-select">
          <span>How does </span>
          <select
            id="language-compare-select"
            className="graph-language-select"
            value={selectedNodeId ?? ""}
            style={{ width: `calc(${selectWidthCh}ch + 1.1rem)` }}
            onChange={(event) => {
              const nextId = event.target.value;
              onSelectNode(nextId || null);
            }}
          >
            <option value="">my language</option>
            {graph.nodes.map((node) => {
              return (
                <option key={node.id} value={node.id}>
                  {getCompareOptionLabel(node)}
                </option>
              );
            })}
          </select>
          <span>compare with others?</span>
        </label>
      </div>

      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="graph-svg"
        role="img"
        aria-label="Network graph"
      >
        {renderedLinks.map((link) => (
          <line
            key={link.key}
            className="graph-link"
            x1={link.x1}
            y1={link.y1}
            x2={link.x2}
            y2={link.y2}
            style={{ opacity: link.opacity }}
            onMouseEnter={(event) => {
              const bounds = containerRef.current?.getBoundingClientRect();
              setHoveredNode(null);
              setHoveredLink(link);
              setTooltip(getTooltipPosition(event, bounds));
            }}
            onMouseMove={(event) => {
              const bounds = containerRef.current?.getBoundingClientRect();
              setTooltip(getTooltipPosition(event, bounds));
            }}
            onMouseLeave={() => {
              setTooltip((prev) => ({ ...prev, visible: false }));
            }}
          />
        ))}

        {renderedNodes.map(({ node, pos, isSelected, countryCode, nodeRadius, label, labelY, showLabel }) => {
            const color = BASE_NODE_COLOR;
            const useLanguageFlagPath = Number(node.language_tag) === 1;
            const flagHref = useLanguageFlagPath
              ? `https://hatscripts.github.io/circle-flags/flags/language/${countryCode}.svg`
              : `https://hatscripts.github.io/circle-flags/flags/${countryCode}.svg`;
            const flagLoadFailed = flagLoadFailedByNodeId[node.id] === true;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className={`graph-node ${isSelected ? "is-selected" : ""}`}
                onClick={() => {
                  if (isTouchPointerType(lastPointerTypeRef.current)) {
                    return;
                  }
                  if (dragMoveCountRef.current === 0) {
                    setHoveredLink(null);
                    setHoveredNode(null);
                    setTooltip((prev) => ({ ...prev, visible: false }));
                    onSelectNode(node.id);
                  }
                }}
                onMouseEnter={(event) => {
                  const bounds = containerRef.current?.getBoundingClientRect();
                  setHoveredLink(null);
                  setHoveredNode(node);
                  setTooltip(getTooltipPosition(event, bounds));
                }}
                onMouseMove={(event) => {
                  const bounds = containerRef.current?.getBoundingClientRect();
                  setTooltip(getTooltipPosition(event, bounds));
                }}
                onMouseLeave={() => {
                  setTooltip((prev) => ({ ...prev, visible: false }));
                }}
                onPointerDown={(event) => {
                  lastPointerTypeRef.current = event.pointerType || "mouse";
                  // Always reset click-vs-drag state for a new pointer interaction,
                  // even when not draggable (e.g. initial MDS view).
                  dragMoveCountRef.current = 0;
                  if (!isDraggable) {
                    return;
                  }
                  const pointer = getPointerGraphPosition(event);
                  activeDragNodeIdRef.current = node.id;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  beginDragNode(node.id, pointer.x, pointer.y);
                }}
                onPointerMove={(event) => {
                  if (!isDraggable || activeDragNodeIdRef.current !== node.id) {
                    return;
                  }
                  dragMoveCountRef.current += 1;
                  const pointer = getPointerGraphPosition(event);
                  dragNode(node.id, pointer.x, pointer.y);
                }}
                onPointerUp={(event) => {
                  stopDraggingNode(node.id);

                  if (!isTouchPointerType(event.pointerType) || dragMoveCountRef.current !== 0) {
                    return;
                  }

                  const now = Date.now();
                  const isDoubleTap =
                    lastTapRef.current.nodeId === node.id &&
                    now - lastTapRef.current.timestamp <= DOUBLE_TAP_THRESHOLD_MS;

                  if (isDoubleTap) {
                    const bounds = containerRef.current?.getBoundingClientRect();
                    setHoveredLink(null);
                    setHoveredNode(node);
                    setTooltip(getTooltipPositionFromPoint(event.clientX, event.clientY, bounds));
                    lastTapRef.current = { nodeId: null, timestamp: 0 };
                    return;
                  }

                  setHoveredLink(null);
                  setHoveredNode(null);
                  setTooltip((prev) => ({ ...prev, visible: false }));
                  onSelectNode(node.id);
                  lastTapRef.current = { nodeId: node.id, timestamp: now };
                }}
                onPointerCancel={() => {
                  stopDraggingNode(node.id);
                }}
                onLostPointerCapture={() => {
                  stopDraggingNode(node.id);
                }}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setHoveredLink(null);
                    setHoveredNode(null);
                    setTooltip((prev) => ({ ...prev, visible: false }));
                    onSelectNode(node.id);
                  }
                }}
              >
                {countryCode && !flagLoadFailed ? (
                  <image
                    href={flagHref}
                    x={-nodeRadius}
                    y={-nodeRadius}
                    width={nodeRadius * 2}
                    height={nodeRadius * 2}
                    onError={() => {
                      setFlagLoadFailedByNodeId((prev) => ({ ...prev, [node.id]: true }));
                    }}
                  />
                ) : (
                  <circle r={nodeRadius} fill={color} />
                )}
                {showLabel ? (
                  <text y={labelY} textAnchor="middle" style={getNodeLabelStyle(label)}>
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
      </svg>

      {tooltip.visible && hoveredNode ? (
        <aside
          className="graph-tooltip"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <h3>{hoveredNodeLabel}</h3>
          {selectedNodeId && hoveredNode?.id !== selectedNodeId ? (
            <p>
              Similarity rank: {hoveredNodeSimilarityRank ? `${hoveredNodeSimilarityRank.rank}/${hoveredNodeSimilarityRank.total}` : "-"}
            </p>
          ) : null}
          <p>Language: {hoveredNode.language || "Unknown language"}</p>
          <p>Word: {hoveredNode.word || "-"}</p>
          <p>Place: {hoveredNode.country || "-"}</p>
          <p>Pronunciation: {hoveredNode.pronunciation || "-"}</p>
        </aside>
      ) : null}

      {tooltip.visible && hoveredLink ? (
        <aside
          className="graph-tooltip"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <h3>
            {hoveredLink.sourceLabel} - {hoveredLink.targetLabel}
          </h3>
          <p>
            Euclidean distance: {Number.isFinite(hoveredLink.distance) ? hoveredLink.distance.toFixed(3) : "-"}
          </p>
          <p>
            Similarity rank: {hoveredLink.rank ?? "-"}/{hoveredLink.rankTotal ?? "-"}
          </p>
        </aside>
      ) : null}
    </section>
  );
}
