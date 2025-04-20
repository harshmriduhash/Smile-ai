import * as vscode from 'vscode';

export class SettingsTreeProvider implements vscode.TreeDataProvider<SettingItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SettingItem | undefined | null | void> = new vscode.EventEmitter<SettingItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SettingItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        // Ayar değişikliklerini dinle
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('smile-ai')) {
                this.refresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SettingItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SettingItem): Thenable<SettingItem[]> {
        if (!element) {
            // Ana kategoriler
            return Promise.resolve([
                new SettingItem(
                    'Appearance',
                    'Görünüm ayarları',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'appearance'
                ),
                new SettingItem(
                    'Behavior',
                    'Davranış ayarları',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'behavior'
                ),
                new SettingItem(
                    'Shortcuts',
                    'Kısayol ayarları',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'shortcuts'
                )
            ]);
        }

        const config = vscode.workspace.getConfiguration('smile-ai');

        switch (element.category) {
            case 'appearance':
                const appearance = config.get('appearance') as any;
                return Promise.resolve([
                    new SettingItem(
                        'Theme',
                        `Current: ${appearance?.theme || 'system'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'appearance.theme',
                        {
                            command: 'smile-ai.changeSetting',
                            title: 'Change Theme',
                            arguments: ['appearance.theme']
                        }
                    ),
                    new SettingItem(
                        'Font Size',
                        `Current: ${appearance?.fontSize || 14}`,
                        vscode.TreeItemCollapsibleState.None,
                        'appearance.fontSize',
                        {
                            command: 'smile-ai.changeSetting',
                            title: 'Change Font Size',
                            arguments: ['appearance.fontSize']
                        }
                    ),
                    new SettingItem(
                        'Font Family',
                        `Current: ${appearance?.fontFamily || 'system-ui'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'appearance.fontFamily',
                        {
                            command: 'smile-ai.changeSetting',
                            title: 'Change Font Family',
                            arguments: ['appearance.fontFamily']
                        }
                    )
                ]);

            case 'behavior':
                const behavior = config.get('behavior') as any;
                return Promise.resolve([
                    new SettingItem(
                        'Auto Complete',
                        `${behavior?.autoComplete ? 'Enabled' : 'Disabled'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'behavior.autoComplete',
                        {
                            command: 'smile-ai.toggleSetting',
                            title: 'Toggle Auto Complete',
                            arguments: ['behavior.autoComplete']
                        }
                    ),
                    new SettingItem(
                        'Inline Completion',
                        `${behavior?.inlineCompletion ? 'Enabled' : 'Disabled'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'behavior.inlineCompletion',
                        {
                            command: 'smile-ai.toggleSetting',
                            title: 'Toggle Inline Completion',
                            arguments: ['behavior.inlineCompletion']
                        }
                    ),
                    new SettingItem(
                        'Auto Import',
                        `${behavior?.autoImport ? 'Enabled' : 'Disabled'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'behavior.autoImport',
                        {
                            command: 'smile-ai.toggleSetting',
                            title: 'Toggle Auto Import',
                            arguments: ['behavior.autoImport']
                        }
                    )
                ]);

            case 'shortcuts':
                const shortcuts = config.get('shortcuts') as any;
                return Promise.resolve([
                    new SettingItem(
                        'Toggle Assistant',
                        `Current: ${shortcuts?.toggleAssistant || 'ctrl+shift+space'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'shortcuts.toggleAssistant',
                        {
                            command: 'smile-ai.changeShortcut',
                            title: 'Change Shortcut',
                            arguments: ['shortcuts.toggleAssistant']
                        }
                    ),
                    new SettingItem(
                        'Accept Suggestion',
                        `Current: ${shortcuts?.acceptSuggestion || 'tab'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'shortcuts.acceptSuggestion',
                        {
                            command: 'smile-ai.changeShortcut',
                            title: 'Change Shortcut',
                            arguments: ['shortcuts.acceptSuggestion']
                        }
                    ),
                    new SettingItem(
                        'Next Suggestion',
                        `Current: ${shortcuts?.nextSuggestion || 'alt+]'}`,
                        vscode.TreeItemCollapsibleState.None,
                        'shortcuts.nextSuggestion',
                        {
                            command: 'smile-ai.changeShortcut',
                            title: 'Change Shortcut',
                            arguments: ['shortcuts.nextSuggestion']
                        }
                    ),
                    new SettingItem(
                        'Previous Suggestion',
                        `Current: ${shortcuts?.previousSuggestion || 'alt+['}`,
                        vscode.TreeItemCollapsibleState.None,
                        'shortcuts.previousSuggestion',
                        {
                            command: 'smile-ai.changeShortcut',
                            title: 'Change Shortcut',
                            arguments: ['shortcuts.previousSuggestion']
                        }
                    )
                ]);

            default:
                return Promise.resolve([]);
        }
    }
}

class SettingItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly category: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = `${label}: ${description}`;
        this.contextValue = 'setting';

        // Kategori ikonları
        switch (category.split('.')[0]) {
            case 'appearance':
                this.iconPath = new vscode.ThemeIcon('paintcan');
                break;
            case 'behavior':
                this.iconPath = new vscode.ThemeIcon('settings-gear');
                break;
            case 'shortcuts':
                this.iconPath = new vscode.ThemeIcon('keyboard');
                break;
        }
    }
} 