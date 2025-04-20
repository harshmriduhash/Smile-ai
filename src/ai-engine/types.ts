import * as vscode from 'vscode';

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

export interface AIRequest {
    messages: AIMessage[];
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    context?: {
        mode?: string;
        selectedText?: string;
        filePath?: string;
        prompt?: string;
        currentFile?: string;
        [key: string]: any;
    };
}

export interface AIResponse {
    message: string;
    workspaceEdit?: vscode.WorkspaceEdit;
    success?: boolean;
    error?: string;
    codeChanges?: Array<{
        uri: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        newText: string;
    }>;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
}

export interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    context?: {
        file?: string;
        selection?: string;
        codebase?: any;
    };
}

export interface AIContext {
    messages: AIMessage[];
    metadata?: Record<string, any>;
}

export interface AIResult {
    success: boolean;
    message: string;
    data?: any;
}

export interface AIError {
    code: string;
    message: string;
    details?: any;
}

export interface CodeAnalysisResult {
    suggestions: string[];
    issues: CodeIssue[];
    metrics: CodeMetrics;
}

export interface CodeIssue {
    type: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
    column?: number;
    file?: string;
}

export interface CodeMetrics {
    complexity: number;
    maintainability: number;
    testability: number;
    documentation: number;
} 