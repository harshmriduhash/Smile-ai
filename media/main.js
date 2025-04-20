// Create a self-executing function to avoid polluting the global namespace
(() => {
    "use strict";

    // Debug mode for verbose logging
    const DEBUG = true;
    function log(...args) {
        if (DEBUG) console.log("SMILE-AI:", ...args);
    }

    log("Starting initialization");

    // Get VS Code API
    let vscode;
    try {
        vscode = acquireVsCodeApi();
    } catch (e) {
        log("Error acquiring VS Code API:", e);
    }

    // Store operations that are pending user approval
    let pendingOperations = [];

    // Document is ready
    document.addEventListener('DOMContentLoaded', () => {
        log("DOM fully loaded");
        
        // Set up send button event listener
        const sendButton = document.querySelector('#send-button');
        const messageInput = document.querySelector('#message-input');
        const chatContainer = document.getElementById('messages');
        const attachFileButton = document.getElementById('attachFileButton');
        const attachFolderButton = document.getElementById('attachFolderButton');
        const attachmentsContainer = document.getElementById('attachments-container');

        if (sendButton && messageInput) {
            sendButton.addEventListener('click', () => {
                sendMessage();
            });

            messageInput.addEventListener('keydown', (event) => {
                const suggestionsContainer = document.getElementById('suggestions-container');
                const isVisible = suggestionsContainer && suggestionsContainer.style.display === 'block';
                
                if (isVisible) {
                    // Suggestion navigation
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        navigateSuggestions(event.key === 'ArrowDown' ? 1 : -1);
                        return;
                    }
                    
                    // Accept suggestion with Tab or Enter
                    if (event.key === 'Tab' || event.key === 'Enter') {
                        event.preventDefault();
                        acceptSelectedSuggestion();
                        return;
                    }
                    
                    // Escape closes suggestions
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        hideSuggestions();
                        return;
                    }
                }
                
                // Standard behavior - send message with Enter (unless shift is pressed)
                if (event.key === 'Enter' && !event.shiftKey && !isVisible) {
                    event.preventDefault();
                    sendMessage();
                }
            });
            
            // Set up @ mention detection - ÖNEMLİ: Input event listener ekle
            messageInput.addEventListener('input', handleInputChange);
        }
        
        // Set up file and folder attachment buttons
        if (attachFileButton) {
            attachFileButton.addEventListener('click', () => {
                log("Attach File button clicked");
                vscode.postMessage({
                    command: 'attachFile'
                });
            });
        } else {
            log("Attach File button not found in the DOM");
        }
        
        if (attachFolderButton) {
            attachFolderButton.addEventListener('click', () => {
                log("Attach Folder button clicked");
                vscode.postMessage({
                    command: 'attachFolder'
                });
            });
        } else {
            log("Attach Folder button not found in the DOM");
        }
        
        // Request workspace files on startup for @ mentions
        requestWorkspaceFiles();
        
        // Initialize pending operations container
        const pendingOperationsContainer = document.querySelector('.pending-operations');
        if (pendingOperationsContainer) {
            log("Pending operations container found");
        } else {
            log("Pending operations container not found in the DOM");
        }
    });

    // Current attachments
    let currentAttachments = [];
    
    // Cache for workspace files (used for @ mentions)
    let workspaceFiles = [];
    let workspaceFolders = [];

    // Function to send message to extension
    function sendMessage() {
        const messageInput = document.getElementById('message-input');
        const text = messageInput.value.trim();
        
        if (text) {
            log("Sending message with attachments:", currentAttachments.length > 0 ? 
                currentAttachments.map(a => a.name || a.path.split(/[\\\/]/).pop()).join(', ') : 
                'none');
            
            // Check if the message already contains file content markers
            const containsFileContent = text.includes('```') && 
                                      (text.includes('### File:') || 
                                       text.includes('# ') || 
                                       text.includes('## '));
            
            // If message already contains file content, don't send attachments to avoid duplication
            let attachmentsToSend = [];
            if (!containsFileContent && currentAttachments.length > 0) {
                // Make sure any file attachments have content included
                attachmentsToSend = currentAttachments.map(attachment => {
                    // Create a new object to avoid modifying the original
                    const newAttachment = { ...attachment };
                    
                    // Make sure to include content if we have it
                    if (attachment.content) {
                        log(`Including content for attached file: ${attachment.name || attachment.path.split(/[\\\/]/).pop()}, length: ${attachment.content.length} characters`);
                    } else {
                        log(`No content found for attachment: ${attachment.name || attachment.path.split(/[\\\/]/).pop()}`);
                    }
                    
                    return newAttachment;
                });
            } else if (containsFileContent) {
                log('Message already contains file content, skipping attachments to avoid duplication');
            }
            
            vscode.postMessage({
                command: 'sendMessage',
                text: text,
                options: {
                    attachments: attachmentsToSend,
                    originalText: text
                }
            });
            
            messageInput.value = '';
            // Clear attachments after sending
            currentAttachments = [];
            updateAttachmentsUI();
        }
    }

    // Function to update attachments UI
    function updateAttachmentsUI() {
        const attachmentsContainer = document.getElementById('attachments-container');
        attachmentsContainer.innerHTML = '';
        
        if (currentAttachments.length === 0) {
            attachmentsContainer.style.display = 'none';
            return;
        }
        
        attachmentsContainer.style.display = 'flex';
        
        currentAttachments.forEach((attachment, index) => {
            const attachmentItem = document.createElement('div');
            attachmentItem.className = 'attachment-item';
            
            const icon = document.createElement('span');
            icon.className = 'codicon';
            icon.classList.add(attachment.type === 'file' ? 'codicon-file' : 'codicon-folder');
            
            const name = document.createElement('span');
            name.textContent = attachment.name || attachment.path.split(/[\\\/]/).pop();
            
            const removeButton = document.createElement('span');
            removeButton.className = 'codicon codicon-close attachment-remove';
            removeButton.addEventListener('click', () => {
                currentAttachments.splice(index, 1);
                updateAttachmentsUI();
            });
            
            attachmentItem.appendChild(icon);
            attachmentItem.appendChild(name);
            attachmentItem.appendChild(removeButton);
            
            attachmentsContainer.appendChild(attachmentItem);
        });
    }

    // Function to add message to the chat
    function addMessage(role, content) {
        // Safety check for content
        if (content === undefined || content === null) {
            console.warn("Received null or undefined content in addMessage");
            content = "";
        }
        
        const chatContainer = document.querySelector('.chat-container .messages');
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', role);
        
        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        const avatarIcon = document.createElement('i');
        avatarIcon.classList.add('codicon');
        
        // Set the appropriate icon based on role
        if (role === 'user') {
            avatarIcon.classList.add('codicon-account');
        } else if (role === 'assistant') {
            avatarIcon.classList.add('codicon-hubot');
        } else if (role === 'system') {
            avatarIcon.classList.add('codicon-info');
        } else if (role === 'error') {
            avatarIcon.classList.add('codicon-error');
        }
        
        avatar.appendChild(avatarIcon);
        
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        
        // Add the message content safely
        try {
            // Process content for code blocks
            const processedContent = processCodeBlocks(content);
            
            // Create markdown content div
            const markdownContent = document.createElement('div');
            markdownContent.classList.add('markdown-content');
            markdownContent.innerHTML = processedContent;
            
            messageContent.appendChild(markdownContent);
        } catch (error) {
            console.error("Error processing message content:", error);
            messageContent.textContent = "Error displaying message content";
        }
        
        messageElement.appendChild(avatar);
        messageElement.appendChild(messageContent);
        
        chatContainer.appendChild(messageElement);
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Process code blocks in message content
    function processCodeBlocks(content) {
        // Check if content is null or undefined
        if (!content) {
            console.warn("Content is null or undefined in processCodeBlocks");
            return "";
        }
        
        // Ensure content is a string
        if (typeof content !== 'string') {
            console.warn("Content is not a string in processCodeBlocks:", content);
            return String(content || "");
        }
        
        // Replace code blocks with properly formatted HTML
        return content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const languageClass = language ? `language-${language}` : '';
            return `<pre class="code-block ${languageClass}"><code>${escapeHtml(code)}</code></pre>`;
        });
    }

    // Escape HTML special characters
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Show loading indicator
    function showLoading() {
        const chatContainer = document.querySelector('.chat-container .messages');
        
        const loadingElement = document.createElement('div');
        loadingElement.classList.add('message', 'assistant', 'loading');
        
        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.textContent = 'A';
        
        const loadingContent = document.createElement('div');
        loadingContent.classList.add('content');
        loadingContent.innerHTML = '<div class="loading-indicator"><span>.</span><span>.</span><span>.</span></div>';
        
        loadingElement.appendChild(avatar);
        loadingElement.appendChild(loadingContent);
        
        chatContainer.appendChild(loadingElement);
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Hide loading indicator
    function hideLoading() {
        const loadingElement = document.querySelector('.message.loading');
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    // Dosya adını tam yoldan ayıklayan yardımcı fonksiyon
    function getFilename(filePath) {
        if (!filePath) return '';
        // Windows veya unix yolu olabilir
        const parts = filePath.split(/[\\/]/);
        return parts[parts.length - 1] || '';
    }

    // Function to update the pending operations UI
    function updatePendingOperationsUI() {
        const pendingOperationsContainer = document.querySelector('.pending-operations');
        if (!pendingOperationsContainer) {
            console.error('Pending operations container not found in the DOM');
            return;
        }
        
        console.log('Updating pending operations UI with', pendingOperations.length, 'operations');
        
        pendingOperationsContainer.innerHTML = '';
        
        if (pendingOperations.length === 0) {
            pendingOperationsContainer.style.display = 'none';
            return;
        }

        pendingOperationsContainer.style.display = 'block';
        
        const header = document.createElement('div');
        header.classList.add('operations-header');
        header.innerHTML = `<h3>Pending File Operations (${pendingOperations.length})</h3>
                            <div class="operation-actions">
                                <button class="accept-all-button">Accept All</button>
                                <button class="reject-all-button">Reject All</button>
                            </div>`;
        pendingOperationsContainer.appendChild(header);
        
        // Add event listeners for accept/reject all buttons
        header.querySelector('.accept-all-button').addEventListener('click', () => {
            console.log('Accept all button clicked');
            vscode.postMessage({
                command: 'acceptAllOperations'
            });
        });
        
        header.querySelector('.reject-all-button').addEventListener('click', () => {
            console.log('Reject all button clicked');
            vscode.postMessage({
                command: 'rejectAllOperations'
            });
        });
        
        // Add each operation
        pendingOperations.forEach(operation => {
            console.log('Adding operation UI for:', operation);
            
            const operationElement = document.createElement('div');
            operationElement.classList.add('operation-item');
            operationElement.dataset.id = operation.id;
            
            const header = document.createElement('div');
            header.classList.add('operation-header');
            
            const opTypeText = operation.type === 'add' ? 'Create' : 
                             operation.type === 'update' ? 'Update' : 'Delete';
            
            const title = document.createElement('div');
            title.classList.add('operation-info');
            title.innerHTML = `
                <div class="operation-type">
                    <i class="codicon codicon-${operation.type === 'add' ? 'new-file' : 
                                                operation.type === 'update' ? 'edit' : 'trash'}"></i>
                    ${opTypeText}
                </div>
                <div class="operation-file">
                    <span class="file-name">${getFilename(operation.filePath)}</span>
                    <span class="file-path">(${operation.filePath})</span>
                </div>
            `;
            
            const actions = document.createElement('div');
            actions.classList.add('operation-actions');
            
            const acceptButton = document.createElement('button');
            acceptButton.classList.add('accept-button');
            acceptButton.innerHTML = '<i class="codicon codicon-check"></i> Accept';
            acceptButton.addEventListener('click', () => {
                console.log('Accept button clicked for operation:', operation.id);
                vscode.postMessage({
                    command: 'acceptOperation',
                    id: operation.id
                });
            });
            
            const rejectButton = document.createElement('button');
            rejectButton.classList.add('reject-button');
            rejectButton.innerHTML = '<i class="codicon codicon-discard"></i> Reject';
            rejectButton.addEventListener('click', () => {
                console.log('Reject button clicked for operation:', operation.id);
                vscode.postMessage({
                    command: 'rejectOperation',
                    id: operation.id
                });
            });
            
            actions.appendChild(acceptButton);
            actions.appendChild(rejectButton);
            
            header.appendChild(title);
            header.appendChild(actions);
            
            operationElement.appendChild(header);
            
            // Add operation description if available
            if (operation.description) {
                const description = document.createElement('div');
                description.classList.add('operation-description');
                description.textContent = operation.description;
                operationElement.appendChild(description);
            }
            
            // Add content preview based on operation type
            const contentContainer = document.createElement('div');
            contentContainer.classList.add('operation-content');
            
            // Add view diff button for update operations
            if (operation.type === 'update') {
                const viewDiffButton = document.createElement('button');
                viewDiffButton.classList.add('view-diff-button');
                viewDiffButton.innerHTML = '<i class="codicon codicon-diff"></i> View Changes';
                viewDiffButton.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'getOperationDiff',
                        id: operation.id
                    });
                    
                    // Toggle diff view
                    const diffContainer = operationElement.querySelector('.diff-container');
                    if (diffContainer) {
                        diffContainer.style.display = diffContainer.style.display === 'none' ? 'block' : 'none';
                        viewDiffButton.innerHTML = diffContainer.style.display === 'none' ? 
                            '<i class="codicon codicon-diff"></i> View Changes' : 
                            '<i class="codicon codicon-fold"></i> Hide Changes';
                    } else {
                        // Create placeholder for diff that will be filled by the diff response
                        const newDiffContainer = document.createElement('div');
                        newDiffContainer.classList.add('diff-container', 'loading');
                        newDiffContainer.innerHTML = 'Loading diff...';
                        contentContainer.appendChild(newDiffContainer);
                        viewDiffButton.innerHTML = '<i class="codicon codicon-fold"></i> Hide Changes';
                    }
                });
                contentContainer.appendChild(viewDiffButton);
            }
            
            operationElement.appendChild(contentContainer);
            pendingOperationsContainer.appendChild(operationElement);
        });
    }

    // Listen for messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        if (!message || !message.command) {
            console.warn('Received invalid message from extension:', message);
            return;
        }
        
        console.log('Received message from extension:', message.command);
        
        try {
            switch (message.command) {
                case 'addMessage':
                    hideLoading();
                    if (message.message && typeof message.message === 'object') {
                        addMessage(
                            message.message.role || 'system', 
                            message.message.content || 'No content provided'
                        );
                    } else {
                        console.warn('Received invalid message object:', message.message);
                        addMessage('error', 'Error: Invalid message format received');
                    }
                    break;
                    
                case 'addMessages':
                    hideLoading();
                    if (Array.isArray(message.messages)) {
                        message.messages.forEach(msg => {
                            if (msg && typeof msg === 'object') {
                                addMessage(
                                    msg.role || 'system',
                                    msg.content || 'No content provided'
                                );
                            }
                        });
                    } else {
                        console.warn('Received invalid messages array:', message.messages);
                    }
                    break;
                    
                case 'showLoading':
                    showLoading();
                    break;
                    
                case 'hideLoading':
                    hideLoading();
                    break;
                    
                case 'showError':
                    hideLoading();
                    addMessage('error', `Error: ${message.error?.message || message.error || 'Unknown error'}`);
                    break;
                    
                case 'updatePendingOperations':
                    if (Array.isArray(message.operations)) {
                        console.log('Received pending operations:', message.operations);
                        pendingOperations = message.operations;
                        updatePendingOperationsUI();
                    } else {
                        console.warn('Received invalid operations data:', message.operations);
                    }
                    break;
                    
                case 'operationDiff':
                    if (message.id && message.diff) {
                        const operationElement = document.querySelector(`.operation-item[data-id="${message.id}"]`);
                        if (operationElement) {
                            const diffContainer = operationElement.querySelector('.diff-container');
                            if (diffContainer) {
                                diffContainer.classList.remove('loading');
                                diffContainer.innerHTML = message.diff;
                            }
                        }
                    }
                    break;
                    
                case 'fileAttached':
                    if (message.path) {
                        log("File attached:", message.path);
                        currentAttachments.push({
                            type: 'file',
                            path: message.path,
                            content: message.content
                        });
                        updateAttachmentsUI();
                        // Focus back on the message input
                        document.getElementById('message-input').focus();
                    }
                    break;
                    
                case 'folderAttached':
                    if (message.path) {
                        log("Folder attached:", message.path);
                        currentAttachments.push({
                            type: 'folder',
                            path: message.path
                        });
                        updateAttachmentsUI();
                        // Focus back on the message input
                        document.getElementById('message-input').focus();
                    }
                    break;
                    
                case 'fileContentLoaded':
                    if (message.path && message.content) {
                        const contentLength = message.content ? message.content.length : 0;
                        log(`File content loaded for ${message.path}, length: ${contentLength} characters`);
                        
                        // Update the attachment with the content
                        const attachment = currentAttachments.find(a => a.path === message.path);
                        if (attachment) {
                            attachment.content = message.content;
                            
                            // Refresh UI to indicate content was loaded
                            updateAttachmentsUI();
                            
                            // Get filename from path
                            const fileName = attachment.name || attachment.path.split(/[\\\/]/).pop();
                            log(`Updated attachment with content for ${fileName}, content length: ${contentLength}`);
                        } else {
                            log(`Warning: Received content for ${message.path} but no matching attachment found`);
                            
                            // Add it as an attachment anyway if it's not already in the list
                            const fileName = message.path.split(/[\\\/]/).pop();
                            currentAttachments.push({
                                type: 'file',
                                path: message.path,
                                name: fileName,
                                content: message.content
                            });
                            updateAttachmentsUI();
                            log(`Added new attachment for ${fileName} with content length: ${contentLength}`);
                        }
                    }
                    break;
                    
                case 'workspaceFilesUpdated':
                    if (message.files && Array.isArray(message.files)) {
                        log("Received workspace files:", message.files.length);
                        workspaceFiles = message.files.filter(f => !f.isDirectory);
                        workspaceFolders = message.files.filter(f => f.isDirectory);
                    }
                    break;
                    
                default:
                    console.log('Unhandled message command:', message.command);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    // Function to request workspace files for suggestions
    function requestWorkspaceFiles() {
        vscode.postMessage({
            command: 'getWorkspaceFiles'
        });
    }
    
    // Functions for @ mention suggestions
    function handleInputChange(event) {
        const input = event.target;
        const text = input.value;
        const cursorPosition = input.selectionStart;
        
        // Get text before cursor
        const textBeforeCursor = text.substring(0, cursorPosition);
        
        // Check if we have an @ symbol that's not part of a word
        const atSignMatch = textBeforeCursor.match(/@([^@\s]*)$/);
        
        if (atSignMatch) {
            // We have an @ sign with some text after it
            const searchTerm = atSignMatch[1].toLowerCase();
            showFileSuggestions(searchTerm);
        } else {
            hideSuggestions();
        }
    }
    
    function showFileSuggestions(searchTerm) {
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (!suggestionsContainer) return;
        
        // Filter files based on search term (case insensitive)
        let matchingFiles = [];
        let matchingFolders = [];
        
        // Hierarchical organization of files and folders
        const allMatchingItems = workspaceFiles
            .filter(file => 
                !file.isDirectory && 
                (file.name.toLowerCase().includes(searchTerm) || 
                (file.parent && file.parent.toLowerCase().includes(searchTerm)))
            )
            .concat(
                workspaceFolders.filter(folder => 
                    folder.isDirectory && 
                    (folder.name.toLowerCase().includes(searchTerm) || 
                    (folder.parent && folder.parent.toLowerCase().includes(searchTerm)))
                )
            );
        
        // Group by parent/path for better organization
        const itemsByPath = {};
        allMatchingItems.forEach(item => {
            const parentPath = item.parent || '/';
            if (!itemsByPath[parentPath]) {
                itemsByPath[parentPath] = [];
            }
            itemsByPath[parentPath].push(item);
        });
        
        if (Object.keys(itemsByPath).length === 0) {
            hideSuggestions();
            return;
        }
        
        // Clear previous suggestions
        suggestionsContainer.innerHTML = '';
        
        // Function to create a suggestion group
        const createSuggestionGroup = (parentPath, items) => {
            // Create group header if it's not root
            if (parentPath !== '/' && items.some(item => item.level && item.level > 1)) {
                const groupHeader = document.createElement('div');
                groupHeader.classList.add('suggestion-group-header');
                groupHeader.textContent = parentPath;
                suggestionsContainer.appendChild(groupHeader);
            }
            
            // Sort items: directories first then by name
            items.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            // Add each item to the group
            items.forEach(item => {
                const suggestionItem = document.createElement('div');
                suggestionItem.classList.add('suggestion-item');
                if (items[0] === item) suggestionItem.classList.add('selected');
                
                // Determine nesting level visualization
                const nestingClass = item.level && item.level > 1 ? 'is-nested' : '';
                const indentLevel = item.level ? Math.min(item.level, 3) : 0; // Limit indentation depth
                
                const isFolder = item.isDirectory;
                const fileName = item.name;
                const filePath = item.path;
                const displayPath = filePath.replace(/\\/g, '/'); // Normalize path for display
                
                suggestionItem.innerHTML = `
                    <div class="icon">
                        <i class="codicon codicon-${isFolder ? 'folder' : 'file'}"></i>
                    </div>
                    <div class="content ${nestingClass}">
                        <div class="label">${fileName}</div>
                        <div class="path">${displayPath}</div>
                    </div>
                `;
                
                suggestionItem.dataset.path = filePath;
                suggestionItem.dataset.type = isFolder ? 'folder' : 'file';
                
                suggestionItem.addEventListener('click', () => {
                    addMention(filePath, isFolder ? 'folder' : 'file');
                    hideSuggestions();
                });
                
                suggestionsContainer.appendChild(suggestionItem);
            });
        };
        
        // Process groups by priority: exact matches first
        const prioritizedGroupKeys = Object.keys(itemsByPath).sort((a, b) => {
            const aHasExactMatch = itemsByPath[a].some(item => 
                item.name.toLowerCase() === searchTerm.toLowerCase());
            const bHasExactMatch = itemsByPath[b].some(item => 
                item.name.toLowerCase() === searchTerm.toLowerCase());
            
            if (aHasExactMatch !== bHasExactMatch) {
                return aHasExactMatch ? -1 : 1;
            }
            
            // Then prioritize by path depth (shallower first)
            return a.split('/').length - b.split('/').length;
        });
        
        // Create groups
        prioritizedGroupKeys.forEach(parentPath => {
            createSuggestionGroup(parentPath, itemsByPath[parentPath]);
        });
        
        // Only show a maximum of 10 items
        const allItems = suggestionsContainer.querySelectorAll('.suggestion-item');
        if (allItems.length > 10) {
            // Hide excess items
            Array.from(allItems).slice(10).forEach(item => {
                item.style.display = 'none';
            });
            
            // Add a "more items" indication
            const moreItemsIndicator = document.createElement('div');
            moreItemsIndicator.classList.add('suggestion-group-header');
            moreItemsIndicator.textContent = `...and ${allItems.length - 10} more items`;
            suggestionsContainer.appendChild(moreItemsIndicator);
        }
        
        // Show suggestions container
        suggestionsContainer.style.display = 'block';
    }
    
    function hideSuggestions() {
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }
    
    function navigateSuggestions(direction) {
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (!suggestionsContainer || suggestionsContainer.style.display !== 'block') return;
        
        const items = Array.from(suggestionsContainer.querySelectorAll('.suggestion-item:not([style*="display: none"])'));
        if (items.length === 0) return;
        
        // Find currently selected item
        let currentIndex = -1;
        items.forEach((item, index) => {
            if (item.classList.contains('selected')) {
                currentIndex = index;
            }
        });
        
        // Remove selection from current item
        if (currentIndex >= 0) {
            items[currentIndex].classList.remove('selected');
        }
        
        // Calculate new index
        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = items.length - 1;
        if (newIndex >= items.length) newIndex = 0;
        
        // Add selection to new item
        items[newIndex].classList.add('selected');
        
        // Ensure selected item is visible
        items[newIndex].scrollIntoView({ block: 'nearest' });
    }

    // Function to accept selected suggestion
    function acceptSelectedSuggestion() {
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (!suggestionsContainer || suggestionsContainer.style.display !== 'block') return;
        
        const selectedItem = suggestionsContainer.querySelector('.suggestion-item.selected');
        if (!selectedItem) return;
        
        const path = selectedItem.dataset.path;
        const type = selectedItem.dataset.type;
        
        if (path && type) {
            addMention(path, type);
        }
        
        hideSuggestions();
    }
    
    // Function to add a file/folder mention to the input
    function addMention(path, type) {
        const messageInput = document.getElementById('message-input');
        if (!messageInput) return;
        
        // Get current cursor position 
        const cursorPosition = messageInput.selectionStart;
        const text = messageInput.value;
        
        // Find the @ symbol before cursor
        const textBeforeCursor = text.substring(0, cursorPosition);
        const atSignMatch = textBeforeCursor.match(/@([^@\s]*)$/);
        
        if (atSignMatch) {
            // Replace the @ mention with the selected file/folder name
            const startPos = cursorPosition - atSignMatch[0].length;
            const fileName = path.split(/[\\/]/).pop(); // Get just the file name
            
            // Create new value replacing the @ mention
            const newValue = text.substring(0, startPos) + 
                            fileName + ' ' + 
                            text.substring(cursorPosition);
            
            messageInput.value = newValue;
            
            // Move cursor after the inserted file name
            messageInput.selectionStart = messageInput.selectionEnd = startPos + fileName.length + 1;
            
            // Focus back on input
            messageInput.focus();
            
            // Get file content if it's a file
            if (type === 'file') {
                try {
                    // Request file content from extension
                    vscode.postMessage({
                        command: 'getFileContent',
                        path: path
                    });
                } catch (e) {
                    console.error('Error requesting file content:', e);
                }
            }
            
            // Add to attachments
            const existingAttachment = currentAttachments.find(att => att.path === path);
            if (!existingAttachment) {
                currentAttachments.push({
                    type: type,
                    path: path
                });
                
                updateAttachmentsUI();
            }
        }
    }

    log("Initialization script loaded");
})();