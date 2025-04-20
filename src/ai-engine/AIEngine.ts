import axios from 'axios';
import { AIMessage, AIRequest, AIResponse } from './types';
import { CodebaseIndex } from '../indexing/CodebaseIndex';
import { IndexedFile } from '../indexing/CodebaseIndexer';
import { FileOperationManager } from '../utils/FileOperationManager';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RAGService } from '../indexing/RAGService';

export interface AIEngineConfig {
    provider: {
        name: string;
        modelName: string;
        apiEndpoint: string;
    };
    maxTokens?: number;
    temperature?: number;
    embeddingModelName?: string;
    enableRAG?: boolean;
}

export interface ProcessMessageOptions {
    context?: any;
    attachments?: Array<{type: 'file' | 'folder', path: string}>;
    options?: {
        includeImports?: boolean;
        includeTips?: boolean;
        includeTests?: boolean;
    };
    codebaseIndex?: CodebaseIndex;
}

export interface ProcessOptions {
    options?: any;
    codebaseIndex?: any;
    contextHistory?: Array<{ role: string; content: string; timestamp: number; }>;
}

export class AIEngine {
    private config: AIEngineConfig;
    private conversationHistory: AIMessage[] = [];
    private ragService: RAGService | null = null;
    private codebaseIndex: CodebaseIndex | null = null;

    constructor(config: AIEngineConfig) {
        this.config = config;
    }

    // Initialize RAG service with a codebase index
    public initRAG(codebaseIndex: CodebaseIndex): void {
        this.codebaseIndex = codebaseIndex;
        this.ragService = RAGService.getInstance(this, codebaseIndex);
        // Set RAG enabled based on config
        if (this.ragService && this.config.enableRAG !== undefined) {
            this.ragService.setEnabled(this.config.enableRAG);
        }
        
        console.log(`Initialized RAG service with ${this.codebaseIndex ? 'codebase index' : 'no index'}`);
    }

    public async testConnection(): Promise<boolean> {
        try {
            const response = await fetch(this.config.provider.apiEndpoint + '/api/health', {
                method: 'GET'
            });
            return response.ok;
        } catch (error) {
            console.error('Model bağlantı hatası:', error);
            return false;
        }
    }

    public async processMessage(text: string, options: ProcessOptions): Promise<string> {
        try {
            // Check if we have file attachments
            const hasAttachments = options?.options?.attachments?.length > 0;
            
            // Standard message processing
            console.log('Processing message with attachments:', hasAttachments);
            const response = await this.sendRequest(text, options, 'chat');
            
            // Process any file updates found in the response, regardless of request type
            await this.processFileOperations(response);
            
            return response;
        } catch (error) {
            console.error('Error in processMessage:', error);
            return `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    public async processAgentMessage(message: string, options: ProcessOptions): Promise<string> {
        // Agent mode processing - more autonomous and can take actions
        try {
            // First get the response from the AI
            const response = await this.sendRequest(message, options, 'agent');
            
            // Process file operations, using the same generic method
            await this.processFileOperations(response);
            
            return response;
        } catch (error) {
            console.error('Error in processAgentMessage:', error);
            return `I encountered an error while trying to process your request in agent mode: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    public async processAskMessage(message: string, options: ProcessOptions): Promise<string> {
        // Ask mode processing - focused on answering questions about code
        return await this.sendRequest(message, options, 'ask');
    }

    private async sendRequest(message: string, options: ProcessOptions, mode: 'chat' | 'agent' | 'ask'): Promise<string> {
        try {
            console.log(`Sending ${mode} request to ${this.config.provider.name} at ${this.config.provider.apiEndpoint}`);
            
            // Create a copy of the message for enhancement
            let enhancedMessage = message;
            
            // Check if the message already contains file content markers
            const containsFileContent = message.includes('```') && 
                                      (message.includes('### File:') || 
                                       message.includes('# ') || 
                                       message.includes('## '));
            
            // Handle file attachments
            const hasAttachments = options?.options?.attachments?.length > 0;
            if (hasAttachments && !containsFileContent) {
                const attachmentsWithContent = options?.options?.attachments?.filter((a: any) => a.type === 'file' && a.content) || [];
                
                if (attachmentsWithContent.length > 0) {
                    console.log(`Enhancing message with ${attachmentsWithContent.length} file attachments`);
                    enhancedMessage += "\n\n";
                    
                    // Add file content
                    attachmentsWithContent.forEach((attachment: any) => {
                        const fileName = attachment.name || attachment.path.split(/[\/\\]/).pop() || 'file';
                        console.log(`Adding content for ${fileName} to message`);
                        enhancedMessage += `### File: ${fileName}\n\`\`\`\n${attachment.content}\n\`\`\`\n\n`;
                    });
                    
                    // Check if this is a translation request
                    const isTranslationRequest = this.isTranslationRequest(message);
                    
                    // For translation requests, add clear instructions
                    if (isTranslationRequest) {
                        enhancedMessage += "\nPlease translate the content of these files and return the full translated content in code blocks with the original file names. Your response will be used to update the original files.";
                    }
                    
                    console.log("Final message preparation complete");
                }
            }
            
            // Check if user is asking about the codebase
            const isCodebaseQuery = message.toLowerCase().includes('codebase') || 
                                  message.startsWith('@') || 
                                  message.includes('code base') || 
                                  message.includes('kod taban');
            
            // Prepare relevant codebase context using RAG if available
            let codebaseContext = '';
            if (isCodebaseQuery) {
                if (this.ragService && this.ragService.isEnabled()) {
                    console.log("Using RAG service to prepare context");
                    const enhancedContext = await this.ragService.enhanceQueryWithContext(message);
                    codebaseContext = enhancedContext.relevantContext;
                } else if (options.codebaseIndex) {
                    console.log("Using traditional codebase context method");
                    codebaseContext = this.prepareCodebaseContext(message, options.codebaseIndex);
                }
            }
            
            // Check if we're using Ollama and use the correct endpoint
            let endpoint = this.config.provider.apiEndpoint;
            
            if (this.config.provider.name === 'ollama') {
                endpoint = `${this.config.provider.apiEndpoint}/api/generate`;
            } else if (this.config.provider.name === 'lmstudio') {
                endpoint = `${this.config.provider.apiEndpoint}/v1/chat/completions`;
            }
            
            // Construct system prompt with codebase context if available
            let systemPrompt = this.getSystemPrompt(mode);
            if (codebaseContext) {
                systemPrompt += `\n\nHere is information about the codebase:\n${codebaseContext}`;
            }

            // Include conversation history if provided
            let contextualHistory = '';
            if (options.contextHistory && options.contextHistory.length > 0) {
                contextualHistory = "\n\nHere is some context from previous messages:\n";
                options.contextHistory.forEach(msg => {
                    contextualHistory += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
                });
                contextualHistory += "\nPlease consider the above context when responding to the current request.";
            }
            
            if (contextualHistory) {
                systemPrompt += contextualHistory;
            }
            
            // Create a clean copy of options to avoid duplication
            const cleanOptions = options.options || {};
            
            // If message is already enhanced with file content, remove attachments 
            // to prevent duplication in the request body
            if (enhancedMessage !== message) {
                console.log('Message already enhanced with attachments, clearing attachments in request body');
                if (cleanOptions.attachments) {
                    delete cleanOptions.attachments;
                }
            }
            
            // Construct the request body with options
            const requestBody = this.config.provider.name === 'ollama' ? {
                model: this.config.provider.modelName,
                prompt: `${systemPrompt}\n\nUser: ${enhancedMessage}\n\nAssistant:`,
                stream: false,
                options: cleanOptions,
            } : {
                model: this.config.provider.modelName,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: enhancedMessage
                    }
                ],
                max_tokens: this.config.maxTokens || 2048,
                temperature: this.config.temperature || 0.7,
                options: cleanOptions,
                codebaseIndex: options.codebaseIndex || null
            };

            // Log the complete request body for debugging
            console.log('Request body:', JSON.stringify(requestBody));

            // Try to make API request with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000); // Increased timeout to 3 minutes
            
            try {
                // Make the API request
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`API request failed: ${response.statusText} (${response.status})`);
                }

                const data = await response.json();
                console.log('Received response:', data); // Log the response for debugging
                
                // Process response based on provider
                let content = '';
                if (this.config.provider.name === 'ollama') {
                    content = data.response || data.message?.content || 'No response content received';
                    // Clean up any <think> tags that might be in the response
                    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                } else {
                    content = data.choices?.[0]?.message?.content || 'No response content received';
                }

                // Log the final content
                console.log('Processed content:', content);
                return content;
            } catch (fetchError: unknown) {
                console.error('Fetch error:', fetchError);
                
                // Handle specific error cases
                if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                    return `I couldn't get a response from the AI provider within the time limit. The request timed out after 3 minutes.\n\nPlease check that ${this.config.provider.name} is running correctly at ${this.config.provider.apiEndpoint} with the model "${this.config.provider.modelName}" and try again with a simpler request.`;
                }
                
                // Provide a fallback response
                return `I received your request in ${mode} mode, but I couldn't connect to the AI provider.\n\nPlease make sure ${this.config.provider.name} is running at ${this.config.provider.apiEndpoint} with the model "${this.config.provider.modelName}" available.`;
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            console.error('Error in sendRequest:', error);
            
            // Always return a helpful response instead of throwing
            return `I received your message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"\n\nHowever, there was an error processing your request. ${error instanceof Error ? error.message : 'Please try again later.'}`;
        }
    }

    private getSystemPrompt(mode: 'chat' | 'agent' | 'ask'): string {
        // Check if the input message suggests a translation request
        const isTranslationMode = mode === 'chat' && this.detectTranslationRequest();
        
        if (isTranslationMode) {
            return `You are an AI assistant specialized in translation tasks. When translating files:
                - Preserve all code functionality and structure
                - Translate only comments, strings, text content, and documentation
                - Do not change variable names, function names, or code logic
                - Return the complete translated content for each file inside a code block
                - Format each file as: \`\`\`filetype\npath/to/file.ext\ncomplete translated content\n\`\`\`
                - Do NOT include the original content alongside the translation
                - Keep the same file format and indentation as the original`;
        }
        
        switch (mode) {
            case 'agent':
                return `You are an AI coding agent that can autonomously perform tasks. You can:
                    - Analyze code and suggest improvements
                    - Create new files and implement features
                    - Debug issues and fix problems
                    - Refactor code following best practices
                    
                    IMPORTANT INSTRUCTIONS FOR FILE CREATION:
                    - When asked to create a file, ALWAYS provide the full file content inside a code block
                    - Format file creation as: \`\`\`language\npath/to/file.ext\ncode content here\n\`\`\`
                    - Do not just describe what would be in the file; ACTUALLY create it
                    - If the user says a previous file creation attempt failed, create the file again with the complete content
                    - When translating or updating files, include the full new content, not just the changes
                    - Remember to create proper directory structure in paths
                    - When a user mentions "dosya" (Turkish for "file"), treat it as a file creation request
                    
                    When responding to follow-up requests:
                    - If the user indicates you didn't complete a task correctly, apologize and immediately fix the issue
                    - Maintain context from previous messages to understand ongoing requests
                    - Be proactive and take initiative when helping the user
                    - If unsure about what exactly to create, ask clarifying questions first, then provide a complete solution`;
            
            case 'ask':
                return `You are an AI assistant focused on answering questions about code. You:
                    - Provide clear and concise explanations
                    - Use code examples when relevant
                    - Explain concepts in depth when needed
                    - Reference documentation and best practices
                    Focus on helping users understand their code better.`;
            
            default:
                return `You are an AI coding assistant that helps with programming tasks. You can:
                    - Write and modify code
                    - Answer questions
                    - Provide suggestions
                    - Help with debugging
                    Aim to be helpful while following the user's lead.`;
        }
    }

    /**
     * Detects if the current context indicates a translation request
     */
    private detectTranslationRequest(): boolean {
        // Check the most recent messages in the conversation history
        if (this.conversationHistory.length > 0) {
            const recentMessages = this.conversationHistory.slice(-3); // Check last 3 messages
            
            for (const message of recentMessages) {
                if (message.role === 'user' && this.isTranslationRequest(message.content)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    public updateConfig(newConfig: Partial<AIEngineConfig>) {
        this.config = { ...this.config, ...newConfig };
        
        // Update RAG service settings if enableRAG has changed
        if (this.ragService && newConfig.enableRAG !== undefined) {
            this.ragService.setEnabled(newConfig.enableRAG);
        }
    }

    public getConfig(): AIEngineConfig {
        return this.config;
    }

    public clearContext(): void {
        this.conversationHistory = [];
    }

    public getContext(): AIMessage[] {
        return this.conversationHistory;
    }

    public async generateResponse(request: AIRequest): Promise<AIResponse> {
        try {
            const messages = request.messages;
            const response = await this.callAIProvider(messages);
            this.updateContext(request, response);
            return response;
        } catch (error) {
            console.error('Error generating response:', error);
            throw new Error('Failed to generate response');
        }
    }

    private async callAIProvider(messages: AIMessage[]): Promise<AIResponse> {
        const { provider, maxTokens, temperature } = this.config;

        try {
            let endpoint = '';
            let requestBody = {};

            if (provider.name === 'ollama') {
                endpoint = `${provider.apiEndpoint}/api/chat`;
                requestBody = {
                    model: provider.modelName,
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    stream: false
                };
            } else if (provider.name === 'lmstudio') {
                endpoint = `${provider.apiEndpoint}/v1/chat/completions`;
                requestBody = {
                    model: provider.modelName,
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    max_tokens: maxTokens,
                    temperature: temperature,
                    stream: false
                };
            } else {
                throw new Error(`Unsupported provider: ${provider.name}`);
            }

            const response = await axios.post(endpoint, requestBody, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (provider.name === 'ollama') {
                return {
                    message: response.data.message.content
                };
            } else if (provider.name === 'lmstudio') {
                return {
                    message: response.data.choices[0].message.content
                };
            } else {
                throw new Error(`Unsupported provider: ${provider.name}`);
            }
        } catch (error: any) {
            console.error('Error calling AI provider:', error);
            const providerName = this.config.provider.name;
            const endpoint = this.config.provider.apiEndpoint;
            const modelName = this.config.provider.modelName;
            let userMessage = `Failed to get response from ${providerName}.`;

            if (error.response) {
                const status = error.response.status;
                const dataError = error.response.data?.error;
                userMessage = `Error from ${providerName} (Status ${status}): ${dataError || error.response.statusText}.`;
                if (status === 404 && dataError?.includes('model')) {
                     userMessage += `\nPlease ensure model '${modelName}' is available at ${endpoint}.`;
                } else if (status === 500) {
                    userMessage += `\nThere might be an issue with the ${providerName} server itself.`;
                } else {
                    userMessage += `\nPlease check your configuration for ${providerName}.`;
                }
            } else if (error.request) {
                userMessage = `Could not connect to ${providerName} at ${endpoint}.`;
                userMessage += `\nPlease ensure the ${providerName} service is running and the API endpoint in settings is correct.`;
            } else {
                userMessage = `Failed to communicate with ${providerName}: ${error.message}.`;
                userMessage += `\nThis might be a configuration issue or an unexpected error.`;
            }
            throw new Error(userMessage);
        }
    }

    private updateContext(request: AIRequest, response: AIResponse): void {
        this.conversationHistory.push(...request.messages);

        this.conversationHistory.push({
            role: 'assistant',
            content: response.message,
            timestamp: Date.now()
        });

        const maxContextMessages = 10;
        if (this.conversationHistory.length > maxContextMessages) {
            this.conversationHistory = this.conversationHistory.slice(-maxContextMessages);
        }
    }

    public async generateEmbeddings(text: string): Promise<number[]> {
        console.log("Generating embeddings for text", text.length > 50 ? text.substring(0, 50) + "..." : text);
        try {
            // For now, generate a simple dummy embedding
            // In a real application, you would use a proper embedding model
            // This is just to enable the codebase indexing to function without requiring external embeddings models
            
            console.log("Using dummy embeddings for testing purposes");
            
            // Create a random embedding vector of length 1536 (typical for many embedding models)
            const embeddingLength = 1536;
            const embedding = new Array(embeddingLength).fill(0).map(() => Math.random() * 2 - 1);
            
            // Normalize the embedding to unit length to mimic real embeddings
            const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            const normalizedEmbedding = embedding.map(val => val / magnitude);
            
            return normalizedEmbedding;
        } catch (error) {
            console.error("Error generating embeddings:", error);
            // Return a default embedding in case of error
            return new Array(1536).fill(0);
        }
    }

    public async generateEmbedding(text: string): Promise<number[]> {
        const { provider } = this.config;
        if (!provider.name || !provider.apiEndpoint) {
            throw new Error('AI provider configuration is incomplete');
        }

        try {
            const response = await axios.post(`${provider.apiEndpoint}/embeddings`, {
                model: this.config.embeddingModelName || provider.modelName,
                input: text
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.data.data[0].embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw new Error('Failed to generate embedding');
        }
    }

    private prepareCodebaseContext(_query: string, codebaseIndex: CodebaseIndex): string {
        if (!codebaseIndex) {
            return '';
        }
        
        try {
            // Extract project name functionality planned but not implemented yet
            
            // Get relevant files for the query
            const files = codebaseIndex.getAllDocuments();
            if (!files || files.length === 0) {
                return "Codebase is indexed but no files were found.";
            }
            
            // Prepare an overview of the codebase structure
            let result = `Found ${files.length} files in the codebase.\n\n`;
            
            // Group files by directory for better structure understanding
            const filesByDir = new Map<string, string[]>();
            files.forEach((file: IndexedFile) => {
                const filePath = file.path;
                const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1) || '/';
                if (!filesByDir.has(dir)) {
                    filesByDir.set(dir, []);
                }
                filesByDir.get(dir)?.push(filePath);
            });
            
            // Add directory structure to the context
            result += "Directory structure:\n";
            filesByDir.forEach((files, dir) => {
                result += `- ${dir}: ${files.length} files\n`;
            });
            
            // Add high-level description of key files
            result += "\nKey files:\n";
            
            // Find interesting files (like README, index, etc.)
            const keyFiles = files.filter((file: IndexedFile) => 
                file.path.toLowerCase().includes('readme') || 
                file.path.toLowerCase().includes('index') ||
                file.path.toLowerCase().includes('overview') ||
                file.path.toLowerCase().includes('config') ||
                file.path.toLowerCase().includes('main')
            );
            
            // Add snippets from key files
            keyFiles.forEach((file: IndexedFile) => {
                const preview = file.content.substring(0, 300) + (file.content.length > 300 ? '...' : '');
                result += `\n## ${file.path}\n${preview}\n`;
            });
            
            // Add list of all file types in the codebase
            const fileExtensions = new Set<string>();
            files.forEach((file: IndexedFile) => {
                const ext = file.path.split('.').pop() || '';
                if (ext) fileExtensions.add(ext);
            });
            
            result += `\nFile types: ${Array.from(fileExtensions).join(', ')}`;
            
            return result;
        } catch (error) {
            console.error("Error preparing codebase context:", error);
            return "Error accessing codebase information.";
        }
    }

    /**
     * Generic method to process file operations in AI responses
     * Handles all types of file updates (translations, edits, code changes, etc.)
     */
    private async processFileOperations(response: string): Promise<void> {
        try {
            console.log('Processing file operations in response');
            
            // Check for file content in the response
            await this.extractAndProcessFileContent(response);
            
            // Legacy functionality can go here if needed
            // You can add more specific processing here if required
        } catch (error) {
            console.error('Error processing file operations:', error);
        }
    }

    /**
     * Extracts and processes file content from AI responses
     * Handles various code block formats and file patterns
     */
    private async extractAndProcessFileContent(response: string): Promise<void> {
        try {
            console.log('Extracting file content from response');
            console.log('Response preview:', response.substring(0, 200) + '...');
            
            const fileOperationManager = FileOperationManager.getInstance();
            
            // Regular expressions to find file blocks in various formats
            const fileBlockRegexes = [
                // Default format: ```[language] file/path.ext content ```
                /```(?:file|[\w-]+)?\s*(?:title=)?[`'"]?([\w\-\./\\]+\.\w+)[`'"]?\s*\n([\s\S]*?)```/g,
                
                // Markdown format with "### File:" and triple backticks
                /### File: ([\w\-\./\\]+\.\w+)\s*```(?:[\w-]+)?\s*\n([\s\S]*?)```/g,
                
                // Markdown format with filename in block
                /```(?:markdown|md)?\s*\n### File: ([\w\-\./\\]+\.\w+)\s*\n\n([\s\S]*?)```/g,
                
                // Ollama format with markdown header inside the code block
                /```markdown\n### File: ([\w\-\./\\]+\.\w+)\s*\n([\s\S]*?)```/g,
                
                // Ollama gemma format
                /```markdown\n### File: ([\w\-\./\\]+\.\w+)\n\n([\s\S]*?)```/g,
                
                // Generic file pattern - captures various formats
                /File: ([\w\-\./\\]+\.\w+)[\s\n]+([\s\S]*?)(?=```|$)/g
            ];
            
            let filesFound = false;
            let regexIndex = 0;
            
            for (const regex of fileBlockRegexes) {
                console.log(`Trying regex pattern ${regexIndex+1}`);
                let match;
                
                while ((match = regex.exec(response)) !== null) {
                    filesFound = true;
                    const filePath = match[1].trim();
                    const fileContent = match[2];
                    
                    console.log(`Match found with regex ${regexIndex+1}:`);
                    console.log(`- File path: ${filePath}`);
                    console.log(`- Content length: ${fileContent?.length || 0} characters`);
                    
                    if (!filePath || !fileContent) {
                        console.log('Skipping due to missing path or content');
                        continue;
                    }
                    
                    console.log(`Found file content for: ${filePath}`);
                    
                    // Get the absolute path
                    let absolutePath = filePath;
                    if (!path.isAbsolute(filePath)) {
                        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                            absolutePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, filePath);
                            console.log(`Resolved absolute path: ${absolutePath}`);
                        } else {
                            console.warn('No workspace folder found, using relative path');
                        }
                    }
                    
                    // Check if file exists
                    const fileExists = fs.existsSync(absolutePath);
                    console.log(`File exists: ${fileExists}`);
                    
                    if (fileExists) {
                        // Update existing file
                        const originalContent = fs.readFileSync(absolutePath, 'utf8');
                        
                        // Only create operation if content changed
                        if (originalContent !== fileContent) {
                            const description = `Update file ${path.basename(filePath)} with AI-generated content`;
                            const operation = await fileOperationManager.createUpdateOperation(absolutePath, originalContent, fileContent, description);
                            await fileOperationManager.acceptOperation(operation.id);
                            
                            console.log(`File ${filePath} updated with new content`);
                        } else {
                            console.log(`File content unchanged, no update needed for ${filePath}`);
                        }
                    } else {
                        // Create new file
                        const description = `Create new file ${path.basename(filePath)} with AI-generated content`;
                        const operation = await fileOperationManager.createAddOperation(absolutePath, fileContent, description);
                        await fileOperationManager.acceptOperation(operation.id);
                        
                        // Create directories if they don't exist
                        const dirPath = path.dirname(absolutePath);
                        if (!fs.existsSync(dirPath)) {
                            fs.mkdirSync(dirPath, { recursive: true });
                        }
                        
                        console.log(`New file ${filePath} created with content`);
                    }
                }
                
                regexIndex++;
            }
            
            if (!filesFound) {
                console.log('No file content blocks found in the AI response');
            }
        } catch (error) {
            console.error('Error extracting file content:', error);
        }
    }

    /**
     * Checks if the given message is a translation request
     */
    private isTranslationRequest(message: string): boolean {
        // Normalize the message for consistent matching
        const normalizedMessage = message.toLowerCase();
        
        // Define patterns that suggest translation requests
        const translationPatterns = [
            'translate', 'translation', 'çevir', 'çeviri', 'türkçe', 
            'übersetz', 'traducir', 'tradui', 'tradução', 'traduzione',
            'convert to', 'tercüme et', 'in another language', 'localiz',
            'güncelleyelim'
        ];
        
        // Check if the message contains any of the translation patterns
        const isTranslation = translationPatterns.some(pattern => normalizedMessage.includes(pattern));
        
        console.log(`Checking if message is a translation request: ${isTranslation}`, 
                   isTranslation ? `Matched pattern in: ${normalizedMessage.substring(0, 50)}...` : '');
        
        return isTranslation;
    }
} 