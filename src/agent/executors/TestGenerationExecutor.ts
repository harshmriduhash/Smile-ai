import * as vscode from 'vscode';
import * as path from 'path';
import { Task, TaskType, TaskResult, TaskExecutor } from '../types';
import { CodeAnalysis, FunctionInfo } from '../../utils/CodeAnalyzer';
import { AIEngine } from '../../ai-engine/AIEngine';

export class TestGenerationExecutor implements TaskExecutor {
    private aiEngine: AIEngine;

    constructor(aiEngine: AIEngine) {
        this.aiEngine = aiEngine;
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.TEST_GENERATION;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            if (!task.metadata?.fileContext || !task.metadata?.codeAnalysis) {
                throw new Error('Task metadata is missing required analysis context');
            }

            // Test planı oluştur
            const testPlan = await this.createTestPlan(task);

            // Test dosyasını oluştur veya güncelle
            const testFile = await this.getTestFilePath(task);
            const testCode = await this.generateTestCode(testPlan);

            // Preview göster ve onay al
            const approved = await this.showTestPreview(testCode, testPlan);
            
            if (!approved) {
                return {
                    success: false,
                    error: 'Test generation was cancelled by user'
                };
            }

            // Test dosyasını kaydet
            await this.saveTestFile(testFile, testCode);

            return {
                success: true,
                data: {
                    testFile,
                    testPlan,
                    coverage: testPlan.coverage
                }
            };
        } catch (error) {
            console.error('Error in TestGenerationExecutor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in test generation'
            };
        }
    }

    private async createTestPlan(task: Task): Promise<TestPlan> {
        const { codeAnalysis, fileContext } = task.metadata!;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        const sourceCode = editor.document.getText();
        const prompt = this.buildTestPlanPrompt(sourceCode, codeAnalysis, fileContext);

        const response = await this.aiEngine.generateResponse({
            messages: [
                { role: 'system', content: this.getTestPlanSystemPrompt() },
                { role: 'user', content: prompt }
            ],
            context: {
                prompt: prompt
            }
        });

        return this.parseTestPlan(response.message);
    }

    private buildTestPlanPrompt(sourceCode: string, analysis: CodeAnalysis, fileContext: any): string {
        const functions = analysis.structure.functions
            .map(f => this.formatFunctionInfo(f))
            .join('\n\n');

        return `
Please analyze this code and create a comprehensive test plan:

Source Code:
\`\`\`${fileContext.language}
${sourceCode}
\`\`\`

Functions to Test:
${functions}

Requirements:
1. Create unit tests for each function
2. Include edge cases and error scenarios
3. Consider dependencies and mocking needs
4. Follow testing best practices for ${fileContext.language}
5. Ensure high test coverage
6. Include integration tests if needed

Language: ${fileContext.language}
Framework: ${fileContext.framework || 'None'}
Test Framework: ${this.detectTestFramework(fileContext)}
`;
    }

    private formatFunctionInfo(func: FunctionInfo): string {
        return `
Function: ${func.name}
Parameters: ${func.parameters.map(p => `${p.name}: ${p.type || 'any'}${p.isOptional ? '?' : ''}`).join(', ')}
Return Type: ${func.returnType || 'void'}
Async: ${func.isAsync}
Complexity: ${func.complexity}
Dependencies: ${func.dependencies.join(', ') || 'none'}
`;
    }

    private getTestPlanSystemPrompt(): string {
        return `You are a test generation expert. Your role is to:
1. Analyze code and identify test scenarios
2. Create comprehensive test cases
3. Consider edge cases and error conditions
4. Follow testing best practices
5. Ensure proper test coverage
6. Provide clear test structure and organization

Please provide your test plan in this JSON format:
{
    "description": "Overview of the test suite",
    "testCases": [
        {
            "name": "Test case name",
            "type": "unit|integration|edge|error",
            "function": "Function being tested",
            "scenario": "What is being tested",
            "setup": {
                "mocks": [
                    {
                        "target": "What to mock",
                        "behavior": "Mock behavior"
                    }
                ],
                "fixtures": [
                    {
                        "name": "Fixture name",
                        "data": "Fixture data"
                    }
                ]
            },
            "steps": [
                {
                    "action": "Test step",
                    "expected": "Expected result"
                }
            ]
        }
    ],
    "coverage": {
        "functions": ["List of functions covered"],
        "percentage": "Estimated coverage percentage",
        "gaps": ["Identified coverage gaps"]
    },
    "dependencies": {
        "packages": ["Required test packages"],
        "mocks": ["Required mock objects"]
    }
}`;
    }

    private parseTestPlan(aiResponse: string): TestPlan {
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            console.error('Error parsing test plan:', error);
            throw new Error('Failed to parse AI response for test plan');
        }
    }

    private async generateTestCode(plan: TestPlan): Promise<string> {
        const prompt = this.buildTestCodePrompt(plan);
        
        const response = await this.aiEngine.generateResponse({
            messages: [
                { role: 'system', content: this.getTestCodeSystemPrompt() },
                { role: 'user', content: prompt }
            ],
            context: {
                prompt: prompt
            }
        });

        return response.message;
    }

    private buildTestCodePrompt(plan: TestPlan): string {
        return `
Please generate test code based on this test plan:

${JSON.stringify(plan, null, 2)}

Requirements:
1. Follow the test framework conventions
2. Include all necessary imports
3. Properly structure the test suite
4. Include clear test descriptions
5. Implement all test cases
6. Add proper error handling
7. Include type definitions where needed
`;
    }

    private getTestCodeSystemPrompt(): string {
        return `You are a test code generator. Your role is to:
1. Generate clean and maintainable test code
2. Follow testing framework best practices
3. Implement all test cases from the plan
4. Include proper assertions
5. Handle async operations correctly
6. Add clear comments and documentation

Generate the complete test file content, including:
1. All necessary imports
2. Test suite structure
3. Test case implementations
4. Mock and fixture setups
5. Helper functions if needed
`;
    }

    private detectTestFramework(fileContext: any): string {
        // Dile göre varsayılan test framework'ünü belirle
        switch (fileContext.language) {
            case 'typescript':
            case 'javascript':
                return 'Jest';
            case 'python':
                return 'pytest';
            case 'java':
                return 'JUnit';
            default:
                return 'Jest';
        }
    }

    private async getTestFilePath(task: Task): Promise<string> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        const sourceFile = editor.document.fileName;
        const { dir, name, ext } = path.parse(sourceFile);
        
        // Dile göre test dosya adı formatını belirle
        const testFileName = this.getTestFileName(name, ext, task.metadata!.fileContext);
        
        // Test dizinini belirle
        const testDir = await this.getTestDirectory(dir);
        
        return path.join(testDir, testFileName);
    }

    private getTestFileName(baseName: string, ext: string, fileContext: any): string {
        switch (fileContext.language) {
            case 'typescript':
            case 'javascript':
                return `${baseName}.test${ext}`;
            case 'python':
                return `test_${baseName}${ext}`;
            case 'java':
                return `${baseName}Test${ext}`;
            default:
                return `${baseName}.test${ext}`;
        }
    }

    private async getTestDirectory(sourceDir: string): Promise<string> {
        // Proje yapısına göre test dizinini belirle
        const testDirs = [
            path.join(sourceDir, '__tests__'),
            path.join(sourceDir, 'tests'),
            path.join(sourceDir, 'test'),
            path.join(path.dirname(sourceDir), 'tests'),
            path.join(path.dirname(sourceDir), 'test')
        ];

        // Var olan test dizinini bul
        for (const dir of testDirs) {
            try {
                const stat = await vscode.workspace.fs.stat(vscode.Uri.file(dir));
                if (stat.type === vscode.FileType.Directory) {
                    return dir;
                }
            } catch (error) {
                continue;
            }
        }

        // Test dizini yoksa, varsayılan olarak __tests__ dizini oluştur
        const defaultTestDir = path.join(sourceDir, '__tests__');
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(defaultTestDir));
        return defaultTestDir;
    }

    private async showTestPreview(testCode: string, plan: TestPlan): Promise<boolean> {
        const panel = vscode.window.createWebviewPanel(
            'testPreview',
            'Test Code Preview',
            vscode.ViewColumn.Two,
            {
                enableScripts: true
            }
        );

        panel.webview.html = this.generatePreviewHTML(testCode, plan);

        return new Promise((resolve) => {
            panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'approve':
                            panel.dispose();
                            resolve(true);
                            break;
                        case 'reject':
                            panel.dispose();
                            resolve(false);
                            break;
                    }
                },
                undefined
            );
        });
    }

    private generatePreviewHTML(testCode: string, plan: TestPlan): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>Test Code Preview</title>
    <style>
        :root {
            --primary-color: #007acc;
            --secondary-color: #3d3d3d;
            --background-color: #1e1e1e;
            --text-color: #d4d4d4;
            --border-color: #404040;
            --success-color: #4caf50;
            --warning-color: #ff9800;
            --error-color: #f44336;
            --info-color: #2196f3;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--background-color);
            color: var(--text-color);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            margin-bottom: 20px;
        }

        .section {
            background-color: var(--secondary-color);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .section h2 {
            color: var(--primary-color);
            margin-top: 0;
        }

        pre {
            margin: 0;
            padding: 10px;
            background-color: #1a1a1a;
            border-radius: 4px;
            overflow-x: auto;
        }

        .coverage {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }

        .coverage-item {
            background-color: var(--background-color);
            padding: 10px;
            border-radius: 4px;
        }

        .test-cases {
            margin: 15px 0;
        }

        .test-case {
            background-color: var(--background-color);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 10px;
        }

        .test-case h4 {
            color: var(--info-color);
            margin: 0 0 10px 0;
        }

        .button-container {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }

        .button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }

        .approve {
            background-color: var(--success-color);
            color: white;
        }

        .reject {
            background-color: var(--error-color);
            color: white;
        }

        .button:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Test Code Preview</h1>
        </div>

        <div class="section">
            <h2>Test Plan Overview</h2>
            <p>${plan.description}</p>

            <div class="coverage">
                <div class="coverage-item">
                    <h4>Coverage</h4>
                    <div>${plan.coverage.percentage}%</div>
                </div>
                <div class="coverage-item">
                    <h4>Functions Covered</h4>
                    <div>${plan.coverage.functions.length} functions</div>
                </div>
            </div>

            <div class="test-cases">
                <h3>Test Cases</h3>
                ${plan.testCases.map(tc => `
                    <div class="test-case">
                        <h4>${tc.name}</h4>
                        <div>Type: ${tc.type}</div>
                        <div>Function: ${tc.function}</div>
                        <div>Scenario: ${tc.scenario}</div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="section">
            <h2>Generated Test Code</h2>
            <pre>${this.escapeHtml(testCode)}</pre>
        </div>

        <div class="section">
            <h2>Coverage Gaps</h2>
            <ul>
                ${plan.coverage.gaps.map(gap => `<li>${gap}</li>`).join('')}
            </ul>
        </div>

        <div class="button-container">
            <button class="button reject" onclick="reject()">Cancel</button>
            <button class="button approve" onclick="approve()">Generate Tests</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function approve() {
            vscode.postMessage({ command: 'approve' });
        }

        function reject() {
            vscode.postMessage({ command: 'reject' });
        }
    </script>
</body>
</html>`;
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private async saveTestFile(filePath: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        const bytes = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(uri, bytes);
    }
}

interface TestPlan {
    description: string;
    testCases: TestCase[];
    coverage: {
        functions: string[];
        percentage: number;
        gaps: string[];
    };
    dependencies: {
        packages: string[];
        mocks: string[];
    };
}

interface TestCase {
    name: string;
    type: 'unit' | 'integration' | 'edge' | 'error';
    function: string;
    scenario: string;
    setup: {
        mocks: MockConfig[];
        fixtures: FixtureConfig[];
    };
    steps: TestStep[];
}

interface MockConfig {
    target: string;
    behavior: string;
}

interface FixtureConfig {
    name: string;
    data: any;
}

interface TestStep {
    action: string;
    expected: string;
} 