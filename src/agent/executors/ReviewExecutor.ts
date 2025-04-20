import { Task, TaskType, TaskResult, TaskExecutor, StatusCallbacks } from '../types';
import { AIEngine } from '../../ai-engine/AIEngine';
import { BaseExecutor } from './BaseExecutor';

export class ReviewExecutor extends BaseExecutor implements TaskExecutor {
    constructor(
        protected readonly aiEngine: AIEngine,
        private readonly statusCallbacks: StatusCallbacks
    ) {
        super(aiEngine);
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.REVIEW;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            this.statusCallbacks.showLoading('Reviewing code...');
            
            const response = await this.aiEngine.generateResponse({
                messages: [
                    {
                        role: 'user',
                        content: `Review the following code: ${task.description}`,
                        timestamp: Date.now()
                    }
                ]
            });

            this.statusCallbacks.showReady('Code review complete');
            
            return {
                success: true,
                aiResponse: response
            };
        } catch (error) {
            this.statusCallbacks.showError('Code review failed');
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
} 