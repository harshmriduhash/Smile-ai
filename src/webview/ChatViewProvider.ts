import * as vscode from 'vscode';
import { Message } from '../types/chat';
import { ChatHistoryManager } from '../utils/ChatHistoryManager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private chatHistoryManager: ChatHistoryManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        chatHistoryManager: ChatHistoryManager
    ) {
        this.chatHistoryManager = chatHistoryManager;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set up message handler
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.type === 'userMessage') {
                this.handleMessage(message.content);
            }
        });

        webviewView.webview.html = this._getHtmlForWebview();
    }

    private handleMessage(message: string): void {
        const userMessage: Message = {
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
        
        const sessionId = 'default'; // You may want to manage sessions differently
        this.chatHistoryManager.addMessage(sessionId, userMessage);
        this._view?.webview.postMessage({ type: 'addMessage', message: userMessage });
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Chat View</title>
                <style>
                    #chat-container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        padding: 1rem;
                    }
                    .message-input {
                        position: fixed;
                        bottom: 1rem;
                        left: 1rem;
                        right: 1rem;
                        display: flex;
                        gap: 0.5rem;
                    }
                    #message-box {
                        flex: 1;
                        padding: 0.5rem;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                    }
                    button {
                        padding: 0.5rem 1rem;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        cursor: pointer;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div id="chat-container">
                    <div id="messages"></div>
                    <div class="message-input">
                        <input type="text" id="message-box" placeholder="Type your message...">
                        <button id="send-button">Send</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const messageBox = document.getElementById('message-box');
                    const sendButton = document.getElementById('send-button');
                    const messagesContainer = document.getElementById('messages');

                    function sendMessage() {
                        const content = messageBox.value.trim();
                        if (content) {
                            vscode.postMessage({
                                type: 'userMessage',
                                content: content
                            });
                            messageBox.value = '';
                        }
                    }

                    messageBox.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            sendMessage();
                        }
                    });

                    sendButton.addEventListener('click', sendMessage);

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.type === 'addMessage') {
                            const messageDiv = document.createElement('div');
                            messageDiv.className = 'message ' + message.message.role;
                            messageDiv.textContent = message.message.content;
                            messagesContainer.appendChild(messageDiv);
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        }
                    });
                </script>
            </body>
            </html>`;
    }
} 