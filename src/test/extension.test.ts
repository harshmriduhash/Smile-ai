/// <reference types="jest" />
import * as vscode from 'vscode';
import { AIEngine } from '../ai-engine/AIEngine';
import { TaskManager } from '../agent/TaskManager';
import { TaskPlanner } from '../agent/TaskPlanner';
import { Task, TaskType, TaskStatus, TaskPriority } from '../agent/types';

describe('Smile AI Extension Test Suite', () => {
    let aiEngine: AIEngine;
    let taskManager: TaskManager;
    let taskPlanner: TaskPlanner;

    beforeEach(() => {
        // Test öncesi hazırlık
        const config = {
            provider: {
                name: 'ollama',
                modelName: 'codellama',
                apiEndpoint: 'http://localhost:11434'
            },
            maxTokens: 2048,
            temperature: 0.7
        };

        aiEngine = new AIEngine(config);
        taskManager = new TaskManager();
        taskPlanner = new TaskPlanner(aiEngine);
    });

    it('Extension aktivasyonu', async () => {
        // Extension yüklü mü kontrol et
        const extension = vscode.extensions.getExtension('smile-ai');
        expect(extension).toBeTruthy();

        // Extension aktif mi kontrol et
        if (extension) {
            await extension.activate();
            expect(extension.isActive).toBeTruthy();
        }
    });

    it('AI Engine yapılandırması', () => {
        const config = (aiEngine as any).config;
        expect(config.provider.name).toBe('ollama');
        expect(config.provider.modelName).toBe('codellama');
        expect(config.maxTokens).toBe(2048);
        expect(config.temperature).toBe(0.7);
    });

    it('Task yönetimi', () => {
        // Test görevi oluştur
        const task: Task = {
            id: '1',
            type: TaskType.CODE_ANALYSIS,
            description: 'Test task',
            status: TaskStatus.PENDING,
            priority: TaskPriority.MEDIUM,
            created: Date.now(),
            updated: Date.now()
        };

        // Görevi ekle
        taskManager.addTask(task);
        expect(taskManager.getTask(task.id)).toBe(task);

        // Görevi güncelle
        taskManager.updateTask(task.id, { status: TaskStatus.COMPLETED });
        const updatedTask = taskManager.getTask(task.id);
        expect(updatedTask?.status).toBe(TaskStatus.COMPLETED);

        // Görevi iptal et
        taskManager.cancelTask(task.id);
        const cancelledTask = taskManager.getTask(task.id);
        expect(cancelledTask?.status).toBe(TaskStatus.CANCELLED);
    });

    it('Task planlama', async () => {
        // Görev planı oluştur
        const task = await taskPlanner.planTask('Analyze code for bugs');
        
        expect(task.id).toBeTruthy();
        expect(task.status).toBe(TaskStatus.PENDING);
        expect(task.created).toBeGreaterThan(0);
        expect(task.updated).toBeGreaterThan(0);
    });

    it('Komut kaydı', async () => {
        // Tüm komutları al
        const commands = await vscode.commands.getCommands();
        
        // Extension komutlarını kontrol et
        const extensionCommands = [
            'smile-ai.startChat',
            'smile-ai.startComposer',
            'smile-ai.analyzeCode',
            'smile-ai.generateTests',
            'smile-ai.refactorCode',
            'smile-ai.explainCode'
        ];

        for (const cmd of extensionCommands) {
            expect(commands).toContain(cmd);
        }
    });

    it('Hata yönetimi', async () => {
        // Geçersiz yapılandırma ile AI Engine oluştur
        const invalidConfig = {
            provider: {
                name: 'invalid',
                modelName: 'invalid',
                apiEndpoint: 'invalid'
            },
            maxTokens: -1,
            temperature: 2.0
        };

        const invalidEngine = new AIEngine(invalidConfig);
        await expect(invalidEngine.generateResponse({
            messages: [{ role: 'user', content: 'test' }]
        })).rejects.toThrow();
    });

    it('WebView panel oluşturma', async () => {
        // TODO: Chat ve Composer paneli oluşturma testleri eklenecek
        // Chat paneli oluştur
        // await vscode.commands.executeCommand('smile-ai.startChat');
        
        // // Panel oluşturuldu mu kontrol et
        // const panels = (vscode.window as any).webviewPanels;
        // const chatPanel = Array.from(panels).find(p => (p as any)[0] === 'smileAIChat');
        // expect(chatPanel).toBeTruthy();

        // // Composer paneli oluştur
        // await vscode.commands.executeCommand('smile-ai.startComposer');
        
        // // Panel oluşturuldu mu kontrol et
        // const composerPanel = Array.from(panels).find(p => (p as any)[0] === 'smileAIComposer');
        // expect(composerPanel).toBeTruthy();
    });
}); 