# Read speaker embeddings from voice_vectors.csv and calculate pairwise distances.
# Save one half-matrix (i < j) in a single file:
# i, j, distance_cosine, distance_euclidean

# save another file with the full distance matrix (i, j, distance_cosine, distance_euclidean) for d3-force visualization, 
# which requires both directions (i < j and i > j) to be present.

import csv

import numpy as np
from scipy.spatial.distance import cosine, euclidean

input_file = "data/processed/voice_vectors.csv"
output_file = "data/processed/distance_matrix.csv"
output_file_full = "data/processed/distance_matrix_full.csv"

# Read IDs and vectors from the CSV file.
voice_rows = []
with open(input_file, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        vector = np.array(list(map(float, row["vectors"].split())))
        voice_rows.append({"id": int(row["ID"]), "vector": vector})

# Sort by ID to keep output deterministic.
voice_rows.sort(key=lambda r: r["id"])

# Write only the upper-triangle pairs (i < j), which avoids duplicate distances.
with open(output_file, "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["i", "j", "distance_cosine", "distance_euclidean"])

    num_vectors = len(voice_rows)
    for i in range(num_vectors):
        for j in range(i + 1, num_vectors):
            from_id = voice_rows[i]["id"]
            to_id = voice_rows[j]["id"]
            vec_i = voice_rows[i]["vector"]
            vec_j = voice_rows[j]["vector"]
            writer.writerow([from_id, to_id, cosine(vec_i, vec_j), euclidean(vec_i, vec_j)])

# Write the full distance matrix (i, j, distance_cosine, distance_euclidean) for d3-force visualization.
with open(output_file_full, "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["i", "j", "distance_cosine", "distance_euclidean"])

    for i in range(num_vectors):
        for j in range(num_vectors):
            if i != j:
                from_id = voice_rows[i]["id"]
                to_id = voice_rows[j]["id"]
                vec_i = voice_rows[i]["vector"]
                vec_j = voice_rows[j]["vector"]
                writer.writerow([from_id, to_id, cosine(vec_i, vec_j), euclidean(vec_i, vec_j)])
