# Fathers Day Language Similarity Visualization

This project explores how similar the word for dad sounds across languages.

The app combines a Python data pipeline and a React visualization:
- Google Cloud speech audio assets (pronunciations per language)
- embedding vectors from each audio file
- Euclidean distance between all vector pairs
- pairwise distance projection to 2D via MDS
- interactive force-directed layout with d3-force in the UI

## How The Visualization Works

1. Audio input
- Each language/country entry has an audio pronunciation file.
- Audio files are prepared and copied into `public/audio` for runtime playback.

2. Embedding vectors
- Audio files are converted into embedding vectors.
- The vectors are stored in `data/processed/voice_vectors.csv`.

3. Distance calculation
- The pipeline computes pairwise distances between vectors.
- Euclidean distance is used and written to `data/processed/distance_matrix.csv`.

4. 2D projection (MDS)
- Pairwise distances are projected into 2D coordinates.
- The Python transform step uses embeddings first (UMAP/PCA path), with MDS available for distance-based layout generation.
- Nodes and links are written to `data/processed/graph.json` and copied to `public/data/graph.json`.

5. Interactive layout in React
- The app loads `public/data/graph.json` at runtime.
- `d3-force` is used for the interactive graph behavior.
- A focused comparison mode computes ranked similarity links from a selected node.

## Project Structure

```text
src/
  App.jsx
  main.jsx
  components/
    NetworkGraph.jsx
    ErrorBoundary.jsx
  hooks/
    useForceLayout.js
  data/
    seedGraph.js
  styles/
    app.css

scripts/python/
  extract.py
  transform.py
  build_graph.py
  voice_vector.py
  vector_distance.py

data/
  raw/
    dad_words.csv
  processed/
    voice_vectors.csv
    distance_matrix.csv
    graph.json

public/
  data/
    graph.json
  audio/
```

## Local Development

1. Install dependencies

```bash
npm install
```

2. Build graph data (Python pipeline)

```bash
python scripts/python/voice_vector.py
python scripts/python/build_graph.py
```

3. Start dev server

```bash
npm run dev
```

## Production Build

```bash
npm run build
```

Build output is generated in `dist/`.

## Deploy To GitLab Pages

This repository is already configured for GitLab Pages:
- `vite.config.js` uses `base: "/fathers_day/"`
- `.gitlab-ci.yml` builds with npm and publishes `dist` as `public`

### Steps

1. Push your branch to GitLab:

```bash
git push origin main
```

2. GitLab CI runs the `pages` job.

3. Open your Pages URL:
- `https://daiqichun927.gitlab.io/fathers_day/`

### Notes

- If you rename the GitLab project, update `base` in `vite.config.js`.
- The app uses base-aware paths for data and audio, so project-page hosting works.

## Data Refresh Workflow Before Deploy

When data changes, run:

```bash
python scripts/python/voice_vector.py
python scripts/python/build_graph.py
npm run build
```

Then commit and push so GitLab Pages serves the refreshed dataset.
