import { useEffect, useMemo, useRef, useState } from "react";
import NetworkGraph from "./components/NetworkGraph";
import { initialGraph } from "./data/seedGraph";

const TOOLTIP_MARGIN = 12;
const TOOLTIP_ESTIMATED_WIDTH = 300;
const TOOLTIP_ESTIMATED_HEIGHT = 140;
const DAD_WORD_ROTATION = ["dad", "papa", "tata", "baba", "apu"];
const DAD_WORD_ROTATION_MS = 2400;

function sourceId(link) {
  return typeof link?.source === "object" ? link.source?.id : link?.source;
}

function targetId(link) {
  return typeof link?.target === "object" ? link.target?.id : link?.target;
}

function pairKey(a, b) {
  return String(a) < String(b) ? `${a}__${b}` : `${b}__${a}`;
}

function getFiniteDistance(link) {
  const distance = Number(link?.distance_euclidean);
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

function getTooltipPosition(event, bounds) {
  const cursorX = event.clientX - (bounds?.left ?? 0);
  const cursorY = event.clientY - (bounds?.top ?? 0);
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

export default function App() {
  const [graph, setGraph] = useState(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [landingHoveredNode, setLandingHoveredNode] = useState(null);
  const [landingTooltip, setLandingTooltip] = useState({ x: 0, y: 0, visible: false });
  const [dadWordIndex, setDadWordIndex] = useState(0);
  const [isCompactLanding, setIsCompactLanding] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 700 : false
  );
  const audioRef = useRef(null);
  const appRootRef = useRef(null);
  const landingSectionRef = useRef(null);
  const mdsSectionRef = useRef(null);
  const landingContentRef = useRef(null);
  const snapLockRef = useRef(false);
  const touchStartYRef = useRef(0);

  const comparisonLinks = useMemo(() => {
    if (!selectedNodeId || !graph.nodes.length) {
      return graph.links;
    }

    const nodeIds = graph.nodes.map((node) => node.id);
    const distanceByPair = new Map();
    let distanceSum = 0;
    let distanceCount = 0;

    for (const link of graph.links) {
      const source = sourceId(link);
      const target = targetId(link);
      if (source == null || target == null) {
        continue;
      }

      const distance = getFiniteDistance(link);
      if (distance != null) {
        distanceByPair.set(pairKey(source, target), distance);
        distanceSum += distance;
        distanceCount += 1;
      }
    }

    const fallbackDistance = distanceCount > 0 ? distanceSum / distanceCount : 1;

    const comparisons = nodeIds
      .filter((nodeId) => nodeId !== selectedNodeId)
      .map((nodeId) => {
        const key = pairKey(selectedNodeId, nodeId);
        const distance = distanceByPair.get(key) ?? fallbackDistance;
        return {
          source: selectedNodeId,
          target: nodeId,
          distance_euclidean: distance,
        };
      });

    const sortedComparisons = [...comparisons].sort((a, b) => {
      const aDistance = Number(a.distance_euclidean);
      const bDistance = Number(b.distance_euclidean);
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }
      return String(targetId(a)).localeCompare(String(targetId(b)));
    });

    const rankByTargetId = new Map(
      sortedComparisons.map((link, index) => [targetId(link), index + 1])
    );
    const rankTotal = sortedComparisons.length;

    return comparisons.map((link) => {
      const target = targetId(link);
      return {
        ...link,
        distance_rank: rankByTargetId.get(target) ?? null,
        distance_rank_total: rankTotal,
      };
    });
  }, [graph.links, graph.nodes, selectedNodeId]);

  useEffect(() => {
    let isMounted = true;
    async function loadPreparedGraph() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/graph.json`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const hasValidShape = Array.isArray(payload?.nodes) && Array.isArray(payload?.links);

        if (!isMounted || !hasValidShape) {
          return;
        }

        setGraph(payload);
        setSelectedNodeId(null);
      } catch {
        // Keep static fallback data when runtime file is unavailable.
      }
    }

    loadPreparedGraph();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDadWordIndex((prev) => (prev + 1) % DAD_WORD_ROTATION.length);
    }, DAD_WORD_ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      setIsCompactLanding(window.innerWidth <= 700);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function playNodeAudio(nodeId) {
    const node = graph.nodes.find((item) => item.id === nodeId);
    const fileName = node?.file_name;
    if (!fileName) {
      return;
    }

    const nextSrc = `${import.meta.env.BASE_URL}audio/${encodeURIComponent(fileName)}`;
    if (!audioRef.current || audioRef.current.src !== new URL(nextSrc, window.location.origin).href) {
      audioRef.current = new Audio(nextSrc);
    }

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      // Ignore autoplay-related rejections; click interaction should usually allow playback.
    });
  }

  function handleSelectNode(nodeId) {
    setSelectedNodeId(nodeId);
    playNodeAudio(nodeId);
  }

  const landingNodes = useMemo(() => {
    const dutchNode =
      graph.nodes.find(
        (node) =>
          String(node?.language || "").toLowerCase() === "dutch" &&
          String(node?.country_code || "").toUpperCase() === "NL"
      ) ?? null;

    const usNode =
      graph.nodes.find(
        (node) =>
          String(node?.language || "").toLowerCase() === "english" &&
          String(node?.country_code || "").toUpperCase() === "US"
      ) ?? null;

    return { dutchNode, usNode };
  }, [graph.nodes]);

  const landingHoveredNodeLabel =
    landingHoveredNode?.word || landingHoveredNode?.language || landingHoveredNode?.id;
  const rotatingDadWord = DAD_WORD_ROTATION[dadWordIndex];
  const landingDemoLayout = useMemo(() => {
    const leftNodeX = isCompactLanding ? 185 : 210;
    const rightNodeX = isCompactLanding ? 515 : 490;
    return {
      leftNodeX,
      rightNodeX,
      centerTextX: (leftNodeX + rightNodeX) / 2,
    };
  }, [isCompactLanding]);

  function showLandingTooltip(event, node) {
    const bounds = landingContentRef.current?.getBoundingClientRect();
    setLandingHoveredNode(node);
    setLandingTooltip(getTooltipPosition(event, bounds));
  }

  function hideLandingTooltip() {
    setLandingTooltip((prev) => ({ ...prev, visible: false }));
  }

  function scrollToSection(sectionRef) {
    if (!sectionRef.current) {
      return;
    }
    sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSectionSnap(direction) {
    const root = appRootRef.current;
    if (!root || snapLockRef.current) {
      return;
    }

    const threshold = root.clientHeight * 0.5;
    const isOnFirstSection = root.scrollTop < threshold;
    const isOnSecondSection = root.scrollTop >= threshold;

    if ((direction > 0 && isOnFirstSection) || (direction < 0 && isOnSecondSection)) {
      snapLockRef.current = true;
      if (direction > 0) {
        scrollToSection(mdsSectionRef);
      } else {
        scrollToSection(landingSectionRef);
      }

      window.setTimeout(() => {
        snapLockRef.current = false;
      }, 520);
    }
  }

  return (
    <div
      className="app-root"
      ref={appRootRef}
      onWheel={(event) => {
        if (Math.abs(event.deltaY) < 8) {
          return;
        }
        event.preventDefault();
        handleSectionSnap(event.deltaY > 0 ? 1 : -1);
      }}
      onTouchStart={(event) => {
        touchStartYRef.current = event.touches[0]?.clientY ?? 0;
      }}
      onTouchEnd={(event) => {
        const touchEndY = event.changedTouches[0]?.clientY ?? touchStartYRef.current;
        const deltaY = touchStartYRef.current - touchEndY;
        if (Math.abs(deltaY) < 24) {
          return;
        }
        handleSectionSnap(deltaY > 0 ? 1 : -1);
      }}
    >
      <section className="landing-section" aria-label="Introduction" ref={landingSectionRef}>
        <div className="landing-content" ref={landingContentRef}>
          <h1 className="landing-title">
            How similar do we call our{" "}
            <span className="landing-title-highlight">
              <span key={rotatingDadWord} className="landing-title-highlight-word">
                {rotatingDadWord}
              </span>
            </span>
            ?
          </h1>
          <p className="landing-instruction">Many languages use surprisingly similar words for dad, such as papa, baba, and abba. This project explores patterns of phonetic similarity across languages by comparing how the word "dad" is pronounced. Audio recordings are converted into embedding vectors, and distances between them are measured to reveal which languages sound more alike (at least in the "ears" of the embedding model).</p>

          <div className="landing-visual" role="img" aria-label="Dutch papa and US English dad are nearby and sound similar">
            <svg viewBox="0 0 700 280" className="landing-visual-svg">
              <line
                x1={landingDemoLayout.leftNodeX}
                y1="150"
                x2={landingDemoLayout.rightNodeX}
                y2="150"
                className="landing-connection-line"
              />

              <text x={landingDemoLayout.centerTextX} y="136" textAnchor="middle" className="landing-connection-text">
                nearby languages sound more similar
              </text>

              <g
                className="landing-interactive-node"
                tabIndex={0}
                role="button"
                aria-label="Play Dutch pronunciation"
                onClick={() => {
                  if (landingNodes.dutchNode) {
                    playNodeAudio(landingNodes.dutchNode.id);
                  }
                }}
                onMouseEnter={(event) => {
                  if (landingNodes.dutchNode) {
                    showLandingTooltip(event, landingNodes.dutchNode);
                  }
                }}
                onMouseMove={(event) => {
                  if (landingNodes.dutchNode) {
                    const bounds = landingContentRef.current?.getBoundingClientRect();
                    setLandingTooltip(getTooltipPosition(event, bounds));
                  }
                }}
                onMouseLeave={hideLandingTooltip}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && landingNodes.dutchNode) {
                    playNodeAudio(landingNodes.dutchNode.id);
                  }
                }}
              >
                <image
                  href="https://hatscripts.github.io/circle-flags/flags/nl.svg"
                  x={landingDemoLayout.leftNodeX - 20}
                  y="130"
                  width="40"
                  height="40"
                  className="landing-flag-node"
                />
                <text x={landingDemoLayout.leftNodeX} y="196" textAnchor="middle" className="landing-node-label">
                  papa
                </text>
              </g>

              <g
                className="landing-interactive-node"
                tabIndex={0}
                role="button"
                aria-label="Play US English pronunciation"
                onClick={() => {
                  if (landingNodes.usNode) {
                    playNodeAudio(landingNodes.usNode.id);
                  }
                }}
                onMouseEnter={(event) => {
                  if (landingNodes.usNode) {
                    showLandingTooltip(event, landingNodes.usNode);
                  }
                }}
                onMouseMove={(event) => {
                  if (landingNodes.usNode) {
                    const bounds = landingContentRef.current?.getBoundingClientRect();
                    setLandingTooltip(getTooltipPosition(event, bounds));
                  }
                }}
                onMouseLeave={hideLandingTooltip}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && landingNodes.usNode) {
                    playNodeAudio(landingNodes.usNode.id);
                  }
                }}
              >
                <image
                  href="https://hatscripts.github.io/circle-flags/flags/us.svg"
                  x={landingDemoLayout.rightNodeX - 20}
                  y="130"
                  width="40"
                  height="40"
                  className="landing-flag-node"
                />
                <text x={landingDemoLayout.rightNodeX} y="196" textAnchor="middle" className="landing-node-label">
                  dad
                </text>
              </g>

              <path d={`M ${landingDemoLayout.leftNodeX} 128 Q ${landingDemoLayout.leftNodeX + 4} 84 ${landingDemoLayout.leftNodeX + 26} 72`} className="landing-callout-line" />
              <path d={`M ${landingDemoLayout.leftNodeX + 26} 72 L ${landingDemoLayout.leftNodeX + 14} 73`} className="landing-callout-line" />
              <path d={`M ${landingDemoLayout.leftNodeX + 26} 72 L ${landingDemoLayout.leftNodeX + 19} 83`} className="landing-callout-line" />
              <text x="94" y="68" className="landing-callout-text">
                click to hear the pronunciation
              </text>
            </svg>
          </div>

          <div
            className="landing-scroll-hint"
            role="button"
            tabIndex={0}
            aria-label="Scroll to language comparison graph"
            onClick={() => scrollToSection(mdsSectionRef)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                scrollToSection(mdsSectionRef);
              }
            }}
          >
            <span>scroll down</span>
            <span className="landing-scroll-arrow" />
          </div>

          {landingTooltip.visible && landingHoveredNode ? (
            <aside
              className="graph-tooltip landing-tooltip"
              style={{
                left: `${landingTooltip.x}px`,
                top: `${landingTooltip.y}px`,
              }}
            >
              <h3>{landingHoveredNodeLabel}</h3>
              <p>Language: {landingHoveredNode.language || "Unknown language"}</p>
              <p>Place: {landingHoveredNode.country || "-"}</p>
              <p>Word: {landingHoveredNode.word || "-"}</p>
              <p>Pronunciation: {landingHoveredNode.pronunciation || "-"}</p>
            </aside>
          ) : null}
        </div>
      </section>

      <section className="mds-section" aria-label="Language comparison graph" ref={mdsSectionRef}>
        <div className="mds-section-content">
          <NetworkGraph
            graph={graph}
            layoutLinks={comparisonLinks}
            layoutMode={selectedNodeId ? "focus" : "mds"}
            pinnedNodeId={selectedNodeId}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        </div>
      </section>

      <div className="designed-by">designed by Qichun</div>
    </div>
  );
}
