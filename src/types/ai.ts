export interface AIProvider {
    name: string;
    modelName: string;
    apiEndpoint: string;
}

export interface AIConfig {
    provider: AIProvider;
    maxTokens: number;
    temperature: number;
    embeddingModelName?: string;
}

export interface AIOptions {
    includeImports?: boolean;
    includeTips?: boolean;
    includeTests?: boolean;
    [key: string]: any;
} 