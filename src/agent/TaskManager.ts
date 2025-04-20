import { Task, TaskStatus, TaskManager as ITaskManager } from './types';
import { EventEmitter } from 'events';

export class TaskManager extends EventEmitter implements ITaskManager {
    private tasks: Map<string, Task>;

    constructor() {
        super();
        this.tasks = new Map();
    }

    public addTask(task: Task): void {
        this.tasks.set(task.id, task);
        this.emit('taskAdded', task);
    }

    public updateTask(taskId: string, updates: Partial<Task>): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task with id ${taskId} not found`);
        }

        const updatedTask = {
            ...task,
            ...updates,
            updated: Date.now()
        };

        this.tasks.set(taskId, updatedTask);
        this.emit('taskUpdated', updatedTask);
    }

    public getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId);
    }

    public getTasks(status?: TaskStatus): Task[] {
        const tasks = Array.from(this.tasks.values());
        if (status) {
            return tasks.filter(task => task.status === status);
        }
        return tasks;
    }

    public cancelTask(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task with id ${taskId} not found`);
        }

        const updatedTask = {
            ...task,
            status: TaskStatus.CANCELLED,
            updated: Date.now()
        };

        this.tasks.set(taskId, updatedTask);
        this.emit('taskCancelled', updatedTask);

        // Cancel subtasks if they exist
        if (task.subtasks) {
            task.subtasks.forEach(subtask => {
                if (subtask.status !== TaskStatus.COMPLETED && 
                    subtask.status !== TaskStatus.CANCELLED) {
                    this.cancelTask(subtask.id);
                }
            });
        }
    }

    public removeTask(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (task) {
            this.tasks.delete(taskId);
            this.emit('taskRemoved', task);
        }
    }

    public clearTasks(): void {
        this.tasks.clear();
        this.emit('tasksCleared');
    }

    public getTasksByParent(parentId: string): Task[] {
        return Array.from(this.tasks.values())
            .filter(task => task.parent === parentId);
    }

    public getTaskTree(taskId: string): Task | undefined {
        const task = this.getTask(taskId);
        if (!task) return undefined;

        const subtasks = this.getTasksByParent(taskId);
        if (subtasks.length > 0) {
            task.subtasks = subtasks.map(subtask => this.getTaskTree(subtask.id))
                .filter((t): t is Task => t !== undefined);
        }

        return task;
    }
} 