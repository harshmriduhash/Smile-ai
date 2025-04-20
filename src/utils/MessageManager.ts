import * as vscode from 'vscode';
import { AIMessage } from '../ai-engine/types';

export enum PanelType {
    CHAT = 'chat',
    COMPOSER = 'composer'
}

export interface MessageSession {
    id: string;
    title: string;
    panelType: PanelType;
    messages: AIMessage[];
    createdAt: number;
}

export type MessageUpdateListener = (panelType: PanelType) => void;

export class MessageManager {
    private static instances: { [key in PanelType]?: MessageManager } = {};
    private sessions: Map<string, MessageSession>;
    private activeSessionId: string | undefined;
    private messageUpdateListeners: Set<MessageUpdateListener> = new Set();
    private readonly panelType: PanelType;

    private constructor(
        private context: vscode.ExtensionContext,
        panelType: PanelType
    ) {
        this.panelType = panelType;
        this.sessions = new Map();
        this.loadSessions();
    }

    public static getInstance(context: vscode.ExtensionContext, panelType: PanelType): MessageManager {
        if (!this.instances[panelType]) {
            this.instances[panelType] = new MessageManager(context, panelType);
        }
        return this.instances[panelType]!;
    }

    public createSession(title: string): MessageSession {
        const session: MessageSession = {
            id: Date.now().toString(),
            title,
            panelType: this.panelType,
            messages: [],
            createdAt: Date.now()
        };
        
        this.sessions.set(session.id, session);
        this.activeSessionId = session.id;
        this.saveSessions();
        this.notifyListeners();
        return session;
    }

    public getSession(sessionId: string): MessageSession | undefined {
        return this.sessions.get(sessionId);
    }

    public getActiveSession(): MessageSession | undefined {
        if (!this.activeSessionId || !this.sessions.has(this.activeSessionId)) {
            const newSession = this.createSession(`New ${this.panelType} Session`);
            this.activeSessionId = newSession.id;
            return newSession;
        }
        
        const session = this.sessions.get(this.activeSessionId);
        // Eğer oturum farklı bir panel tipine aitse, yeni oturum oluştur
        if (session && session.panelType !== this.panelType) {
            const newSession = this.createSession(`New ${this.panelType} Session`);
            this.activeSessionId = newSession.id;
            return newSession;
        }
        
        return session;
    }

    public addMessageUpdateListener(listener: MessageUpdateListener): void {
        this.messageUpdateListeners.add(listener);
    }

    public removeMessageUpdateListener(listener: MessageUpdateListener): void {
        this.messageUpdateListeners.delete(listener);
    }

    private notifyListeners(): void {
        this.messageUpdateListeners.forEach(listener => listener(this.panelType));
    }

    public addMessage(message: AIMessage): void {
        const session = this.getActiveSession();
        if (session) {
            session.messages.push(message);
            this.saveSessions();
            this.notifyListeners();
        }
    }

    public getAllSessions(): MessageSession[] {
        // Sadece bu panel tipine ait oturumları döndür
        return Array.from(this.sessions.values())
            .filter(session => session.panelType === this.panelType)
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    public clearSession(): void {
        const session = this.getActiveSession();
        if (session) {
            session.messages = [];
            this.saveSessions();
            this.notifyListeners();
        }
    }

    public setActiveSession(sessionId: string): void {
        if (this.sessions.has(sessionId)) {
            this.activeSessionId = sessionId;
            this.notifyListeners();
        }
    }

    private getStorageKey(key: string): string {
        return `${this.panelType}_${key}`;
    }

    private saveSessions(): void {
        const storageKey = this.getStorageKey('sessions');
        const activeSessionKey = this.getStorageKey('activeSessionId');
        
        this.context.globalState.update(storageKey, Array.from(this.sessions.entries()));
        this.context.globalState.update(activeSessionKey, this.activeSessionId);
    }

    private loadSessions(): void {
        const storageKey = this.getStorageKey('sessions');
        const activeSessionKey = this.getStorageKey('activeSessionId');
        
        const savedSessions = this.context.globalState.get<[string, MessageSession][]>(storageKey, []);
        const savedActiveSessionId = this.context.globalState.get<string>(activeSessionKey);
        
        this.sessions = new Map(savedSessions);
        this.activeSessionId = savedActiveSessionId;

        // Eğer hiç oturum yoksa veya aktif oturum geçersizse, yeni bir oturum oluştur
        if (this.sessions.size === 0 || !this.activeSessionId || !this.sessions.has(this.activeSessionId)) {
            const newSession = this.createSession(`New ${this.panelType} Session`);
            this.activeSessionId = newSession.id;
        }
    }

    public static clearInstance(panelType: PanelType): void {
        delete this.instances[panelType];
    }
} 