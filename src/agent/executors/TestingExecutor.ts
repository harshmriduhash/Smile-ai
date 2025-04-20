import { Task, TaskType, TaskResult, TaskExecutor, StatusCallbacks } from '../types';
import { AIEngine } from '../../ai-engine/AIEngine';
import { BaseExecutor } from './BaseExecutor';

export class TestingExecutor extends BaseExecutor implements TaskExecutor {
    constructor(
        protected readonly aiEngine: AIEngine,
        private readonly statusCallbacks: StatusCallbacks
    ) {
        super(aiEngine);
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.TESTING;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            this.statusCallbacks.showLoading('Analyzing code for testing...');
            
            const response = await this.aiEngine.generateResponse({
                messages: [
                    {
                        role: 'user',
                        content: `Generate tests for the following code: ${task.description}`,
                        timestamp: Date.now()
                    }
                ]
            });

            this.statusCallbacks.showReady('Test generation complete');
            
            return {
                success: true,
                aiResponse: response
            };
        } catch (error) {
            this.statusCallbacks.showError('Test generation failed');
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
} 