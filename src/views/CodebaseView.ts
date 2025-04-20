import * as vscode from 'vscode';

export class CodebaseView implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return Promise.resolve([]);
        }

        if (!element) {
            return Promise.resolve(this.getWorkspaceItems());
        }

        return Promise.resolve([]);
    }

    private getWorkspaceItems(): vscode.TreeItem[] {
        const items: vscode.TreeItem[] = [];
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const item = new vscode.TreeItem(folder.name, vscode.TreeItemCollapsibleState.Collapsed);
                item.resourceUri = folder.uri;
                item.contextValue = 'workspaceFolder';
                items.push(item);
            }
        }
        return items;
    }
} 