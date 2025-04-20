# Smile AI - API Referansı

## 📖 İçindekiler

1. [AI Engine API](#ai-engine-api)
2. [Agent API](#agent-api)
3. [Executor API](#executor-api)
4. [Analiz API](#analiz-api)
5. [UI API](#ui-api)

## 🤖 AI Engine API

### AIEngine Sınıfı

```typescript
class AIEngine {
    constructor(config: AIConfig);
    
    // Ana metodlar
    async processRequest(request: AIRequest): Promise<AIResponse>;
    async generateCode(prompt: string, context?: any): Promise<string>;
    async analyzeCode(code: string): Promise<CodeAnalysis>;
    
    // Yapılandırma
    updateConfig(config: Partial<AIConfig>): void;
    getConfig(): AIConfig;
    
    // Bağlam yönetimi
    clearContext(): void;
    updateContext(context: AIContext): void;
}
```

### Tip Tanımları

```typescript
interface AIConfig {
    provider: {
        name: string;
        modelName: string;
        apiEndpoint: string;
    };
    maxTokens: number;
    temperature: number;
}

interface AIRequest {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
}

interface AIResponse {
    text: string;
    tokens: number;
    finish_reason: string;
}

interface AIContext {
    messages: AIMessage[];
    metadata?: Record<string, any>;
}

interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: number;
}
```

## 🎯 Agent API

### TaskManager Sınıfı

```typescript
class TaskManager {
    constructor();
    
    // Görev yönetimi
    addTask(task: Task): void;
    updateTask(taskId: string, updates: Partial<Task>): void;
    getTask(taskId: string): Task | undefined;
    getTasks(status?: TaskStatus): Task[];
    cancelTask(taskId: string): void;
    
    // Alt görev yönetimi
    getSubtasks(taskId: string): Task[];
    addSubtask(parentId: string, subtask: Task): void;
    
    // Olay dinleyicileri
    on(event: TaskEvent, handler: (task: Task) => void): void;
    off(event: TaskEvent, handler: (task: Task) => void): void;
}
```

### TaskPlanner Sınıfı

```typescript
class TaskPlanner {
    constructor(aiEngine: AIEngine);
    
    // Görev planlama
    async planTask(description: string): Promise<Task>;
    async breakdownTask(task: Task): Promise<Task[]>;
    async estimateCompletion(task: Task): Promise<number>;
    
    // Analiz
    analyzeTaskDependencies(task: Task): string[];
    getPriority(task: Task): TaskPriority;
}
```

### Tip Tanımları

```typescript
interface Task {
    id: string;
    type: TaskType;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    subtasks?: Task[];
    metadata?: TaskMetadata;
    result?: TaskResult;
    parent?: string;
    created: number;
    updated: number;
}

enum TaskType {
    CODE_ANALYSIS = 'CODE_ANALYSIS',
    CODE_GENERATION = 'CODE_GENERATION',
    CODE_MODIFICATION = 'CODE_MODIFICATION',
    TEST_GENERATION = 'TEST_GENERATION',
    DOCUMENTATION = 'DOCUMENTATION',
    REFACTORING = 'REFACTORING',
    EXPLANATION = 'EXPLANATION'
}

enum TaskStatus {
    PENDING = 'PENDING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED'
}

enum TaskPriority {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

type TaskEvent = 'added' | 'updated' | 'completed' | 'failed' | 'cancelled';
```

## 🔧 Executor API

### Temel Executor Arayüzü

```typescript
interface TaskExecutor {
    execute(task: Task): Promise<TaskResult>;
    canHandle(task: Task): boolean;
}
```

### Özel Executor'lar

```typescript
class CodeAnalysisExecutor implements TaskExecutor {
    constructor(aiEngine: AIEngine);
    execute(task: Task): Promise<TaskResult>;
    canHandle(task: Task): boolean;
}

class CodeModificationExecutor implements TaskExecutor {
    constructor(aiEngine: AIEngine);
    execute(task: Task): Promise<TaskResult>;
    canHandle(task: Task): boolean;
}

class TestGenerationExecutor implements TaskExecutor {
    constructor(aiEngine: AIEngine);
    execute(task: Task): Promise<TaskResult>;
    canHandle(task: Task): boolean;
}

// ... diğer executor'lar
```

## 🔍 Analiz API

### CodeAnalyzer Sınıfı

```typescript
class CodeAnalyzer {
    static getInstance(): CodeAnalyzer;
    
    // Ana analiz metodları
    async analyzeCode(document: vscode.TextDocument, fileContext: FileContext): Promise<CodeAnalysis>;
    calculateMetrics(structure: CodeStructure, content: string): CodeMetrics;
    generateSuggestions(analysis: CodeAnalysis): CodeSuggestion[];
    
    // Yardımcı metodlar
    private analyzeStructure(document: vscode.TextDocument): Promise<CodeStructure>;
    private calculateComplexity(structure: CodeStructure): number;
    private detectPatterns(structure: CodeStructure): string[];
}
```

### Tip Tanımları

```typescript
interface CodeAnalysis {
    structure: CodeStructure;
    metrics: CodeMetrics;
    suggestions: CodeSuggestion[];
    dependencies: DependencyInfo[];
}

interface CodeMetrics {
    complexity: number;
    maintainability: number;
    testability: number;
    documentation: number;
}

interface CodeSuggestion {
    type: 'refactor' | 'improvement' | 'security' | 'performance';
    description: string;
    priority: 'low' | 'medium' | 'high';
    location: vscode.Location;
}
```

## 🖥️ UI API

### Olay Dinleyicileri

```typescript
// Panel olayları
interface PanelEventMap {
    'message': AIMessage;
    'codeGenerated': string;
    'codeApplied': void;
    'error': Error;
}

// UI güncellemeleri
interface UIUpdateEvent {
    type: 'chat' | 'composer' | 'analysis';
    data: any;
}
``` 