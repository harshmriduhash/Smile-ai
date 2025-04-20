import * as vscode from 'vscode';

export type ImprovementNoteStatus = 'pending' | 'done' | 'dismissed';
export type ImprovementNotePriority = 'low' | 'medium' | 'high' | 'none';

export interface ImprovementNoteContext {
    file: string;
    selection: {
        startLine: number;
        startChar: number;
        endLine: number;
        endChar: number;
    };
    status: ImprovementNoteStatus;
    priority: ImprovementNotePriority;
    timestamp: number;
}

export interface ImprovementNote {
    id: string;
    content: string;
    context: ImprovementNoteContext;
}

export class ImprovementManager {
    private static instance: ImprovementManager;
    private notes: Map<string, ImprovementNote> = new Map();
    private _onDidChangeNotes = new vscode.EventEmitter<void>();
    readonly onDidChangeNotes = this._onDidChangeNotes.event;

    private constructor() {}

    public static getInstance(): ImprovementManager {
        if (!ImprovementManager.instance) {
            ImprovementManager.instance = new ImprovementManager();
        }
        return ImprovementManager.instance;
    }

    public async addNote(content: string, context: ImprovementNoteContext): Promise<void> {
        const id = Date.now().toString();
        this.notes.set(id, { id, content, context });
        this._onDidChangeNotes.fire();
    }

    public getNotes(): ImprovementNote[] {
        return Array.from(this.notes.values());
    }

    public updateNoteStatus(id: string, status: ImprovementNoteStatus): void {
        const note = this.notes.get(id);
        if (note) {
            note.context.status = status;
            this._onDidChangeNotes.fire();
        }
    }

    public updateNotePriority(id: string, priority: ImprovementNotePriority): void {
        const note = this.notes.get(id);
        if (note) {
            note.context.priority = priority;
            this._onDidChangeNotes.fire();
        }
    }
} 