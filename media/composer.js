// VS Code webview API
const vscode = acquireVsCodeApi();

// DOM Elements
const promptInput = document.getElementById('promptInput');
const generateButton = document.getElementById('generateButton');
const previewContent = document.getElementById('previewContent');
const includeImports = document.getElementById('includeImports');
const includeTypes = document.getElementById('includeTypes');
const includeTests = document.getElementById('includeTests');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Enter key handling
    promptInput.addEventListener('keydown', handleKeyPress);
    
    // Button clicks
    generateButton.addEventListener('click', generateCode);
});

// Message handling from extension
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'updatePreview':
            updatePreview(message.code, message.diff);
            break;

        case 'showLoading':
            showLoading();
            break;

        case 'hideLoading':
            hideLoading();
            break;

        case 'showError':
            showError(message.error);
            break;
    }
});

// Functions
function handleKeyPress(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        generateCode();
    }
}

function generateCode() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    const context = {
        includeImports: includeImports.checked,
        includeTypes: includeTypes.checked,
        includeTests: includeTests.checked
    };

    vscode.postMessage({
        command: 'generateCode',
        prompt: prompt,
        context: context
    });

    showLoading();
}

function updatePreview(code, diff) {
    hideLoading();

    if (!code && !diff) {
        previewContent.innerHTML = `
            <div class="empty-state">
                <h3>No Preview Available</h3>
                <p>Generate code or make changes to see preview</p>
            </div>
        `;
        return;
    }

    if (diff) {
        showDiffPreview(diff);
    } else {
        showCodePreview(code);
    }
}

function showCodePreview(code) {
    previewContent.innerHTML = `
        <div class="preview-header">
            <h3>Generated Code</h3>
            <div class="preview-actions">
                <button onclick="applyCode()">Apply</button>
                <button onclick="copyCode()">Copy</button>
            </div>
        </div>
        <div class="preview-content">
            <pre><code class="language-typescript">${escapeHtml(code)}</code></pre>
        </div>
    `;

    // Highlight code
    Prism.highlightAllUnder(previewContent);
}

function showDiffPreview(diff) {
    const diffHtml = diff.map(part => {
        const type = part.added ? 'added' : part.removed ? 'removed' : 'unchanged';
        return `<div class="diff-line ${type}">${escapeHtml(part.value)}</div>`;
    }).join('');

    previewContent.innerHTML = `
        <div class="preview-header">
            <h3>Code Changes</h3>
            <div class="preview-actions">
                <button onclick="applyChanges()">Apply</button>
                <button onclick="revertChanges()">Revert</button>
            </div>
        </div>
        <div class="preview-content">
            <div class="diff-view">${diffHtml}</div>
        </div>
    `;
}

function showLoading() {
    previewContent.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
        </div>
    `;
}

function hideLoading() {
    const loading = previewContent.querySelector('.loading');
    if (loading) {
        loading.remove();
    }
}

function showError(error) {
    hideLoading();
    previewContent.innerHTML = `
        <div class="error-state">
            <h3>Error</h3>
            <p>${error}</p>
        </div>
    `;
}

function applyCode() {
    vscode.postMessage({
        command: 'applyCode'
    });
}

function applyChanges() {
    vscode.postMessage({
        command: 'applyChanges'
    });
}

function revertChanges() {
    vscode.postMessage({
        command: 'revertChanges'
    });
}

function copyCode() {
    const code = previewContent.querySelector('code');
    if (code) {
        vscode.postMessage({
            command: 'copyCode',
            code: code.textContent
        });
    }
}

// Utility functions
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Auto-resize textarea
promptInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
}); 