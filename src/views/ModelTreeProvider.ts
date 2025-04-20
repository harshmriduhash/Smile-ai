import * as vscode from 'vscode';
import { ModelManager, AIModel } from '../utils/ModelManager';

export class ModelTreeProvider implements vscode.TreeDataProvider<ModelTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ModelTreeItem | undefined | null | void> = new vscode.EventEmitter<ModelTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModelTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private modelManager: ModelManager) {
        // Model değişikliklerini dinle
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('smile-ai.models') || 
                e.affectsConfiguration('smile-ai.activeModel')) {
                this.refresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ModelTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ModelTreeItem): Thenable<ModelTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const models = this.modelManager.getModels();
            const activeModel = this.modelManager.getActiveModel();

            return Promise.resolve(models.map(model => {
                const treeItem = new ModelTreeItem(
                    model,
                    model.name === activeModel?.name,
                    vscode.TreeItemCollapsibleState.None
                );

                treeItem.contextValue = 'aiModel';
                if (model.name === activeModel?.name) {
                    treeItem.contextValue += '.active';
                }

                return treeItem;
            }));
        }
    }
}

class ModelTreeItem extends vscode.TreeItem {
    constructor(
        public readonly model: AIModel,
        public readonly isActive: boolean,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(model.name, collapsibleState);

        this.tooltip = `${model.provider} - ${model.modelName}
Endpoint: ${model.apiEndpoint}
Max Tokens: ${model.maxTokens || 'default'}
Temperature: ${model.temperature || 'default'}`;

        this.description = isActive ? '(Active)' : '';

        this.iconPath = new vscode.ThemeIcon(
            isActive ? 'check' : 'circle-outline'
        );
    }
} 