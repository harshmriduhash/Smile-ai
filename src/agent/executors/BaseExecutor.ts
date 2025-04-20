import { AIEngine } from '../../ai-engine/AIEngine';

export abstract class BaseExecutor {
    protected aiEngine: AIEngine;

    constructor(aiEngine: AIEngine) {
        this.aiEngine = aiEngine;
    }
} 