import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import { ImprovementNote, ImprovementNoteStatus, ImprovementNoteContext } from '../agent/types';

const IMPROVEMENT_NOTES_KEY = 'smileai.improvementNotes'; // Key for workspaceState

/**
 * Manages storing and retrieving future improvement notes using workspaceState.
 */
export class ImprovementManager {
    private static instance: ImprovementManager;
    private context: vscode.ExtensionContext;

    // Event emitter for changes
    private _onDidChangeNotes: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeNotes: vscode.Event<void> = this._onDidChangeNotes.event;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Gets the singleton instance of the ImprovementManager.
     * Needs the extension context for workspaceState access.
     */
    public static initialize(context: vscode.ExtensionContext): void {
        if (!ImprovementManager.instance) {
            ImprovementManager.instance = new ImprovementManager(context);
        }
    }

    /**
     * Gets the singleton instance. Throws error if not initialized.
     */
    public static getInstance(): ImprovementManager {
        if (!ImprovementManager.instance) {
            throw new Error('ImprovementManager has not been initialized. Call initialize() first.');
        }
        return ImprovementManager.instance;
    }

    /**
     * Retrieves all improvement notes from workspaceState.
     */
    public getAllNotes(): ImprovementNote[] {
        return this.context.workspaceState.get<ImprovementNote[]>(IMPROVEMENT_NOTES_KEY, []);
    }

    /**
     * Retrieves notes filtered by status.
     */
    public getNotesByStatus(status: ImprovementNoteStatus): ImprovementNote[] {
        const allNotes = this.getAllNotes();
        return allNotes.filter(note => note.status === status);
    }

    /**
     * Adds a new improvement note.
     * @param description The description of the note.
     * @param context Optional context (file path, selection).
     * @param bypassConfirmation If true, skips user confirmation (for AI suggestions).
     * @param priority Optional priority for the note.
     * @returns The newly created note.
     */
    public async addNote(
        description: string,
        context?: ImprovementNoteContext,
        bypassConfirmation: boolean = false,
        priority?: 'high' | 'medium' | 'low' // Add priority parameter
    ): Promise<ImprovementNote> {
        if (!bypassConfirmation) {
            // Basic confirmation for manually added notes
            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Add this improvement note? "${description.substring(0,50)}..."`
            });
            if (confirm !== 'Yes') {
                throw new Error('Note addition cancelled by user.');
            }
        }

        const now = new Date().toISOString();
        const newNote: ImprovementNote = {
            id: uuidv4(), // Generate a unique ID
            description: description,
            status: ImprovementNoteStatus.PENDING,
            context: context,
            createdAt: now,
            updatedAt: now,
            priority: priority // Assign priority
        };

        const allNotes = this.getAllNotes();
        allNotes.push(newNote);
        await this.context.workspaceState.update(IMPROVEMENT_NOTES_KEY, allNotes);
        console.log('Added improvement note:', newNote.id);
        this._onDidChangeNotes.fire(); // Fire event
        return newNote;
    }

    /**
     * Updates the status of an existing note.
     */
    public async updateNoteStatus(noteId: string, newStatus: ImprovementNoteStatus): Promise<boolean> {
        const allNotes = this.getAllNotes();
        const noteIndex = allNotes.findIndex(note => note.id === noteId);

        if (noteIndex === -1) {
            console.warn(`Improvement note with ID ${noteId} not found for status update.`);
            return false;
        }

        allNotes[noteIndex].status = newStatus;
        await this.context.workspaceState.update(IMPROVEMENT_NOTES_KEY, allNotes);
        console.log(`Updated status for note ${noteId} to ${newStatus}`);
        this._onDidChangeNotes.fire(); // Fire event
        return true;
    }

    /**
     * Removes a note (e.g., after being dismissed or handled).
     * Potentially useful, but maybe updating status is enough.
     */
    public async removeNote(noteId: string): Promise<boolean> {
        let allNotes = this.getAllNotes();
        const initialLength = allNotes.length;
        allNotes = allNotes.filter(note => note.id !== noteId);

        if (allNotes.length === initialLength) {
             console.warn(`Improvement note with ID ${noteId} not found for removal.`);
            return false;
        }

        await this.context.workspaceState.update(IMPROVEMENT_NOTES_KEY, allNotes);
        console.log(`Removed note ${noteId}`);
        this._onDidChangeNotes.fire(); // Fire event
        return true;
    }
} 