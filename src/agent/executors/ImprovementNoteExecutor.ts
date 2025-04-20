import { Task, TaskType, TaskResult, TaskExecutor, StatusCallbacks } from '../types';
import { AIEngine } from '../../ai-engine/AIEngine';
import { BaseExecutor } from './BaseExecutor';

export class ImprovementNoteExecutor extends BaseExecutor implements TaskExecutor {
    constructor(
        protected readonly aiEngine: AIEngine,
        private readonly statusCallbacks: StatusCallbacks
    ) {
        super(aiEngine);
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.IMPROVEMENT_NOTE;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            this.statusCallbacks.showLoading('Processing improvement note...');
            
            const response = await this.aiEngine.generateResponse({
                messages: [
                    {
                        role: 'user',
                        content: `Analyze the following improvement note: ${task.description}`,
                        timestamp: Date.now()
                    }
                ]
            });

            this.statusCallbacks.showReady('Improvement note processed');
            
            return {
                success: true,
                aiResponse: response
            };
        } catch (error) {
            this.statusCallbacks.showError('Failed to process improvement note');
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
} 