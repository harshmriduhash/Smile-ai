import * as vscode from 'vscode';
import { AIMessage } from '../ai-engine/types';

export interface ChatSession {
    id: string;
    title: string;
    messages: AIMessage[];
    created: number;
    lastUpdated: number;
}

export class ChatHistoryManager {
    private sessions: Map<string, ChatSession> = new Map();
    private static instance: ChatHistoryManager;

    constructor(private context: vscode.ExtensionContext) {
        this.loadSessions();
    }

    public static getInstance(context?: vscode.ExtensionContext): ChatHistoryManager {
        if (!ChatHistoryManager.instance && context) {
            ChatHistoryManager.instance = new ChatHistoryManager(context);
        }
        return ChatHistoryManager.instance;
    }

    private async loadSessions() {
        const sessionsData = this.context.globalState.get<{ [key: string]: ChatSession }>('chatSessions', {});
        this.sessions = new Map(Object.entries(sessionsData));
    }

    private async saveSessions() {
        const sessionsData = Object.fromEntries(this.sessions.entries());
        await this.context.globalState.update('chatSessions', sessionsData);
    }

    public async getSessions(): Promise<Map<string, ChatSession>> {
        return this.sessions;
    }

    public async getSession(id: string): Promise<ChatSession | undefined> {
        return this.sessions.get(id);
    }

    public async addSession(session: ChatSession): Promise<void> {
        this.sessions.set(session.id, session);
        await this.saveSessions();
    }

    public async deleteSession(id: string): Promise<void> {
        this.sessions.delete(id);
        await this.saveSessions();
    }

    public async addMessage(sessionId: string, message: AIMessage): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.messages.push(message);
        session.lastUpdated = Date.now();
        await this.saveSessions();
    }

    public async clearSessions(): Promise<void> {
        this.sessions.clear();
        await this.saveSessions();
    }

    public createSession(title: string): ChatSession {
        const session: ChatSession = {
            id: Date.now().toString(),
            title,
            messages: [],
            created: Date.now(),
            lastUpdated: Date.now()
        };
        
        this.sessions.set(session.id, session);
        this.saveSessions();
        return session;
    }

    public getAllSessions(): ChatSession[] {
        return Array.from(this.sessions.values())
            .sort((a, b) => b.lastUpdated - a.lastUpdated);
    }

    public async renameSession(sessionId: string, newTitle: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.title = newTitle;
        session.lastUpdated = Date.now();
        await this.saveSessions();
    }

    public async updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.title = newTitle;
        session.lastUpdated = Date.now();
        await this.saveSessions();
    }
} 