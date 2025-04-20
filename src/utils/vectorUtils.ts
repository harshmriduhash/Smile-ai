/**
 * Calculates the dot product of two vectors.
 * Throws an error if vectors have different lengths.
 */
function dotProduct(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
        throw new Error("Vectors must have the same length for dot product.");
    }
    let product = 0;
    for (let i = 0; i < vecA.length; i++) {
        product += vecA[i] * vecB[i];
    }
    return product;
}

/**
 * Calculates the magnitude (Euclidean norm) of a vector.
 */
function magnitude(vec: number[]): number {
    let sumOfSquares = 0;
    for (let i = 0; i < vec.length; i++) {
        sumOfSquares += vec[i] * vec[i];
    }
    return Math.sqrt(sumOfSquares);
}

/**
 * Calculates the cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 means identical direction, 0 orthogonal, -1 opposite).
 * Returns 0 if either vector has zero magnitude to avoid division by zero.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    const magA = magnitude(vecA);
    const magB = magnitude(vecB);

    if (magA === 0 || magB === 0) {
        return 0; // Or handle as an error case depending on requirements
    }

    const dot = dotProduct(vecA, vecB);
    return dot / (magA * magB);
} 