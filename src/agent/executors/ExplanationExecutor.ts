import { Task, TaskType, TaskResult, TaskExecutor } from '../types';
import { AIEngine } from '../../ai-engine/AIEngine';
import { BaseExecutor } from './BaseExecutor';

export class ExplanationExecutor extends BaseExecutor implements TaskExecutor {
    constructor(aiEngine: AIEngine) {
        super(aiEngine);
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.EXPLANATION;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            const response = await this.aiEngine.generateResponse({
                messages: [
                    {
                        role: 'system',
                        content: 'You are an AI assistant helping to explain code.'
                    },
                    {
                        role: 'user',
                        content: task.description
                    }
                ]
            });

            return {
                success: true,
                aiResponse: response
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}