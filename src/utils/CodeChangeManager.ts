import * as vscode from 'vscode';
import { diffLines } from 'diff';

export interface CodeChange {
    id: string;
    file: string;
    originalContent: string;
    newContent: string;
    created: number;
}

export class CodeChangeManager {
    private static instance: CodeChangeManager;
    private changes: Map<string, CodeChange>;

    private constructor() {
        this.changes = new Map();
    }

    public static getInstance(): CodeChangeManager {
        if (!CodeChangeManager.instance) {
            CodeChangeManager.instance = new CodeChangeManager();
        }
        return CodeChangeManager.instance;
    }

    public createChange(file: string, originalContent: string, newContent: string): CodeChange {
        const change: CodeChange = {
            id: Date.now().toString(),
            file,
            originalContent,
            newContent,
            created: Date.now()
        };
        
        this.changes.set(change.id, change);
        return change;
    }

    public getChange(id: string): CodeChange | undefined {
        return this.changes.get(id);
    }

    public getDiff(changeId: string): { added: boolean; removed: boolean; value: string; }[] {
        const change = this.changes.get(changeId);
        if (!change) return [];

        return diffLines(change.originalContent, change.newContent);
    }

    public async applyChange(changeId: string): Promise<boolean> {
        const change = this.changes.get(changeId);
        if (!change) return false;

        try {
            const uri = vscode.Uri.file(change.file);
            const edit = new vscode.WorkspaceEdit();
            
            // Tüm dosya içeriğini değiştir
            const document = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            
            edit.replace(uri, fullRange, change.newContent);
            
            // Değişiklikleri uygula
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                this.changes.delete(changeId);
            }
            return success;
        } catch (error) {
            console.error('Error applying change:', error);
            return false;
        }
    }

    public async revertChange(changeId: string): Promise<boolean> {
        const change = this.changes.get(changeId);
        if (!change) return false;

        try {
            const uri = vscode.Uri.file(change.file);
            const edit = new vscode.WorkspaceEdit();
            
            // Orijinal içeriğe geri dön
            const document = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            
            edit.replace(uri, fullRange, change.originalContent);
            
            // Değişiklikleri uygula
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                this.changes.delete(changeId);
            }
            return success;
        } catch (error) {
            console.error('Error reverting change:', error);
            return false;
        }
    }

    public getPreviewContent(changeId: string): string {
        const change = this.changes.get(changeId);
        if (!change) return '';

        const diff = this.getDiff(changeId);
        let preview = '';
        
        diff.forEach(part => {
            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
            preview += part.value.split('\n')
                .map(line => prefix + line)
                .join('\n');
        });

        return preview;
    }

    public clearChanges(): void {
        this.changes.clear();
    }
} 