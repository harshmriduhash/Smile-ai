declare const acquireVsCodeApi: () => {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

// Initialize VS Code API once
const vscode = acquireVsCodeApi();

// DOM Elements
const messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
const sendButton = document.getElementById('sendButton') as HTMLButtonElement;
const messagesContainer = document.getElementById('messages') as HTMLDivElement;
const addModelButtonElement = document.getElementById('addModel') as HTMLButtonElement;
const includeImportsElement = document.getElementById('includeImports') as HTMLInputElement;
const includeTipsElement = document.getElementById('includeTips') as HTMLInputElement;
const includeTestsElement = document.getElementById('includeTests') as HTMLInputElement;
const messageTemplateElement = document.getElementById('message-template') as HTMLTemplateElement;
const codeBlockTemplateElement = document.getElementById('code-block-template') as HTMLTemplateElement;
const fileAttachmentTemplateElement = document.getElementById('file-attachment-template') as HTMLTemplateElement;
const attachFileButtonElement = document.getElementById('attachFile') as HTMLButtonElement;
const attachFolderButtonElement = document.getElementById('attachFolder') as HTMLButtonElement;
const chatModeSelectElement = document.getElementById('chatMode') as HTMLSelectElement;
const openChatButtonElement = document.getElementById('openChat') as HTMLButtonElement;
const openComposerButtonElement = document.getElementById('openComposer') as HTMLButtonElement;
const toolbarButtons = document.querySelectorAll('.toolbar-button[data-view]');

// Check for missing required elements
// We need to check specifically for the elements that are essential for functionality
if (!messageInput || !sendButton || !messagesContainer) {
    console.error('Essential DOM elements not found');
}

// Event Listeners
messageInput?.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendButton?.addEventListener('click', () => {
    sendMessage();
});

addModelButtonElement?.addEventListener('click', () => {
    vscode.postMessage({ command: 'addModel' });
});

openChatButtonElement?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openChat' });
});

openComposerButtonElement?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openComposer' });
});

// Toolbar view switching
toolbarButtons.forEach(button => {
    button.addEventListener('click', () => {
        const view = (button as HTMLElement).dataset.view;
        if (view) {
            toolbarButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            vscode.postMessage({ command: 'switchView', view });
        }
    });
});

// Auto-resize textarea
messageInput?.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight}px`;
});

// File and folder attachment handling
let currentAttachments: Array<{type: 'file' | 'folder', path: string}> = [];

attachFileButtonElement?.addEventListener('click', () => {
    vscode.postMessage({ command: 'attachFile' });
});

attachFolderButtonElement?.addEventListener('click', () => {
    vscode.postMessage({ command: 'attachFolder' });
});

// Message sending function
function sendMessage() {
    const content = messageInput?.value.trim();
    console.log('Sending message:', content); // Debug log
    
    if (content) {
        const options = {
            includeImports: includeImportsElement?.checked ?? true,
            includeTips: includeTipsElement?.checked ?? true,
            includeTests: includeTestsElement?.checked ?? true,
            chatMode: chatModeSelectElement?.value ?? 'chat'
        };

        vscode.postMessage({
            command: 'sendMessage',
            text: content,
            options: options,
            attachments: currentAttachments
        });
        
        // Clear input after sending
        if (messageInput) {
            messageInput.value = '';
            messageInput.style.height = 'auto';
        }
        
        // Clear attachments after sending
        currentAttachments = [];
        updateAttachmentUI();
    }
}

// Update attachment UI
function updateAttachmentUI() {
    const attachmentsContainer = document.querySelector('.current-attachments');
    if (!attachmentsContainer) return;

    attachmentsContainer.innerHTML = '';
    currentAttachments.forEach(attachment => {
        const element = document.createElement('div');
        element.className = 'attachment-item';
        element.innerHTML = `
            <i class="codicon codicon-${attachment.type === 'file' ? 'file-code' : 'folder'}"></i>
            <span>${attachment.path.split('/').pop() || attachment.path.split('\\').pop()}</span>
            <button class="remove-attachment" data-path="${attachment.path}">
                <i class="codicon codicon-close"></i>
            </button>
        `;
        
        // Add event listener for removing attachment
        const removeButton = element.querySelector('.remove-attachment');
        removeButton?.addEventListener('click', () => {
            const path = (removeButton as HTMLElement).dataset.path;
            if (path) {
                currentAttachments = currentAttachments.filter(a => a.path !== path);
                updateAttachmentUI();
            }
        });
        
        attachmentsContainer.appendChild(element);
    });
}

// Define ChatMessage interface
interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    attachments?: Array<{
        type: 'file' | 'folder';
        path: string;
    }>;
}

// Interface for messages from extension
interface VSCodeMessage {
    command: string;
    message?: ChatMessage;
    error?: {
        message: string;
        details?: string;
    };
    path?: string;
    models?: any[];
    operations?: FileOperation[];
    id?: string;
    diff?: { added: boolean; removed: boolean; value: string; }[];
}

// Handle messages from extension
window.addEventListener('message', (event: MessageEvent<VSCodeMessage>) => {
    const message = event.data;
    console.log('Received message from extension:', message);

    switch (message.command) {
        case 'addMessage':
            if (message.message) {
                console.log('Adding message to UI:', message.message); // Debug message
                addMessage(message.message);
            }
            break;
        case 'showLoading':
            console.log('Showing loading state'); // Debug message
            showLoading();
            break;
        case 'hideLoading':
            console.log('Hiding loading state'); // Debug message
            hideLoading();
            break;
        case 'showError':
            if (message.error) {
                console.log('Showing error:', message.error); // Debug message
                showError(message.error);
            }
            break;
        case 'fileAttached':
            if (message.path) {
                console.log('File attached:', message.path); // Debug message
                currentAttachments.push({ type: 'file', path: message.path });
                updateAttachmentUI();
            }
            break;
        case 'folderAttached':
            if (message.path) {
                console.log('Folder attached:', message.path); // Debug message
                currentAttachments.push({ type: 'folder', path: message.path });
                updateAttachmentUI();
            }
            break;
        case 'updateModels':
            if (message.models) {
                console.log('Updating models list:', message.models); // Debug message
                // Update models dropdown if implemented
            }
            break;
        case 'updatePendingOperations':
            if (message.operations) {
                pendingOperations = message.operations;
                updatePendingOperationsUI();
            }
            break;
        case 'operationDiff':
            if (message.id && message.diff) {
                updateOperationDiff(message.id, message.diff);
            }
            break;
    }
});

function addMessage(message: ChatMessage) {
    if (!messageTemplateElement || !messagesContainer) return;

    const messageElement = messageTemplateElement.content.cloneNode(true) as DocumentFragment;
    const messageDiv = messageElement.querySelector('.message') as HTMLDivElement;
    const avatar = messageElement.querySelector('.avatar i') as HTMLElement;
    const content = messageElement.querySelector('.markdown-content') as HTMLDivElement;

    if (!messageDiv || !avatar || !content) return;

    messageDiv.classList.add(message.role);
    avatar.classList.add(message.role === 'user' ? 'codicon-account' : 'codicon-hubot');

    // Process markdown and code blocks
    const formattedContent = formatMessage(message.content);
    content.innerHTML = formattedContent;

    // Add file attachments if any
    if (message.attachments && message.attachments.length > 0 && fileAttachmentTemplateElement) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.className = 'attachments';

        message.attachments.forEach(attachment => {
            const attachmentElement = fileAttachmentTemplateElement.content.cloneNode(true) as DocumentFragment;
            const filename = attachmentElement.querySelector('.filename') as HTMLElement;
            const icon = attachmentElement.querySelector('.icon') as HTMLElement;

            if (filename && icon) {
                const pathParts = attachment.path.split(/[\/\\]/);
                filename.textContent = pathParts[pathParts.length - 1] || '';
                icon.classList.add(attachment.type === 'file' ? 'codicon-file-code' : 'codicon-folder');
            }

            attachmentsContainer.appendChild(attachmentElement);
        });

        content.appendChild(attachmentsContainer);
    }

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Add click handler for code blocks copy functionality
    const codeBlocks = messagesContainer.querySelectorAll('.code-block .copy-button');
    codeBlocks.forEach(button => {
        button.addEventListener('click', (e) => {
            const codeBlock = (e.target as HTMLElement).closest('.code-block');
            const codeContent = codeBlock?.querySelector('code')?.textContent;
            if (codeContent) {
                navigator.clipboard.writeText(codeContent)
                    .then(() => {
                        // Optionally show feedback for successful copy
                        const copyButton = (e.target as HTMLElement).closest('.copy-button') as HTMLElement;
                        if (copyButton) {
                            const originalHTML = copyButton.innerHTML;
                            copyButton.innerHTML = '<i class="codicon codicon-check"></i>';
                            setTimeout(() => {
                                copyButton.innerHTML = originalHTML;
                            }, 1000);
                        }
                    });
            }
        });
    });
}

function formatMessage(content: string): string {
    // Basic markdown-like formatting
    return content
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            if (!codeBlockTemplateElement) return `<pre><code>${code}</code></pre>`;
            
            const codeBlock = codeBlockTemplateElement.content.cloneNode(true) as DocumentFragment;
            const codeElement = codeBlock.querySelector('code') as HTMLElement;
            
            if (codeElement) {
                if (lang) {
                    codeElement.classList.add(`language-${lang}`);
                }
                
                codeElement.textContent = code.trim();
            }
            
            const temp = document.createElement('div');
            temp.appendChild(codeBlock);
            return temp.innerHTML;
        })
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function showLoading() {
    if (!messagesContainer) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant loading';
    loadingDiv.innerHTML = `
        <div class="avatar">
            <i class="codicon codicon-loading codicon-modifier-spin"></i>
        </div>
        <div class="message-content">
            <div class="markdown-content">Thinking...</div>
        </div>
    `;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideLoading() {
    if (!messagesContainer) return;
    
    const loadingElement = messagesContainer.querySelector('.loading');
    if (loadingElement) {
        loadingElement.remove();
    }
}

function showError(error: { message: string; details?: string }) {
    // Handle error display
    const errorMessage = {
        role: 'system' as "user" | "assistant" | "system",
        content: `Error: ${error.message}`,
        timestamp: Date.now()
    };
    
    addMessage(errorMessage);
}

// File operation interfaces
interface FileOperation {
    id: string;
    type: 'add' | 'update' | 'delete';
    filePath: string;
    originalContent?: string;
    newContent?: string;
    description?: string;
    created: number;
}

// Operation state management
let pendingOperations: FileOperation[] = [];

// File operations UI
function updatePendingOperationsUI() {
    const operationsContainer = document.querySelector('.pending-operations') as HTMLElement;
    if (!operationsContainer) return;

    operationsContainer.innerHTML = '';
    
    if (pendingOperations.length === 0) {
        operationsContainer.style.display = 'none';
        return;
    }
    
    operationsContainer.style.display = 'block';
    
    // Add header with accept/reject all buttons
    const headerElement = document.createElement('div');
    headerElement.className = 'operations-header';
    headerElement.innerHTML = `
        <h3>Pending File Operations (${pendingOperations.length})</h3>
        <div class="operation-actions">
            <button class="accept-all-button">
                <i class="codicon codicon-check-all"></i> Accept All
            </button>
            <button class="reject-all-button">
                <i class="codicon codicon-close-all"></i> Reject All
            </button>
        </div>
    `;
    
    // Add event listeners for accept/reject all buttons
    const acceptAllButton = headerElement.querySelector('.accept-all-button');
    acceptAllButton?.addEventListener('click', () => {
        vscode.postMessage({
            command: 'acceptAllOperations'
        });
    });
    
    const rejectAllButton = headerElement.querySelector('.reject-all-button');
    rejectAllButton?.addEventListener('click', () => {
        vscode.postMessage({
            command: 'rejectAllOperations'
        });
    });
    
    operationsContainer.appendChild(headerElement);
    
    // Add each operation
    pendingOperations.forEach(operation => {
        const element = document.createElement('div');
        element.className = 'operation-item';
        element.dataset.id = operation.id;
        
        // Get path parts for display
        const fileName = operation.filePath.split('/').pop() || operation.filePath.split('\\').pop() || '';
        const dirPath = operation.filePath.replace(fileName, '');
        
        // Get operation icon
        let operationIcon = '';
        let operationLabel = '';
        switch (operation.type) {
            case 'add':
                operationIcon = 'codicon-add';
                operationLabel = 'Add';
                break;
            case 'update':
                operationIcon = 'codicon-edit';
                operationLabel = 'Update';
                break;
            case 'delete':
                operationIcon = 'codicon-trash';
                operationLabel = 'Delete';
                break;
        }
        
        element.innerHTML = `
            <div class="operation-header">
                <div class="operation-info">
                    <span class="operation-type">
                        <i class="codicon ${operationIcon}"></i> ${operationLabel}
                    </span>
                    <span class="operation-file">
                        <span class="file-name">${fileName}</span>
                        <span class="file-path">${dirPath}</span>
                    </span>
                </div>
                <div class="operation-actions">
                    <button class="accept-button" title="Accept">
                        <i class="codicon codicon-check"></i>
                    </button>
                    <button class="reject-button" title="Reject">
                        <i class="codicon codicon-x"></i>
                    </button>
                </div>
            </div>
            <div class="operation-content">
                ${operation.description ? `<div class="operation-description">${operation.description}</div>` : ''}
                ${operation.type === 'update' ? `<div class="operation-diff"></div>` : ''}
                ${operation.type === 'add' ? `<div class="operation-preview"></div>` : ''}
            </div>
        `;
        
        // Add event listeners for individual accept/reject buttons
        const acceptButton = element.querySelector('.accept-button');
        acceptButton?.addEventListener('click', () => {
            vscode.postMessage({
                command: 'acceptOperation',
                id: operation.id
            });
        });
        
        const rejectButton = element.querySelector('.reject-button');
        rejectButton?.addEventListener('click', () => {
            vscode.postMessage({
                command: 'rejectOperation',
                id: operation.id
            });
        });
        
        // If this is an update operation, request the diff
        if (operation.type === 'update') {
            vscode.postMessage({
                command: 'getOperationDiff',
                id: operation.id
            });
        }
        
        // If this is an add operation, show the preview
        if (operation.type === 'add' && operation.newContent) {
            const previewElement = element.querySelector('.operation-preview');
            if (previewElement) {
                previewElement.innerHTML = `<pre class="code-preview">${escapeHtml(operation.newContent)}</pre>`;
            }
        }
        
        operationsContainer.appendChild(element);
    });
}

// Helper function to escape HTML
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function updateOperationDiff(operationId: string, diff: { added: boolean; removed: boolean; value: string; }[]) {
    const operationElement = document.querySelector(`.operation-item[data-id="${operationId}"]`);
    if (!operationElement) return;
    
    const diffElement = operationElement.querySelector('.operation-diff');
    if (!diffElement) return;
    
    diffElement.innerHTML = '';
    
    // Create a diff display
    const diffContainer = document.createElement('div');
    diffContainer.className = 'diff-container';
    
    diff.forEach(part => {
        const diffPart = document.createElement('div');
        diffPart.className = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-unchanged';
        
        const lines = part.value.split('\n');
        lines.forEach((line, index) => {
            if (index < lines.length - 1 || line.length > 0) {
                const lineElement = document.createElement('div');
                lineElement.className = 'diff-line';
                const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
                lineElement.textContent = prefix + line;
                diffPart.appendChild(lineElement);
            }
        });
        
        diffContainer.appendChild(diffPart);
    });
    
    diffElement.appendChild(diffContainer);
} 