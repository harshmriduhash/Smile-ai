import * as vscode from 'vscode';
import { ChatHistoryManager } from '../utils/ChatHistoryManager';
import { Message } from '../types/chat';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'smile-ai.chatView';
    private readonly _extensionUri: vscode.Uri;
    private readonly _chatHistoryManager: ChatHistoryManager;
    private _currentSessionId: string;

    constructor(extensionUri: vscode.Uri, chatHistoryManager: ChatHistoryManager) {
        this._extensionUri = extensionUri;
        this._chatHistoryManager = chatHistoryManager;
        // Create a new session when provider is instantiated
        const session = this._chatHistoryManager.createSession('New Chat');
        this._currentSessionId = session.id;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void | Thenable<void> {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    const message: Message = {
                        role: 'user',
                        content: data.value,
                        timestamp: Date.now()
                    };
                    await this._chatHistoryManager.addMessage(this._currentSessionId, message);
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Smile AI Chat</title>
            </head>
            <body>
                <div id="chat-container">
                    <div id="messages"></div>
                    <div id="input-container">
                        <textarea id="message-input" placeholder="Type your message..."></textarea>
                        <button id="send-button">Send</button>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
} 