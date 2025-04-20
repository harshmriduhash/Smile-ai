import * as vscode from 'vscode';

/**
 * A utility class to manage sending messages to the webview
 */
export class WebviewManager {
    private static instance: WebviewManager;
    private registeredWebviews: Map<string, vscode.Webview> = new Map();

    private constructor() {}

    /**
     * Get the singleton instance
     */
    public static getInstance(): WebviewManager {
        if (!WebviewManager.instance) {
            WebviewManager.instance = new WebviewManager();
        }
        return WebviewManager.instance;
    }

    /**
     * Register a webview with an identifier
     */
    public registerWebview(id: string, webview: vscode.Webview): void {
        this.registeredWebviews.set(id, webview);
    }

    /**
     * Unregister a webview
     */
    public unregisterWebview(id: string): void {
        this.registeredWebviews.delete(id);
    }

    /**
     * Send a message to a specific webview
     */
    public sendMessage(webviewId: string, message: any): void {
        const webview = this.registeredWebviews.get(webviewId);
        if (webview) {
            webview.postMessage(message);
        } else {
            console.error(`Webview with ID ${webviewId} not found`);
        }
    }

    /**
     * Send a file attached message to the webview
     */
    public sendFileAttached(webviewId: string, filePath: string, fileContent?: string): void {
        this.sendMessage(webviewId, {
            command: 'fileAttached',
            path: filePath,
            content: fileContent
        });
    }

    /**
     * Send a folder attached message to the webview
     */
    public sendFolderAttached(webviewId: string, folderPath: string): void {
        this.sendMessage(webviewId, {
            command: 'folderAttached',
            path: folderPath
        });
    }

    /**
     * Update the list of workspace files in the webview
     */
    public updateWorkspaceFile(webviewId: string, filePath: string, content: string): void {
        this.sendMessage(webviewId, {
            command: 'operationDiff',
            path: filePath,
            content
        });
    }

    /**
     * Add a message to the chat
     */
    public addMessage(webviewId: string, message: any): void {
        this.sendMessage(webviewId, {
            command: 'addMessage',
            message: message
        });
    }

    /**
     * Show loading indicator in the webview
     */
    public showLoading(webviewId: string): void {
        this.sendMessage(webviewId, {
            command: 'showLoading'
        });
    }

    /**
     * Hide loading indicator in the webview
     */
    public hideLoading(webviewId: string): void {
        this.sendMessage(webviewId, {
            command: 'hideLoading'
        });
    }

    /**
     * Update the list of workspace files in the webview
     */
    public updateWorkspaceFiles(webviewId: string, files: any[]): void {
        this.sendMessage(webviewId, {
            command: 'workspaceFilesUpdated',
            files: files
        });
    }

    /**
     * Update the context in the webview
     */
    public updateContext(webviewId: string, context: any): void {
        this.sendMessage(webviewId, {
            type: 'contextUpdate',
            context: context
        });
    }

    /**
     * Notify that indexing is complete
     */
    public notifyIndexingComplete(webviewId: string): void {
        this.sendMessage(webviewId, {
            type: 'indexingComplete'
        });
    }
} 