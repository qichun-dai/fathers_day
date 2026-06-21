export const initialGraph = {
  nodes: [
    {
      id: "home",
      label: "Home",
      type: "topic",
      note: "Main node that connects core ideas.",
    },
    {
      id: "memory",
      label: "Memory",
      type: "idea",
      note: "Thoughts and stories for reflection.",
    },
    {
      id: "family",
      label: "Family",
      type: "topic",
      note: "Relationships and shared experiences.",
    },
    {
      id: "future",
      label: "Future",
      type: "idea",
      note: "Plans and aspirations.",
    },
    {
      id: "gratitude",
      label: "Gratitude",
      type: "highlight",
      note: "Moments worth celebrating.",
    },
  ],
  links: [
    { source: "home", target: "memory" },
    { source: "home", target: "family" },
    { source: "home", target: "future" },
    { source: "family", target: "gratitude" },
    { source: "memory", target: "gratitude" },
  ],
};
