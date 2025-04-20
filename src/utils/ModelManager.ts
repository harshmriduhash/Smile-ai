import * as vscode from 'vscode';

export interface AIModel {
    name: string;
    provider: 'ollama' | 'lmstudio';
    modelName: string;
    apiEndpoint: string;
    maxTokens?: number;
    temperature?: number;
    embeddingModelName?: string; // Optional: Specific model for embeddings
    enableRAG?: boolean; // Optional: Enable Retrieval Augmented Generation
}

export class ModelManager {
    private static instance: ModelManager;
    private models: AIModel[] = [];
    private activeModel: AIModel | undefined;

    private constructor() {
        this.loadModels();
    }

    public static getInstance(): ModelManager {
        if (!ModelManager.instance) {
            ModelManager.instance = new ModelManager();
        }
        return ModelManager.instance;
    }

    private async loadModels() {
        const config = vscode.workspace.getConfiguration('smile-ai');
        this.models = config.get<AIModel[]>('models') || [];
        const activeModelName = config.get<string>('activeModel');

        // Ollama modellerini çek
        await this.fetchOllamaModels();
        
        // LM Studio modellerini çek (eğer erişilebilirse)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            
            const response = await fetch('http://localhost:1234/v1/models', { 
                signal: controller.signal 
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                await this.fetchLMStudioModels();
            }
        } catch (error) {
            // LM Studio erişilemiyorsa sessizce devam et
            console.log('LM Studio not available');
        }

        // Eğer hiç model yoksa veya aktif model bulunamadıysa varsayılan modeli ekle
        if (this.models.length === 0 || !this.models.some(m => m.name === activeModelName)) {
            const defaultModel: AIModel = {
                name: 'gemma3:12b',
                provider: 'ollama',
                modelName: 'gemma3:12b',
                apiEndpoint: 'http://localhost:11434',
                maxTokens: 2048,
                temperature: 0.7,
                embeddingModelName: 'nomic-embed-text'
            };
            
            // Varsayılan modeli ekle ve aktif model olarak ayarla
            await this.addModel(defaultModel);
            await this.setActiveModel(defaultModel.name);
            this.activeModel = defaultModel; // Hemen aktif modeli ayarla
            return;
        }

        // Aktif modeli ayarla
        if (activeModelName) {
            this.activeModel = this.models.find(m => m.name === activeModelName);
        }
        
        // Aktif model hala ayarlanmadıysa ilk modeli kullan
        if (!this.activeModel && this.models.length > 0) {
            this.activeModel = this.models[0];
            await this.setActiveModel(this.models[0].name);
        }
    }

    private async fetchOllamaModels() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            
            const response = await fetch('http://localhost:11434/api/tags', {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error('Ollama API returned error');
            }
            
            const data = await response.json() as { models?: { name: string }[] };
            if (data.models) {
                for (const model of data.models) {
                    if (!this.models.some(m => m.name === model.name)) {
                        await this.addModel({
                            name: model.name,
                            provider: 'ollama',
                            modelName: model.name,
                            apiEndpoint: 'http://localhost:11434',
                            maxTokens: 2048,
                            temperature: 0.7
                        });
                    }
                }
            }
        } catch (error) {
            console.log('Ollama not available');
        }
    }

    private async fetchLMStudioModels() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            
            const response = await fetch('http://localhost:1234/v1/models', {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error('LM Studio API returned error');
            }
            
            const data = await response.json() as { data?: { id: string }[] };
            if (data.data) {
                for (const model of data.data) {
                    if (!this.models.some(m => m.name === model.id)) {
                        await this.addModel({
                            name: model.id,
                            provider: 'lmstudio',
                            modelName: model.id,
                            apiEndpoint: 'http://localhost:1234',
                            maxTokens: 2048,
                            temperature: 0.7
                        });
                    }
                }
            }
        } catch (error) {
            console.log('LM Studio not available');
        }
    }

    public async addModel(model: AIModel): Promise<void> {
        // Model adı benzersiz olmalı
        if (this.models.some(m => m.name === model.name)) {
            throw new Error(`Model with name "${model.name}" already exists`);
        }

        this.models.push(model);
        await this.saveModels();

        // İlk model ise aktif model olarak ayarla
        if (this.models.length === 1) {
            await this.setActiveModel(model.name);
        }
    }

    public async removeModel(modelName: string): Promise<void> {
        const index = this.models.findIndex(m => m.name === modelName);
        if (index === -1) {
            throw new Error(`Model "${modelName}" not found`);
        }

        this.models.splice(index, 1);
        await this.saveModels();

        // Aktif model silindiyse başka bir model seç
        if (this.activeModel?.name === modelName) {
            if (this.models.length > 0) {
                await this.setActiveModel(this.models[0].name);
            } else {
                this.activeModel = undefined;
                await this.setActiveModel(undefined);
            }
        }
    }

    public async setActiveModel(modelName: string | undefined): Promise<void> {
        if (modelName) {
            const model = this.models.find(m => m.name === modelName);
            if (!model) {
                throw new Error(`Model "${modelName}" not found`);
            }
            this.activeModel = model;
        } else {
            this.activeModel = undefined;
        }

        await vscode.workspace.getConfiguration('smile-ai').update(
            'activeModel',
            modelName,
            vscode.ConfigurationTarget.Global
        );
    }

    private async saveModels(): Promise<void> {
        await vscode.workspace.getConfiguration('smile-ai').update(
            'models',
            this.models,
            vscode.ConfigurationTarget.Global
        );
    }

    public getModels(): AIModel[] {
        return [...this.models];
    }

    public getActiveModel(): AIModel | undefined {
        return this.activeModel;
    }

    public async promptAddModel(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for the model',
            placeHolder: 'e.g., My CodeLlama'
        });
        if (!name) return;

        const provider = await vscode.window.showQuickPick(
            ['ollama', 'lmstudio'],
            { placeHolder: 'Select AI provider' }
        );
        if (!provider) return;

        const modelName = await vscode.window.showInputBox({
            prompt: 'Enter the model name',
            placeHolder: 'e.g., codellama'
        });
        if (!modelName) return;

        const apiEndpoint = await vscode.window.showInputBox({
            prompt: 'Enter the API endpoint',
            placeHolder: 'http://localhost:11434',
            value: 'http://localhost:11434'
        });
        if (!apiEndpoint) return;

        const maxTokens = await vscode.window.showInputBox({
            prompt: 'Enter max tokens (optional)',
            placeHolder: '2048',
            value: '2048'
        });

        const temperature = await vscode.window.showInputBox({
            prompt: 'Enter temperature (optional)',
            placeHolder: '0.7',
            value: '0.7'
        });

        const model: AIModel = {
            name,
            provider: provider as 'ollama' | 'lmstudio',
            modelName,
            apiEndpoint,
            maxTokens: maxTokens ? parseInt(maxTokens) : undefined,
            temperature: temperature ? parseFloat(temperature) : undefined
        };

        await this.addModel(model);
    }

    public async promptSelectActiveModel(): Promise<void> {
        const modelNames = this.models.map(m => m.name);
        if (modelNames.length === 0) {
            vscode.window.showInformationMessage('No models configured. Please add a model first.');
            return;
        }

        const selected = await vscode.window.showQuickPick(modelNames, {
            placeHolder: 'Select active model'
        });

        if (selected) {
            await this.setActiveModel(selected);
        }
    }
} 