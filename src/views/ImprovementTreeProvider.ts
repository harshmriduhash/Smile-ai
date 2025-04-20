import * as vscode from 'vscode';
import { ImprovementManager } from '../improvements/ImprovementManager';

/**
 * Provides the data for the Future Improvements tree view.
 */
export class ImprovementTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    // Event emitter for tree data changes
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private improvementManager: ImprovementManager) {
        // Listen for changes in the improvement manager
        this.improvementManager.onDidChangeNotes(() => {
            this.refresh();
        });
    }

    /**
     * Refreshes the entire tree view.
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the tree item representation (label, icon, collapsible state) for a note.
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            return Promise.resolve(this.getImprovementItems());
        }
        return Promise.resolve([]);
    }

    private getImprovementItems(): vscode.TreeItem[] {
        const notes = this.improvementManager.getNotes();
        return notes.map(note => {
            const item = new vscode.TreeItem(note.content, vscode.TreeItemCollapsibleState.None);
            item.description = note.context.priority;
            item.tooltip = `File: ${note.context.file}\nStatus: ${note.context.status}`;
            item.contextValue = 'improvementNote';
            item.command = {
                command: 'smile-ai.openImprovementDetails',
                title: 'Open Improvement Details',
                arguments: [note]
            };
            return item;
        });
    }
} 