import * as vscode from 'vscode';
import { AIEngine } from '../ai-engine/AIEngine';
import { CodebaseIndex } from './CodebaseIndex';
import { IndexedFile } from './CodebaseIndexer';
import { cosineSimilarity } from '../utils/vectorUtils';

/**
 * RAGService - Retrieval Augmented Generation service for the Smile AI extension
 * 
 * This service enhances AI responses by retrieving relevant code snippets from the codebase
 * and injecting them into the context provided to the AI model.
 */
export class RAGService {
    private static instance: RAGService;
    private aiEngine: AIEngine;
    private codebaseIndex: CodebaseIndex;
    private enabled: boolean = true;
    private maxChunkSize: number = 2000; // Maximum characters per chunk
    private maxChunks: number = 5; // Maximum number of chunks to include in context
    private minSimilarity: number = 0.7; // Minimum similarity score for relevance

    private constructor(aiEngine: AIEngine, codebaseIndex: CodebaseIndex) {
        this.aiEngine = aiEngine;
        this.codebaseIndex = codebaseIndex;
    }

    public static getInstance(aiEngine: AIEngine, codebaseIndex: CodebaseIndex): RAGService {
        if (!RAGService.instance) {
            RAGService.instance = new RAGService(aiEngine, codebaseIndex);
        }
        return RAGService.instance;
    }

    /**
     * Enhance a query with relevant context from the codebase
     * @param query The user's query
     * @returns An object containing the enhanced query and relevant context
     */
    public async enhanceQueryWithContext(query: string): Promise<{ enhancedQuery: string, relevantContext: string }> {
        if (!this.enabled) {
            return { enhancedQuery: query, relevantContext: '' };
        }

        try {
            // Generate embeddings for the user's query
            const queryEmbedding = await this.aiEngine.generateEmbeddings(query);
            
            // Retrieve relevant documents from the codebase
            const relevantDocuments = this.retrieveRelevantDocuments(queryEmbedding);
            
            // Format the relevant documents as context
            const relevantContext = this.formatRelevantContext(relevantDocuments);
            
            // Combine the query with the context
            return {
                enhancedQuery: query,
                relevantContext
            };
        } catch (error) {
            console.error('Error enhancing query with context:', error);
            return { enhancedQuery: query, relevantContext: '' };
        }
    }

    /**
     * Retrieve relevant documents from the codebase based on similarity to the query
     * @param queryEmbedding The embedding of the user's query
     * @returns Array of relevant documents with similarity scores
     */
    private retrieveRelevantDocuments(queryEmbedding: number[]): Array<{ file: IndexedFile, score: number }> {
        const allDocuments = this.codebaseIndex.getAllDocuments();
        
        // Calculate similarity scores
        const scoredDocuments = allDocuments.map(doc => ({
            file: doc,
            score: cosineSimilarity(queryEmbedding, doc.embedding)
        }));
        
        // Filter by minimum similarity and sort by score (descending)
        return scoredDocuments
            .filter(item => item.score >= this.minSimilarity)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.maxChunks);
    }

    /**
     * Format relevant documents as context for the AI model
     * @param relevantDocuments Array of relevant documents with similarity scores
     * @returns Formatted context string
     */
    private formatRelevantContext(relevantDocuments: Array<{ file: IndexedFile, score: number }>): string {
        if (relevantDocuments.length === 0) {
            return '';
        }

        let context = '### Relevant code from your codebase:\n\n';
        
        for (const { file, score } of relevantDocuments) {
            const relativePath = vscode.workspace.asRelativePath(file.uri);
            const content = this.truncateContent(file.content, this.maxChunkSize);
            
            context += `File: ${relativePath} (relevance: ${(score * 100).toFixed(1)}%)\n`;
            context += '```\n';
            context += content;
            context += '\n```\n\n';
        }
        
        return context;
    }

    /**
     * Truncate content to a reasonable size while preserving code integrity
     * @param content The content to truncate
     * @param maxLength Maximum length in characters
     * @returns Truncated content
     */
    private truncateContent(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        
        // Try to truncate at reasonable boundaries like line breaks
        const lines = content.split('\n');
        let truncated = '';
        
        for (const line of lines) {
            if (truncated.length + line.length + 1 > maxLength) {
                truncated += '\n// ... content truncated ...';
                break;
            }
            truncated += line + '\n';
        }
        
        return truncated;
    }

    /**
     * Enable or disable RAG functionality
     * @param enabled Whether RAG should be enabled
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if RAG is currently enabled
     * @returns Whether RAG is enabled
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Set the maximum number of characters per context chunk
     * @param size Maximum size in characters
     */
    public setMaxChunkSize(size: number): void {
        this.maxChunkSize = size;
    }

    /**
     * Set the maximum number of chunks to include in context
     * @param count Maximum number of chunks
     */
    public setMaxChunks(count: number): void {
        this.maxChunks = count;
    }

    /**
     * Set the minimum similarity score for document relevance
     * @param score Minimum similarity score (0-1)
     */
    public setMinSimilarity(score: number): void {
        this.minSimilarity = score;
    }
} 