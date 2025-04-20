import * as vscode from 'vscode';
import { BaseExecutor } from './BaseExecutor';
import { AIEngine } from '../../ai-engine/AIEngine';
import { Task, TaskType, ModificationPlan, TaskExecutor, TaskResult } from '../types';
import { AIMessage } from '../../ai-engine/types';

export interface ExecutionContext {
    currentFile?: string;
    selection?: {
        start: number;
        end: number;
    };
    selectedText?: string;
}

export class CodeModificationExecutor extends BaseExecutor implements TaskExecutor {
    constructor(
        protected readonly aiEngine: AIEngine
    ) {
        super(aiEngine);
    }

    canHandle(task: Task): boolean {
        return task.type === TaskType.CODE_MODIFICATION;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            const plan = await this.planModification(task);
            if (!plan) {
                return { success: false, error: 'Failed to create modification plan' };
            }

            const success = await this.applyModification(plan);
            return { success, data: plan };
        } catch (error) {
            console.error('Failed to execute code modification:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async planModification(task: Task): Promise<ModificationPlan> {
        const messages: AIMessage[] = [{
            role: 'user',
            content: task.description,
            timestamp: Date.now()
        }];

        const response = await this.aiEngine.generateResponse({
            messages,
            systemPrompt: this.getModificationSystemPrompt(),
            context: {
                currentFile: task.metadata?.fileContext?.path,
                selectedText: task.metadata?.selectedText
            }
        });

        // Parse the response into a modification plan
        return {
            description: response.message,
            modifications: []  // You'll need to implement the actual parsing logic
        };
    }

    private async applyModification(plan: ModificationPlan): Promise<boolean> {
        const workspaceEdit = new vscode.WorkspaceEdit();

        for (const mod of plan.modifications) {
            const uri = vscode.Uri.file(mod.location.filePath);
            
            switch (mod.type) {
                case 'insert':
                    workspaceEdit.insert(uri, new vscode.Position(mod.location.startLine - 1, 0), mod.code);
                    break;
                case 'replace':
                    const range = new vscode.Range(
                        new vscode.Position(mod.location.startLine - 1, 0),
                        new vscode.Position(mod.location.endLine - 1, Number.MAX_SAFE_INTEGER)
                    );
                    workspaceEdit.replace(uri, range, mod.code);
                    break;
                case 'delete':
                    const deleteRange = new vscode.Range(
                        new vscode.Position(mod.location.startLine - 1, 0),
                        new vscode.Position(mod.location.endLine - 1, Number.MAX_SAFE_INTEGER)
                    );
                    workspaceEdit.delete(uri, deleteRange);
                    break;
            }
        }

        await vscode.workspace.applyEdit(workspaceEdit);
        return true;
    }

    private getModificationSystemPrompt(): string {
        return `You are a code modification assistant. Analyze the code and suggest specific changes.
                Format your response as a structured modification plan with clear file locations and changes.`;
    }
}
