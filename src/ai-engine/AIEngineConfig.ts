export interface AIEngineConfig {
    provider: {
        name: string;
        modelName: string;
        apiEndpoint: string;
    };
    maxTokens: number;
    temperature: number;
    embeddingModelName?: string;
    enableRAG?: boolean; // Enable Retrieval Augmented Generation
} 