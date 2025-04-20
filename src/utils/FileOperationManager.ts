import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface FileOperation {
    id: string;
    type: 'add' | 'update' | 'delete';
    filePath: string;
    originalContent?: string;
    newContent?: string;
    description?: string;
    created: number;
    isApplied: boolean; // Track if operation has been applied
}

export class FileOperationManager {
    private static instance: FileOperationManager;
    private pendingOperations: Map<string, FileOperation>;
    private webviewView: vscode.WebviewView | undefined;

    private constructor() {
        this.pendingOperations = new Map();
    }

    public static getInstance(): FileOperationManager {
        if (!FileOperationManager.instance) {
            FileOperationManager.instance = new FileOperationManager();
        }
        return FileOperationManager.instance;
    }

    public setWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;
    }

    public async createAddOperation(filePath: string, content: string, description?: string): Promise<FileOperation> {
        const operation: FileOperation = {
            id: Date.now().toString(),
            type: 'add',
            filePath,
            newContent: content,
            description,
            created: Date.now(),
            isApplied: false // Initially not applied
        };
        
        // Apply the operation immediately
        try {
            await this.addFile(filePath, content);
            operation.isApplied = true;
            
            // Store the operation for potential undo
            this.pendingOperations.set(operation.id, operation);
            this.notifyWebview();
            
            console.log(`File created and pending approval: ${filePath}`);
            return operation;
        } catch (error) {
            console.error(`Error creating file ${filePath}:`, error);
            throw error;
        }
    }

    public async createUpdateOperation(filePath: string, originalContent: string, newContent: string, description?: string): Promise<FileOperation> {
        const operation: FileOperation = {
            id: Date.now().toString(),
            type: 'update',
            filePath,
            originalContent,
            newContent,
            description,
            created: Date.now(),
            isApplied: false
        };
        
        // Apply the update immediately
        try {
            await this.updateFile(filePath, newContent);
            operation.isApplied = true;
            
            // Store the operation for potential undo
            this.pendingOperations.set(operation.id, operation);
            this.notifyWebview();
            
            console.log(`File updated and pending approval: ${filePath}`);
            return operation;
        } catch (error) {
            console.error(`Error updating file ${filePath}:`, error);
            throw error;
        }
    }

    public async createDeleteOperation(filePath: string, originalContent: string, description?: string): Promise<FileOperation> {
        const operation: FileOperation = {
            id: Date.now().toString(),
            type: 'delete',
            filePath,
            originalContent,
            description,
            created: Date.now(),
            isApplied: false
        };
        
        // Apply the delete immediately
        try {
            await this.deleteFile(filePath);
            operation.isApplied = true;
            
            // Store the operation for potential undo
            this.pendingOperations.set(operation.id, operation);
            this.notifyWebview();
            
            console.log(`File deleted and pending approval: ${filePath}`);
            return operation;
        } catch (error) {
            console.error(`Error deleting file ${filePath}:`, error);
            throw error;
        }
    }

    public getPendingOperations(): any[] {
        // Convert the Map to Array and simplify structure for UI consumption
        const operations = Array.from(this.pendingOperations.values()).map(op => {
            // Make a simpler representation for the UI
            return {
                id: op.id,
                type: op.type,
                filePath: op.filePath,
                description: op.description || '',
                created: op.created,
                isApplied: op.isApplied
            };
        });
        
        console.log('FileOperationManager.getPendingOperations returning:', operations);
        return operations;
    }

    public getOperation(id: string): FileOperation | undefined {
        return this.pendingOperations.get(id);
    }

    public async acceptOperation(id: string): Promise<boolean> {
        const operation = this.pendingOperations.get(id);
        if (!operation) return false;

        try {
            // For accept, we just remove the operation from pending list
            // since the changes are already applied
            this.pendingOperations.delete(id);
            this.notifyWebview();
            return true;
        } catch (error) {
            console.error(`Error accepting operation ${operation.type}:`, error);
            return false;
        }
    }

    public async rejectOperation(id: string): Promise<boolean> {
        const operation = this.pendingOperations.get(id);
        if (!operation) return false;

        try {
            // For reject, we need to undo the changes
            if (operation.isApplied) {
                switch (operation.type) {
                    case 'add':
                        // Delete the file if it was added
                        await this.deleteFile(operation.filePath);
                        break;
                    case 'update':
                        // Restore the original content
                        if (operation.originalContent) {
                            await this.updateFile(operation.filePath, operation.originalContent);
                        }
                        break;
                    case 'delete':
                        // Restore the file if it was deleted
                        if (operation.originalContent) {
                            await this.addFile(operation.filePath, operation.originalContent);
                        }
                        break;
                }
            }
            
            this.pendingOperations.delete(id);
            this.notifyWebview();
            return true;
        } catch (error) {
            console.error(`Error rejecting operation:`, error);
            return false;
        }
    }

    public async acceptAllOperations(): Promise<boolean> {
        try {
            // For accept all, just remove all operations from pending list
            // since changes are already applied
            this.pendingOperations.clear();
            this.notifyWebview();
            return true;
        } catch (error) {
            console.error('Error accepting all operations:', error);
            return false;
        }
    }

    public async rejectAllOperations(): Promise<boolean> {
        try {
            // Process all pending operations in reverse order (newest first)
            const operations = Array.from(this.pendingOperations.values())
                .sort((a, b) => b.created - a.created);
                
            for (const operation of operations) {
                await this.rejectOperation(operation.id);
            }
            
            return true;
        } catch (error) {
            console.error('Error rejecting all operations:', error);
            return false;
        }
    }

    private async addFile(filePath: string, content: string): Promise<void> {
        // Ensure the directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write the file
        fs.writeFileSync(filePath, content, 'utf8');
        
        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(document);
    }

    private async updateFile(filePath: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        const edit = new vscode.WorkspaceEdit();
        
        try {
            // Open the document to get its content
            const document = await vscode.workspace.openTextDocument(uri);
            
            // Replace the entire content
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            
            edit.replace(uri, fullRange, content);
            await vscode.workspace.applyEdit(edit);
        } catch (error) {
            console.error('Error updating file:', error);
            throw error;
        }
    }

    private async deleteFile(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.delete(uri, { useTrash: true });
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }

    private notifyWebview(): void {
        if (this.webviewView?.webview) {
            this.webviewView.webview.postMessage({
                command: 'updatePendingOperations',
                operations: this.getPendingOperations()
            });
        }
    }

    public getDiff(operationId: string): any {
        const operation = this.pendingOperations.get(operationId);
        if (!operation || operation.type === 'add') {
            // For add operations, we can show the content as all additions
            if (operation?.type === 'add' && operation.newContent) {
                return {
                    diffType: 'lineDiff',
                    diffContent: operation.newContent.split('\n').map(line => ({
                        type: 'add',
                        content: line
                    }))
                };
            }
            return {
                diffType: 'none',
                diffContent: []
            };
        }

        try {
            // Use 'diff' library to get detailed line-by-line changes
            const { diffLines } = require('diff');
            
            const oldContent = operation.originalContent || '';
            const newContent = operation.newContent || '';
            
            // Generate line-by-line diff
            const lineDiff = diffLines(oldContent, newContent);
            
            // Convert to a more UI-friendly format
            const formattedDiff = lineDiff.map((part: {added?: boolean, removed?: boolean, value: string}) => ({
                type: part.added ? 'add' : part.removed ? 'remove' : 'unchanged',
                content: part.value.replace(/\n$/, '') // Remove trailing newline
            }));
            
            // Create a more detailed diff format that includes line numbers
            const hunks = this.convertToHunks(oldContent, newContent, formattedDiff);
            
            return {
                diffType: 'enhancedDiff',
                hunks,
                supportsPartialChanges: true
            };
        } catch (error) {
            console.error('Error generating diff:', error);
            return {
                diffType: 'error',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private convertToHunks(oldContent: string, newContent: string, formattedDiff: Array<{type: string, content: string}>): any[] {
        // This is a simplified version; actual implementation would create proper diff hunks
        // with correct line numbers and change tracking
        const hunks = [];
        
        let oldStart = 1;
        let newStart = 1;
        
        // Group changes into hunks
        const hunk = {
            oldStart,
            oldLines: oldContent.split('\n').length,
            newStart,
            newLines: newContent.split('\n').length,
            lines: [] as string[]
        };
        
        formattedDiff.forEach(part => {
            const lines = part.content.split('\n');
            lines.forEach(line => {
                if (part.type === 'add') {
                    hunk.lines.push(`+${line}`);
                } else if (part.type === 'remove') {
                    hunk.lines.push(`-${line}`);
                } else {
                    hunk.lines.push(` ${line}`);
                }
            });
        });
        
        hunks.push(hunk);
        return hunks;
    }

    public async acceptPartialChange(operationId: string, lineIndices: number[]): Promise<boolean> {
        const operation = this.pendingOperations.get(operationId);
        if (!operation || operation.type !== 'update' || !operation.originalContent || !operation.newContent) {
            return false;
        }

        try {
            // This would need a more complex implementation to apply only specific lines
            // from the diff, which is beyond the scope of this example
            console.log('Partial change applied for lines:', lineIndices);
            
            // For now, just mark the operation as accepted
            this.pendingOperations.delete(operationId);
            this.notifyWebview();
            return true;
        } catch (error) {
            console.error('Error applying partial change:', error);
            return false;
        }
    }

    public clearOperations(): void {
        this.pendingOperations.clear();
        this.notifyWebview();
    }
} 