import * as vscode from 'vscode';
import { AIEngine } from '../ai-engine/AIEngine';
import { ModelManager } from '../utils/ModelManager';
import { CodebaseIndexer } from '../indexing/CodebaseIndexer';
import { FileAnalyzer } from '../utils/FileAnalyzer';
import { Message } from '../types/chat';
import { FileOperationManager } from '../utils/FileOperationManager';
import * as path from 'path';
import { WebviewManager } from '../webviewManager';
import { AIMessage } from '../ai-engine/types';

export class AIAssistantPanel {
    public static currentPanel: AIAssistantPanel | undefined;
    private readonly webviewView: vscode.WebviewView;
    private readonly context: vscode.ExtensionContext;
    private readonly disposables: vscode.Disposable[] = [];
    private aiEngine: AIEngine;
    private messages: Message[] = [];
    private modelManager: ModelManager;
    private codebaseIndexer: CodebaseIndexer;
    private fileAnalyzer: FileAnalyzer;
    private isIndexing: boolean = false;
    private isAIEngineReady: boolean = false;

    constructor(
        webviewView: vscode.WebviewView,
        context: vscode.ExtensionContext,
        aiEngine: AIEngine,
        modelManager: ModelManager,
        codebaseIndexer: CodebaseIndexer
    ) {
        console.log('Initializing AIAssistantPanel');
        this.webviewView = webviewView;
        this.context = context;
        this.aiEngine = aiEngine;
        this.modelManager = modelManager;
        this.codebaseIndexer = codebaseIndexer;
        this.fileAnalyzer = FileAnalyzer.getInstance();
        
        // Set up FileOperationManager
        const fileOperationManager = FileOperationManager.getInstance();
        fileOperationManager.setWebviewView(webviewView);
        
        // Register custom commands
        this.registerCommands();
        
        // Initialize components independently
        this.initializeAIEngine()
            .catch((error: Error) => this.handleError('AI Engine initialization failed', error));
        
        // Setup webview asynchronously
        this.setupWebview()
            .catch((error: Error) => this.handleError('Webview setup failed', error));
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start indexing in the background
        this.indexCodebase()
            .catch((error: Error) => this.handleError('Codebase indexing failed', error));
    }

    private async initializeAIEngine(): Promise<void> {
        try {
            const activeModel = this.modelManager.getActiveModel();
            console.log('Active model:', activeModel);
            
            if (activeModel) {
                this.aiEngine = new AIEngine({
                    provider: {
                        name: activeModel.provider,
                        modelName: activeModel.modelName,
                        apiEndpoint: activeModel.apiEndpoint
                    },
                    maxTokens: activeModel.maxTokens || 2048,
                    temperature: activeModel.temperature || 0.7
                });
                this.isAIEngineReady = true;
            } else {
                // Prompt for model configuration without blocking
                this.showModelConfigurationRequired();
                await this.modelManager.promptAddModel();
                const model = this.modelManager.getActiveModel();
                if (model) {
                    this.aiEngine = new AIEngine({
                        provider: {
                            name: model.provider,
                            modelName: model.modelName,
                            apiEndpoint: model.apiEndpoint
                        },
                        maxTokens: model.maxTokens || 2048,
                        temperature: model.temperature || 0.7
                    });
                    this.isAIEngineReady = true;
                }
            }
        } catch (error) {
            this.isAIEngineReady = false;
            throw error;
        }
    }

    private setupEventListeners(): void {
        // Workspace event listeners
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(
                this.handleDocumentChange.bind(this)
            ),
            vscode.window.onDidChangeActiveTextEditor(
                this.handleEditorChange.bind(this)
            )
        );
    }

    private showModelConfigurationRequired(): void {
        const message = "AI model configuration required";
        const configureButton = "Configure";
        
        vscode.window.showWarningMessage(message, configureButton)
            .then(selection => {
                if (selection === configureButton) {
                    this.modelManager.promptAddModel()
                        .catch(error => this.handleError('Model configuration failed', error));
                }
            });
    }

    private handleError(context: string, error: any): void {
        console.error(`${context}:`, error);
        
        // Send error to webview if available
        if (this.webviewView?.webview) {
            this.webviewView.webview.postMessage({
                command: 'showError',
                error: {
                    message: `${context}: ${error.message || 'Unknown error'}`,
                    details: error.stack
                }
            });
        }
        
        // Show error in VS Code UI
        vscode.window.showErrorMessage(`${context}: ${error.message || 'Unknown error'}`);
    }

    private async handleGetWorkspaceFiles(): Promise<void> {
        try {
            // Find all files in the workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                // No workspace folders, return empty array
                this.webviewView.webview.postMessage({
                    command: 'workspaceFilesUpdated',
                    files: []
                });
                return;
            }
            
            const files: Array<{name: string, path: string, isDirectory: boolean, parent?: string, level?: number}> = [];
            
            // Get all workspace folders
            for (const folder of workspaceFolders) {
                // Add the workspace folder itself
                files.push({
                    name: folder.name,
                    path: folder.uri.fsPath,
                    isDirectory: true,
                    level: 0
                });
                
                // Find all files in the workspace folder recursively
                const pattern = new vscode.RelativePattern(folder, '**/*');
                const fileUris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
                
                // Process files and organize hierarchically
                for (const uri of fileUris) {
                    try {
                        const stat = await vscode.workspace.fs.stat(uri);
                        const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;
                        const filePath = uri.fsPath;
                        const relativePath = path.relative(folder.uri.fsPath, filePath);
                        const segments = relativePath.split(/[\/\\]/);
                        const fileName = segments.pop() || '';
                        const parent = segments.length > 0 ? segments.join('/') : folder.name;
                        const level = segments.length + 1; // +1 because we're 1 level below the workspace folder
                        
                        files.push({
                            name: fileName,
                            path: filePath,
                            isDirectory,
                            parent,
                            level
                        });
                    } catch (err) {
                        console.warn('Error getting file stats:', err);
                    }
                }
            }
            
            // Sort files - directories first, then by level
            files.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                if (a.level !== b.level) {
                    return (a.level || 0) - (b.level || 0);
                }
                return a.name.localeCompare(b.name);
            });
            
            // Send files to webview
            this.webviewView.webview.postMessage({
                command: 'workspaceFilesUpdated',
                files
            });
        } catch (error) {
            console.error('Error getting workspace files:', error);
        }
    }

    private async handleUserMessage(text: string, options: any): Promise<void> {
        if (!this.isAIEngineReady) {
            this.showModelConfigurationRequired();
            return;
        }

        try {
            console.log("Handling user message with options:", JSON.stringify({
                hasAttachments: options && options.attachments ? options.attachments.length : 0,
                originalText: options.originalText || text
            }));
            
            // Check if the message already contains file content
            const containsFileContent = text.includes('```') && 
                                       (text.includes('### File:') || 
                                        text.includes('# ') || 
                                        text.includes('## '));
            
            // Process attachments if they exist and the message doesn't already have file content
            if (!containsFileContent && options && options.attachments && Array.isArray(options.attachments) && options.attachments.length > 0) {
                console.log(`Processing ${options.attachments.length} attachments`);
                
                for (const attachment of options.attachments) {
                    // Add to codebase indexer based on attachment type
                    if (attachment.type === 'file') {
                        console.log(`Adding file to context: ${attachment.path}`);
                        await this.codebaseIndexer.attachFile(attachment.path);
                        
                        // Load content if not already present
                        if (!attachment.content) {
                            try {
                                console.log(`Loading content for attached file: ${attachment.path}`);
                                const uri = vscode.Uri.file(attachment.path);
                                const fileData = await vscode.workspace.fs.readFile(uri);
                                attachment.content = new TextDecoder().decode(fileData);
                                console.log(`Successfully loaded content for ${attachment.path}, length: ${attachment.content.length} characters`);
                            } catch (err) {
                                console.error(`Error reading attached file ${attachment.path}:`, err);
                            }
                        }
                    } else if (attachment.type === 'folder') {
                        console.log(`Adding folder to context: ${attachment.path}`);
                        await this.codebaseIndexer.attachFolder(attachment.path);
                    }
                }
            } else if (containsFileContent && options && options.attachments) {
                // If message already contains file content, clear the attachments to avoid duplication
                console.log('Message already contains file content, clearing attachments to avoid duplication');
                options.attachments = [];
            }

            // Add message to UI immediately
            const userMessage: Message = {
                role: 'user',
                content: text,
                timestamp: Date.now()
            };
            this.messages.push(userMessage);
            this.webviewView.webview.postMessage({
                command: 'addMessage',
                message: userMessage
            });

            // Show loading state
            this.webviewView.webview.postMessage({
                command: 'showLoading'
            });

            // Avoid duplication in the options object
            const cleanOptions = { ...options };
            
            // Don't send duplicated text content
            if (cleanOptions.originalText === text) {
                delete cleanOptions.originalText;
            }

            // Process with AI and get response
            const response = await this.aiEngine.processMessage(text, { 
                options: cleanOptions,
                codebaseIndex: this.codebaseIndexer.getIndex()
            });
            
            // Add assistant response
            const assistantMessage: Message = {
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            };
            this.messages.push(assistantMessage);

            // Hide loading and show response
            this.webviewView.webview.postMessage({
                command: 'hideLoading'
            });
            
            this.webviewView.webview.postMessage({
                command: 'addMessage',
                message: assistantMessage
            });
        } catch (error: any) {
            // Hide loading state
            this.webviewView.webview.postMessage({
                command: 'hideLoading'
            });
            
            // Show error message in chat
            const errorMessage: Message = {
                role: 'system',
                content: `Error: ${error?.message || 'Unknown error occurred'}`,
                timestamp: Date.now()
            };
            this.messages.push(errorMessage);
            this.webviewView.webview.postMessage({
                command: 'addMessage',
                message: errorMessage
            });
            
            this.handleError('Error processing message', error);
        }
    }

    private async indexCodebase() {
        console.log('Starting codebase indexing from AIAssistantPanel');
        if (this.isIndexing) {
            console.log('Indexing already in progress');
            return;
        }
        
        this.isIndexing = true;
        try {
            // First make sure the AI engine is ready
            if (!this.isAIEngineReady) {
                console.log('AI Engine not ready, initializing before indexing');
                await this.initializeAIEngine();
            }
            
            // Then start indexing
            await this.codebaseIndexer.indexWorkspace((message) => {
                console.log('Indexing progress:', message);
            });
            
            console.log('Codebase indexing complete');
            this.webviewView.webview.postMessage({
                type: 'indexingComplete'
            });
        } catch (error) {
            console.error('Codebase indexing error:', error);
            throw error;
        } finally {
            this.isIndexing = false;
        }
    }

    private async handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
        if (event.document === vscode.window.activeTextEditor?.document) {
            const fileContext = await this.fileAnalyzer.analyzeFile(event.document.uri);
            this.webviewView.webview.postMessage({
                type: 'contextUpdate',
                context: {
                    file: event.document.fileName,
                    fileContext
                }
            });
        }
    }

    private async handleEditorChange(editor: vscode.TextEditor | undefined) {
        if (editor) {
            const fileContext = await this.fileAnalyzer.analyzeFile(editor.document.uri);
            this.webviewView.webview.postMessage({
                type: 'contextUpdate',
                context: {
                    file: editor.document.fileName,
                    fileContext
                }
            });
        }
    }

    private async handleAddModel() {
        await this.modelManager.promptAddModel();
        this.updateModels();
    }

    private async handleAttachFile() {
        try {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                openLabel: 'Attach File'
            });

            if (result && result.length > 0) {
                const filePath = result[0].fsPath;
                console.log(`File selected: ${filePath}`);
                
                try {
                    const fileUri = vscode.Uri.file(filePath);
                    const fileData = await vscode.workspace.fs.readFile(fileUri);
                    const fileContent = new TextDecoder().decode(fileData);
                    console.log(`File content length: ${fileContent.length}`);
                    
                    // Use WebviewManager to send file attached message with content
                    WebviewManager.getInstance().sendFileAttached('smile-ai.assistant', filePath, fileContent);
                    
                    // Also add it to the codebase indexer for context
                    await this.codebaseIndexer.attachFile(filePath);
                    
                } catch (error) {
                    console.error(`Error reading file: ${error}`);
                    // Even if we can't read the file, still send the path
                    WebviewManager.getInstance().sendFileAttached('smile-ai.assistant', filePath);
                }
            }
        } catch (error) {
            console.error('Error attaching file:', error);
            vscode.window.showErrorMessage(`Failed to attach file: ${error}`);
        }
    }

    private async handleAttachFolder() {
        try {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Attach Folder'
            });

            if (result && result.length > 0) {
                const folderPath = result[0].fsPath;
                console.log(`Folder selected: ${folderPath}`);
                
                // Use WebviewManager to send folder attached message
                WebviewManager.getInstance().sendFolderAttached('smile-ai.assistant', folderPath);
                
                // Also add it to the codebase indexer for context
                await this.codebaseIndexer.attachFolder(folderPath);
            }
        } catch (error) {
            console.error('Error attaching folder:', error);
            vscode.window.showErrorMessage(`Failed to attach folder: ${error}`);
        }
    }

    private async updateModels() {
        const models = await this.modelManager.getModels();
        this.webviewView.webview.postMessage({
            command: 'updateModels',
            models
        });
    }

    private async setupWebview(): Promise<void> {
        const webview = this.webviewView.webview;

        // Set options
        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                vscode.Uri.joinPath(this.context.extensionUri, 'dist')
            ]
        };

        // Get URIs
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
        const mainUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));

        try {
            console.log('Setting up webview in AIAssistantPanel');
            
            // Create a welcome message
            const welcomeMessage: Message = {
                role: 'system',
                content: 'Welcome to Smile AI! Ask me anything about your code or suggest improvements.',
                timestamp: Date.now()
            };
            
            // Add to our internal messages list
            this.messages.push(welcomeMessage);
            
            // Set HTML content with updated CSP and service worker handling
            webview.html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'self' ${webview.cspSource}; script-src 'self' 'unsafe-inline' ${webview.cspSource}; style-src 'self' 'unsafe-inline' ${webview.cspSource} https:; img-src 'self' ${webview.cspSource} https: data:; connect-src 'self' https: http: ws:; font-src https:;">
                <title>Smile AI Assistant</title>
                <link rel="stylesheet" href="${cssUri}">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@vscode/codicons/dist/codicon.css">
                <script src="${mainUri}" defer></script>
            </head>
            <body>
                <div class="container">
                    <div class="chat-container">
                        <div class="messages" id="messages">
                            <!-- Messages will be inserted here -->
                        </div>
                        <div class="input-container">
                            <div class="attachment-toolbar">
                                <button id="attachFileButton" class="attachment-button" title="Attach File">
                                    <i class="codicon codicon-file"></i>
                                    <span>Attach File</span>
                                </button>
                                <button id="attachFolderButton" class="attachment-button" title="Attach Folder">
                                    <i class="codicon codicon-folder"></i>
                                    <span>Attach Folder</span>
                                </button>
                            </div>
                            <div id="attachments-container" class="current-attachments"></div>
                            <div class="input-row">
                                <div class="input-wrapper">
                                    <textarea
                                        class="input-box"
                                        id="message-input"
                                        placeholder="Ask any question about your code... (@ to mention files)"
                                        rows="1"
                                    ></textarea>
                                    <div id="suggestions-container" class="suggestions-container"></div>
                                </div>
                                <button class="send-button" id="send-button">
                                    <i class="codicon codicon-send"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>`;
            
            // Wait a bit for the webview to initialize before sending messages
            setTimeout(() => {
                console.log('Sending welcome message to webview');
                webview.postMessage({ 
                    command: 'addMessage', 
                    message: welcomeMessage
                });
            }, 500);
        } catch (error) {
            console.error('Error setting up webview:', error);
        }

        // Handle messages from webview
        webview.onDidReceiveMessage(
            async (message) => {
                console.log('Received message from webview:', message);
                switch (message.command) {
                    case 'sendMessage':
                        // Kullanıcı arabirimi için orijinal mesajı göster, ancak AI'a zenginleştirilmiş metni gönder
                        const originalText = message.originalText || message.text;
                        await this.handleUserMessage(message.text, { ...message.options || {}, originalText });
                        break;
                    case 'addModel':
                        await this.handleAddModel();
                        break;
                    case 'attachFile':
                        await this.handleAttachFile();
                        break;
                    case 'attachFolder':
                        await this.handleAttachFolder();
                        break;
                    case 'getFileContent':
                        await this.handleGetFileContent(message.path);
                        break;
                    case 'getWorkspaceFiles':
                        await this.handleGetWorkspaceFiles();
                        break;
                    case 'acceptOperation':
                        await this.handleAcceptOperation(message.id);
                        break;
                    case 'rejectOperation':
                        await this.handleRejectOperation(message.id);
                        break;
                    case 'acceptAllOperations':
                        await this.handleAcceptAllOperations();
                        break;
                    case 'rejectAllOperations':
                        await this.handleRejectAllOperations();
                        break;
                    case 'getOperationDiff':
                        await this.handleGetOperationDiff(message.id);
                        break;
                    case 'acceptPartialChange':
                        await this.handleAcceptPartialChange(message.id, message.lineIndices);
                        break;
                }
            },
            undefined,
            this.disposables
        );
    }

    private async handleAcceptOperation(id: string): Promise<void> {
        try {
            const fileOperationManager = FileOperationManager.getInstance();
            const success = await fileOperationManager.acceptOperation(id);
            
            if (success) {
                vscode.window.showInformationMessage('File operation applied successfully.');
            } else {
                vscode.window.showErrorMessage('Failed to apply file operation.');
            }
        } catch (error) {
            console.error('Error accepting operation:', error);
            vscode.window.showErrorMessage(`Error applying operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleRejectOperation(id: string): Promise<void> {
        try {
            const fileOperationManager = FileOperationManager.getInstance();
            const success = await fileOperationManager.rejectOperation(id);
            
            if (success) {
                vscode.window.showInformationMessage('File operation rejected.');
            } else {
                vscode.window.showErrorMessage('Failed to reject file operation.');
            }
        } catch (error) {
            console.error('Error rejecting operation:', error);
            vscode.window.showErrorMessage(`Error rejecting operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleAcceptAllOperations(): Promise<void> {
        try {
            const fileOperationManager = FileOperationManager.getInstance();
            const success = await fileOperationManager.acceptAllOperations();
            
            if (success) {
                vscode.window.showInformationMessage('All file operations applied successfully.');
            } else {
                vscode.window.showErrorMessage('Failed to apply all file operations.');
            }
        } catch (error) {
            console.error('Error accepting all operations:', error);
            vscode.window.showErrorMessage(`Error applying all operations: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleRejectAllOperations(): Promise<void> {
        try {
            const fileOperationManager = FileOperationManager.getInstance();
            const success = await fileOperationManager.rejectAllOperations();
            
            if (success) {
                vscode.window.showInformationMessage('All file operations rejected.');
            } else {
                vscode.window.showErrorMessage('Failed to reject all file operations.');
            }
        } catch (error) {
            console.error('Error rejecting all operations:', error);
            vscode.window.showErrorMessage(`Error rejecting all operations: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleGetOperationDiff(id: string): Promise<void> {
        try {
            const fileOperationManager = FileOperationManager.getInstance();
            const diff = fileOperationManager.getDiff(id);
            
            this.webviewView.webview.postMessage({
                command: 'operationDiff',
                id,
                diff
            });
        } catch (error) {
            console.error('Error getting operation diff:', error);
        }
    }

    private async handleAcceptPartialChange(id: string, lineIndices: number[]): Promise<void> {
        try {
            const fileOperationManager = FileOperationManager.getInstance();
            if (typeof fileOperationManager.acceptPartialChange === 'function') {
                const success = await fileOperationManager.acceptPartialChange(id, lineIndices);
                
                if (success) {
                    vscode.window.showInformationMessage('Partial changes applied successfully.');
                } else {
                    vscode.window.showErrorMessage('Failed to apply partial changes.');
                }
            } else {
                vscode.window.showErrorMessage('Partial change functionality not available.');
            }
        } catch (error) {
            console.error('Error accepting partial change:', error);
            vscode.window.showErrorMessage(`Error applying partial changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleGetFileContent(filePath: string): Promise<void> {
        try {
            if (!filePath) {
                console.error('Invalid file path provided');
                return;
            }
            
            console.log(`Getting content for file: ${filePath}`);
            let fileContent = '';
            
            // Read file content
            try {
                const uri = vscode.Uri.file(filePath);
                const fileData = await vscode.workspace.fs.readFile(uri);
                fileContent = new TextDecoder().decode(fileData);
                console.log(`Successfully read file content, length: ${fileContent.length} characters`);
            } catch (err) {
                console.error(`Error reading file ${filePath}:`, err);
                this.webviewView.webview.postMessage({
                    command: 'showError',
                    error: {
                        message: `Could not read file ${path.basename(filePath)}: ${err instanceof Error ? err.message : 'Unknown error'}`,
                    }
                });
                return;
            }
            
            // Send file content back to webview
            this.webviewView.webview.postMessage({
                command: 'fileContentLoaded',
                path: filePath,
                content: fileContent
            });
            
            // Also add it to the codebase indexer for context
            if (fileContent) {
                await this.codebaseIndexer.attachFile(filePath);
            }
            
        } catch (error) {
            console.error('Error getting file content:', error);
            this.webviewView.webview.postMessage({
                command: 'showError',
                error: {
                    message: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                }
            });
        }
    }

    public dispose() {
        // Unregister the webview from WebviewManager
        WebviewManager.getInstance().unregisterWebview('assistant');
        
        AIAssistantPanel.currentPanel = undefined;

        this.disposables.forEach(d => d.dispose());
    }

    public sendMessageToWebview(message: any): void {
        WebviewManager.getInstance().sendMessage('assistant', message);
    }

    public addMessage(message: AIMessage): void {
        this.messages.push(message);
        WebviewManager.getInstance().sendMessage('assistant', { command: 'addMessage', message });
    }

    public showLoading(): void {
        WebviewManager.getInstance().sendMessage('assistant', { command: 'showLoading' });
    }

    public hideLoading(): void {
        WebviewManager.getInstance().sendMessage('assistant', { command: 'hideLoading' });
    }

    public updateWorkspaceFiles(files: any[]): void {
        WebviewManager.getInstance().sendMessage('assistant', { command: 'updateWorkspaceFiles', files });
    }

    public updateContext(context: any): void {
        WebviewManager.getInstance().sendMessage('assistant', { command: 'updateContext', context });
    }

    public notifyIndexingComplete(): void {
        WebviewManager.getInstance().sendMessage('assistant', { command: 'indexingComplete' });
    }

    private registerCommands(): void {
        // Register commands for attaching files and folders
        this.context.subscriptions.push(
            vscode.commands.registerCommand('smile-ai.assistant.attachFile', () => {
                this.handleAttachFile();
            }),
            vscode.commands.registerCommand('smile-ai.assistant.attachFolder', () => {
                this.handleAttachFolder();
            })
        );
    }
} 