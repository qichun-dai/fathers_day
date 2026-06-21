from __future__ import annotations

from typing import Dict, List

import numpy as np


def _clean_node(word: Dict[str, str], file_name: str) -> Dict[str, str]:
    language_tag = 1 if str(word.get("language_tag", "0")).strip() == "1" else 0
    return {
        "id": word["id"].strip(),
        "language": word.get("language", "").strip(),
        "country": word.get("country", "").strip(),
        "country_code": word.get("country_code", "").strip(),
        "lang": word.get("lang", "").strip(),
        "word": word.get("word", "").strip(),
        "pronunciation": word.get("pronunciation", "").strip(),
        "file_name": file_name,
        "language_tag": language_tag,
    }


def _clean_link(link: Dict[str, str]) -> Dict[str, str]:
    return {
        "source": link["i"].strip(),
        "target": link["j"].strip(),
        "distance_cosine": float(link["distance_cosine"]),
        "distance_euclidean": float(link["distance_euclidean"]),
    }


def _extract_embedding_vectors(voice_vectors: List[Dict[str, str]]) -> Dict[str, np.ndarray]:
    vectors_dict: Dict[str, np.ndarray] = {}
    for row in voice_vectors:
        node_id = row.get("ID", "").strip()
        vector_text = row.get("vectors", "").strip()
        if not node_id or not vector_text:
            continue
        try:
            vector = np.array([float(value) for value in vector_text.split()], dtype=np.float64)
        except ValueError:
            continue
        if vector.size == 0:
            continue
        vectors_dict[node_id] = vector
    return vectors_dict


def _reduce_embeddings_xy(
    nodes: List[Dict[str, str]], voice_vectors: List[Dict[str, str]]
) -> Dict[str, tuple[float, float]]:
    vectors_dict = _extract_embedding_vectors(voice_vectors)
    node_ids = [node["id"] for node in nodes if node["id"] in vectors_dict]
    if not node_ids:
        return {}
    if len(node_ids) == 1:
        return {node_ids[0]: (0.0, 0.0)}

    embeddings = np.vstack([vectors_dict[node_id] for node_id in node_ids])

    coords = None
    try:
        import importlib

        umap_module = importlib.import_module("umap.umap_")
        reducer = umap_module.UMAP(
            n_components=2,
            n_neighbors=min(10, max(3, len(node_ids) - 1)),
            min_dist=0.1,
            spread=2.0,
            metric="cosine",
            random_state=42,
        )
        coords = reducer.fit_transform(embeddings)
    except Exception:
        try:
            from sklearn.decomposition import PCA

            coords = PCA(n_components=2).fit_transform(embeddings)
        except Exception:
            coords = None

    if coords is None:
        return {}

    return {
        node_id: (float(coords[idx, 0]), float(coords[idx, 1]))
        for idx, node_id in enumerate(node_ids)
    }


def _compute_mds_xy(
    nodes: List[Dict[str, str]], links: List[Dict[str, str]]
) -> Dict[str, tuple[float, float]]:
    node_ids = [node["id"] for node in nodes]
    n = len(node_ids)
    if n == 0:
        return {}
    if n == 1:
        return {node_ids[0]: (0.0, 0.0)}

    id_to_index = {node_id: index for index, node_id in enumerate(node_ids)}

    distance_matrix = np.zeros((n, n), dtype=np.float64)
    max_distance = 0.0

    for link in links:
        source = link["source"]
        target = link["target"]
        if source not in id_to_index or target not in id_to_index:
            continue

        i = id_to_index[source]
        j = id_to_index[target]
        distance = float(link["distance_euclidean"])
        distance_matrix[i, j] = distance
        distance_matrix[j, i] = distance
        if distance > max_distance:
            max_distance = distance

    if max_distance > 0:
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                if distance_matrix[i, j] == 0.0:
                    distance_matrix[i, j] = max_distance

    coords = _smacof_mds(distance_matrix, n_components=2, random_seed=42)

    return {
        node_id: (float(coords[idx, 0]), float(coords[idx, 1]))
        for idx, node_id in enumerate(node_ids)
    }


def _smacof_mds(
    dissimilarities: np.ndarray,
    n_components: int = 2,
    random_seed: int = 42,
    n_init: int = 6,
    max_iter: int = 400,
    eps: float = 1e-8,
) -> np.ndarray:
    n = dissimilarities.shape[0]
    if n == 0:
        return np.zeros((0, n_components), dtype=np.float64)
    if n == 1:
        return np.zeros((1, n_components), dtype=np.float64)

    mask = np.ones((n, n), dtype=bool)
    np.fill_diagonal(mask, False)

    rng = np.random.default_rng(random_seed)
    best_coords = None
    best_stress = np.inf

    for _ in range(n_init):
        x = rng.normal(loc=0.0, scale=1.0, size=(n, n_components))
        prev_stress = np.inf

        for _ in range(max_iter):
            diff = x[:, np.newaxis, :] - x[np.newaxis, :, :]
            distances = np.linalg.norm(diff, axis=2)
            np.fill_diagonal(distances, 1.0)

            ratio = np.zeros_like(dissimilarities)
            ratio[mask] = dissimilarities[mask] / distances[mask]

            b = -ratio
            np.fill_diagonal(b, -b.sum(axis=1))

            x_new = (b @ x) / n

            diff_new = x_new[:, np.newaxis, :] - x_new[np.newaxis, :, :]
            distances_new = np.linalg.norm(diff_new, axis=2)
            stress = 0.5 * np.square(distances_new[mask] - dissimilarities[mask]).sum()

            x = x_new
            if abs(prev_stress - stress) <= eps * max(prev_stress, 1.0):
                break
            prev_stress = stress

        if stress < best_stress:
            best_stress = stress
            best_coords = x.copy()

    if best_coords is None:
        return np.zeros((n, n_components), dtype=np.float64)

    centered = best_coords - best_coords.mean(axis=0, keepdims=True)
    return centered


def build_graph_payload(raw_data: Dict[str, List[Dict[str, str]]]) -> Dict[str, List[Dict[str, str]]]:
    file_name_by_id = {
        row["ID"].strip(): row.get("file_name", "").strip()
        for row in raw_data["voice_vectors"]
        if row.get("ID")
    }

    nodes = [
        _clean_node(word, file_name_by_id.get(word["id"].strip(), ""))
        for word in raw_data["words"]
        if word.get("id")
    ]

    links = [
        _clean_link(link)
        for link in raw_data["distance_matrix"]
        if link.get("i") and link.get("j")
    ]

    node_ids = {node["id"] for node in nodes}
    links = [
        link for link in links if link["source"] in node_ids and link["target"] in node_ids
    ]

    embedding_xy = _reduce_embeddings_xy(nodes, raw_data["voice_vectors"])
    if not embedding_xy:
        embedding_xy = _compute_mds_xy(nodes, links)

    for node in nodes:
        x, y = embedding_xy.get(node["id"], (0.0, 0.0))
        node["x"] = x
        node["y"] = y

    return {"nodes": nodes, "links": links}
