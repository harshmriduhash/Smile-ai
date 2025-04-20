import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskType, TaskStatus, TaskPriority } from './types';
import { FileAnalyzer, FileContext } from '../utils/FileAnalyzer';
import { CodeAnalyzer, CodeAnalysis } from '../utils/CodeAnalyzer';
import { AIEngine } from '../ai-engine/AIEngine';

export class TaskPlanner {
    private fileAnalyzer: FileAnalyzer;
    private codeAnalyzer: CodeAnalyzer;
    private aiEngine: AIEngine;

    constructor(aiEngine: AIEngine) {
        this.fileAnalyzer = FileAnalyzer.getInstance();
        this.codeAnalyzer = CodeAnalyzer.getInstance();
        this.aiEngine = aiEngine;
    }

    public async planTask(description: string): Promise<Task> {
        // Aktif editör ve dosyayı al
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        // Dosya ve kod analizini yap
        const fileContext = await this.fileAnalyzer.analyzeFile(editor.document.uri);
        const codeAnalysis = await this.codeAnalyzer.analyzeCode(editor.document.uri, fileContext);

        // AI'dan görev analizi iste
        const taskAnalysis = await this.analyzeTaskWithAI(description, fileContext, codeAnalysis);

        // Analiz sonucuna göre görevi oluştur
        const task: Task = {
            id: uuidv4(),
            type: taskAnalysis.taskType,
            description: description,
            status: TaskStatus.PENDING,
            priority: taskAnalysis.priority,
            created: Date.now(),
            updated: Date.now()
        };

        // Eğer görev karmaşıksa alt görevlere böl
        if (taskAnalysis.requiresBreakdown) {
            task.subtasks = await this.breakdownTask(task);
        }

        return task;
    }

    public async breakdownTask(task: Task): Promise<Task[]> {
        const subtasks: Task[] = [];
        if (!task.metadata) {
            throw new Error('Task metadata is required for breakdown');
        }

        const { fileContext, codeAnalysis } = task.metadata;

        // AI'dan alt görevleri iste
        const subtaskAnalysis = await this.getSubtasksFromAI(task, fileContext, codeAnalysis);

        // Her alt görev için yeni Task oluştur
        for (const analysis of subtaskAnalysis) {
            const subtask: Task = {
                id: uuidv4(),
                type: analysis.type,
                description: analysis.description,
                status: TaskStatus.PENDING,
                priority: analysis.priority,
                parent: task.id,
                metadata: {
                    fileContext,
                    codeAnalysis,
                    subtaskAnalysis: analysis
                },
                created: Date.now(),
                updated: Date.now()
            };

            subtasks.push(subtask);
        }

        return subtasks;
    }

    private async analyzeTaskWithAI(
        description: string,
        fileContext: FileContext,
        codeAnalysis: CodeAnalysis
    ): Promise<TaskAnalysis> {
        const prompt = this.buildTaskAnalysisPrompt(description, fileContext, codeAnalysis);
        
        const response = await this.aiEngine.generateResponse({
            messages: [
                { role: 'system', content: this.getTaskAnalysisSystemPrompt() },
                { role: 'user', content: prompt }
            ],
            maxTokens: 1000,
            temperature: 0.7,
            context: {
                prompt: prompt
            }
        });

        return this.parseTaskAnalysis(response.message);
    }

    private async getSubtasksFromAI(
        task: Task,
        fileContext: FileContext,
        codeAnalysis: CodeAnalysis
    ): Promise<SubtaskAnalysis[]> {
        const prompt = this.buildSubtaskAnalysisPrompt(task, fileContext, codeAnalysis);
        
        const response = await this.aiEngine.generateResponse({
            messages: [
                { role: 'system', content: this.getSubtaskAnalysisSystemPrompt() },
                { role: 'user', content: prompt }
            ],
            maxTokens: 1000,
            temperature: 0.7,
            context: {
                prompt: prompt
            }
        });

        return this.parseSubtaskAnalysis(response.message);
    }

    private buildTaskAnalysisPrompt(
        description: string,
        fileContext: FileContext,
        codeAnalysis: CodeAnalysis
    ): string {
        return `
Task Description: ${description}

File Context:
- Language: ${fileContext.language}
- File Type: ${fileContext.fileType}
- Framework: ${fileContext.framework || 'None'}
- Project Type: ${fileContext.projectType}

Code Analysis:
- Complexity: ${codeAnalysis.metrics.complexity}
- Maintainability: ${codeAnalysis.metrics.maintainability}
- Number of Classes: ${codeAnalysis.structure.classes.length}
- Number of Functions: ${codeAnalysis.structure.functions.length}
- Number of Suggestions: ${codeAnalysis.suggestions.length}

Please analyze this task and provide:
1. The most appropriate task type
2. Suggested priority
3. Whether it needs to be broken down into subtasks
4. Any specific considerations or challenges
`;
    }

    private buildSubtaskAnalysisPrompt(
        task: Task,
        fileContext: FileContext,
        codeAnalysis: CodeAnalysis
    ): string {
        return `
Main Task: ${task.description}
Task Type: ${task.type}

File Context:
- Language: ${fileContext.language}
- File Type: ${fileContext.fileType}
- Framework: ${fileContext.framework || 'None'}

Code Analysis:
- Complexity: ${codeAnalysis.metrics.complexity}
- Affected Classes: ${this.getAffectedClasses(codeAnalysis)}
- Affected Functions: ${this.getAffectedFunctions(codeAnalysis)}

Please break down this task into smaller subtasks:
1. List each subtask with its type and priority
2. Ensure logical ordering of subtasks
3. Consider dependencies between subtasks
4. Include validation and testing steps
`;
    }

    private getTaskAnalysisSystemPrompt(): string {
        return `You are a technical task analyzer. Your role is to:
1. Determine the most appropriate task type from: ${Object.values(TaskType).join(', ')}
2. Assess task priority based on complexity and impact
3. Decide if the task needs to be broken down
4. Provide structured analysis in JSON format
`;
    }

    private getSubtaskAnalysisSystemPrompt(): string {
        return `You are a task breakdown specialist. Your role is to:
1. Break down complex tasks into manageable subtasks
2. Assign appropriate types and priorities to subtasks
3. Ensure logical sequencing of subtasks
4. Provide structured output in JSON format
`;
    }

    private parseTaskAnalysis(aiResponse: string): TaskAnalysis {
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            console.error('Error parsing task analysis:', error);
            throw new Error('Failed to parse AI response for task analysis');
        }
    }

    private parseSubtaskAnalysis(aiResponse: string): SubtaskAnalysis[] {
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            console.error('Error parsing subtask analysis:', error);
            throw new Error('Failed to parse AI response for subtask analysis');
        }
    }

    private getAffectedClasses(codeAnalysis: CodeAnalysis): string {
        return codeAnalysis.structure.classes
            .map(c => c.name)
            .join(', ') || 'None';
    }

    private getAffectedFunctions(codeAnalysis: CodeAnalysis): string {
        return codeAnalysis.structure.functions
            .map(f => f.name)
            .join(', ') || 'None';
    }
}

interface TaskAnalysis {
    taskType: TaskType;
    priority: TaskPriority;
    requiresBreakdown: boolean;
    considerations: string[];
    challenges: string[];
}

interface SubtaskAnalysis {
    type: TaskType;
    description: string;
    priority: TaskPriority;
    order: number;
    dependencies: string[];
} 