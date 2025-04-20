import { Task, TaskType, TaskResult, TaskExecutor, StatusCallbacks } from '../types';
import { AIEngine } from '../../ai-engine/AIEngine';
import { BaseExecutor } from './BaseExecutor';

export class DebuggingExecutor extends BaseExecutor implements TaskExecutor {
    constructor(
        protected readonly aiEngine: AIEngine,
        private readonly statusCallbacks: StatusCallbacks
    ) {
        super(aiEngine);
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.DEBUGGING;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            this.statusCallbacks.showLoading('Analyzing code for debugging...');
            
            const response = await this.aiEngine.generateResponse({
                messages: [
                    {
                        role: 'user',
                        content: `Debug the following task: ${task.description}`,
                        timestamp: Date.now()
                    }
                ]
            });

            this.statusCallbacks.showReady('Debug analysis complete');
            
            return {
                success: true,
                aiResponse: response
            };
        } catch (error) {
            this.statusCallbacks.showError('Debug analysis failed');
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
} 