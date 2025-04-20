import * as vscode from 'vscode';
import { Task, TaskType, TaskResult, TaskExecutor } from '../types';
import { CodeAnalysis, CodeMetrics } from '../../utils/CodeAnalyzer';
import { AIEngine } from '../../ai-engine/AIEngine';
import { BaseExecutor } from './BaseExecutor';
import { SymbolInfo } from '../../indexing/CodebaseIndex';
import { ImprovementManager } from '../../utils/ImprovementManager';
import { ImprovementNoteContext } from '../types';
import { CodebaseIndexer } from '../../indexing/CodebaseIndexer';

function getSymbolKindName(kind: vscode.SymbolKind): string {
    switch (kind) {
        case vscode.SymbolKind.Function: case vscode.SymbolKind.Method: return 'function';
        case vscode.SymbolKind.Class: return 'class';
        case vscode.SymbolKind.Interface: return 'interface';
        case vscode.SymbolKind.Enum: return 'enum';
        case vscode.SymbolKind.TypeParameter: return 'type alias';
        case vscode.SymbolKind.Variable: return 'variable';
        default: return 'symbol';
    }
}

interface RefactoringPlan {
    analysis: {
        codeSmells: {
            type: string;
            description: string;
            severity: 'high' | 'medium' | 'low';
            location?: {
                startLine: number;
                endLine: number;
            };
        }[];
        designIssues: {
            type: string;
            description: string;
            suggestedPattern: string;
            rationale: string;
        }[];
        performanceIssues: {
            description: string;
            impact: string;
            suggestion: string;
        }[];
    };
    changes: {
        id: string;
        type: 'extract' | 'move' | 'rename' | 'inline' | 'split' | 'merge' | string;
        description: string;
        rationale: string;
        impact: {
            complexity: string;
            maintainability: string;
            scope: string[];
        };
        steps: {
            order: number;
            action: string;
            target?: {
                startLine: number;
                endLine: number;
            };
            code?: string;
        }[];
    }[];
    risks: {
        type: string;
        description: string;
        mitigation: string;
    }[];
    testingStrategy: {
        impactedTests: string[];
        newTestsNeeded: string[];
        regressionRisks: string[];
    };
}

interface RefactoringChanges {
    fileChanges: {
        filePath: string;
        edits: {
            range: { startLine: number; startChar: number; endLine: number; endChar: number };
            newText: string;
            type?: string;
            description?: string;
        }[];
    }[];
    orderOfExecution?: {
        step: number;
        fileChange: string;
        changeIndex: number;
        dependencies: number[];
    }[];
}

export class RefactoringExecutor extends BaseExecutor implements TaskExecutor {
    private codebaseIndexer: CodebaseIndexer;

    constructor(aiEngine: AIEngine, codebaseIndexer: CodebaseIndexer) {
        super(aiEngine);
        this.codebaseIndexer = codebaseIndexer;
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.REFACTORING;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            if (!task.metadata?.fileContext || !task.metadata?.codeAnalysis) {
                throw new Error('Task metadata is missing required analysis context');
            }

            // Refactoring planı oluştur
            const refactoringPlan = await this.createRefactoringPlan(task);

            // Refactoring değişikliklerini üret
            const changes = await this.generateRefactoringChanges(refactoringPlan);

            // Preview göster ve onay al
            const approved = await this.showRefactoringPreview(changes, refactoringPlan);
            
            if (!approved) {
                return {
                    success: false,
                    error: 'Refactoring was cancelled by user'
                };
            }

            // Değişiklikleri uygula
            await this.applyRefactoring(changes);

            return {
                success: true,
                data: {
                    changes,
                    plan: refactoringPlan
                }
            };
        } catch (error) {
            console.error('Error in RefactoringExecutor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in refactoring'
            };
        }
    }

    private async createRefactoringPlan(task: Task): Promise<RefactoringPlan> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        const document = editor.document;
        const filePath = vscode.workspace.asRelativePath(document.uri);
        const selection = editor.selection;
        let codeToRefactor = '';
        let promptContext = '';
        let targetSymbol: SymbolInfo | undefined;
        let baseLineOffset = 0;

        if (selection && !selection.isEmpty) {
            const midPointPos = new vscode.Position(
                Math.floor((selection.start.line + selection.end.line) / 2),
                Math.floor((selection.start.character + selection.end.character) / 2)
            );
            const symbol = await this.codebaseIndexer.findSymbolAtPosition(document.uri, midPointPos);
            targetSymbol = symbol ? {
                name: symbol.name,
                kind: symbol.kind,
                location: symbol.location,
                startLine: symbol.location.range.start.line + 1,
                startChar: symbol.location.range.start.character,
                endLine: symbol.location.range.end.line + 1,
                endChar: symbol.location.range.end.character
            } : undefined;

            if (targetSymbol && 
                targetSymbol.startLine <= selection.start.line + 1 && targetSymbol.endLine >= selection.end.line + 1 &&
                (targetSymbol.startLine !== selection.start.line + 1 || targetSymbol.startChar <= selection.start.character) &&
                (targetSymbol.endLine !== selection.end.line + 1 || targetSymbol.endChar >= selection.end.character)) 
            {
                 console.log(`Refactoring symbol containing selection: ${targetSymbol.name}`);
                 const symbolRange = new vscode.Range(targetSymbol.startLine - 1, targetSymbol.startChar, targetSymbol.endLine - 1, targetSymbol.endChar);
                 codeToRefactor = document.getText(symbolRange);
                 promptContext = `the ${getSymbolKindName(targetSymbol.kind)} '${targetSymbol.name}' in file ${filePath}`;
                 baseLineOffset = targetSymbol.startLine - 1;
            } else {
                console.log('Refactoring selected text.');
                codeToRefactor = document.getText(selection);
                promptContext = `the selected code snippet in ${filePath} (lines ${selection.start.line + 1}-${selection.end.line + 1})`;
                targetSymbol = undefined; 
                baseLineOffset = selection.start.line;
            }
        } else {
            const cursorPos = editor.selection.active;
            const symbol = await this.codebaseIndexer.findSymbolAtPosition(document.uri, cursorPos);
            targetSymbol = symbol ? {
                name: symbol.name,
                kind: symbol.kind,
                location: symbol.location,
                startLine: symbol.location.range.start.line + 1,
                startChar: symbol.location.range.start.character,
                endLine: symbol.location.range.end.line + 1,
                endChar: symbol.location.range.end.character
            } : undefined;

            if (targetSymbol) {
                console.log(`Refactoring symbol at cursor: ${targetSymbol.name}`);
                const symbolRange = new vscode.Range(targetSymbol.startLine - 1, targetSymbol.startChar, targetSymbol.endLine - 1, targetSymbol.endChar);
                codeToRefactor = document.getText(symbolRange);
                promptContext = `the ${getSymbolKindName(targetSymbol.kind)} '${targetSymbol.name}' in file ${filePath}`;
                baseLineOffset = targetSymbol.startLine - 1;
            } else {
                console.error('Cannot determine target for refactoring without selection or symbol at cursor.');
                throw new Error('Please select the code to refactor or place the cursor inside a specific symbol.');
            }
        }

        // --- Find References --- 
        let references: vscode.Location[] = [];
        if (targetSymbol) {
            references = await this.codebaseIndexer.findReferences(document.uri, editor.selection.active);
            console.log(`Found ${references.length} references for symbol ${targetSymbol.name}`);
        }
        // ---------------------

        const { codeAnalysis, fileContext } = task.metadata!;
        const actualFileContext = { ...fileContext, language: document.languageId };
        const prompt = this.buildRefactoringPlanPrompt(
            promptContext, 
            codeToRefactor, 
            codeAnalysis, 
            actualFileContext,
            references // Pass references
        );

        const response = await this.aiEngine.generateResponse({
            messages: [
                { role: 'system', content: this.getRefactoringPlanSystemPrompt() },
                { role: 'user', content: prompt }
            ],
            context: {
                prompt: prompt
            }
        });

        const plan = this.parseRefactoringPlan(response.message);

        // Adjust relative locations in plan analysis/changes
        this.adjustPlanLocations(plan, baseLineOffset);

        // --- Extract and Note Suggestions from Plan --- 
        const improvementManager = ImprovementManager.getInstance();
        const suggestions = this.extractSuggestionsFromPlan(plan);
        if (suggestions.length > 0) {
            console.log(`[RefactoringExecutor] Found ${suggestions.length} improvement suggestions in plan.`);
            let noteContext: ImprovementNoteContext | undefined = undefined;
            if (editor) { // Use editor from createRefactoringPlan scope
                 noteContext = { filePath: filePath };
                 if (targetSymbol) { // Use targetSymbol from createRefactoringPlan scope
                     noteContext.symbolName = targetSymbol.name;
                      noteContext.selection = {
                          startLine: targetSymbol.startLine,
                          startChar: targetSymbol.startChar,
                          endLine: targetSymbol.endLine,
                          endChar: targetSymbol.endChar
                      };
                 }
             }
            for (const suggestion of suggestions) {
                try {
                     await improvementManager.addNote(suggestion, noteContext);
                     vscode.window.showInformationMessage(`Improvement suggestion noted: ${suggestion.substring(0, 30)}...`);
                     console.log(`[RefactoringExecutor] Automatically noted improvement from plan: ${suggestion.substring(0, 50)}...`);
                } catch (noteError) {
                    console.error('Error automatically noting improvement from plan:', noteError);
                }
            }
        }
        // --------------------------------------------

        return plan;
    }

    private buildRefactoringPlanPrompt(
        contextInfo: string, 
        codeSnippet: string, 
        analysis: CodeAnalysis, 
        fileContext: any,
        references: vscode.Location[]
    ): string {
        const metrics = this.formatMetrics(analysis.metrics);
        const suggestions = analysis.suggestions
            .map(s => `- ${s.type}: ${s.description} (Priority: ${s.priority})`)
            .join('\n');

        // --- Build References Section --- 
        let referencesSection = '';
        if (references.length > 0) {
            referencesSection = '\nKnown Usages (Locations of potential references):\n';
            // Group by file path for readability
            const refsByFile = references.reduce((acc, ref) => {
                (acc[ref.uri.fsPath] = acc[ref.uri.fsPath] || []).push(ref.range.start.line);
                return acc;
            }, {} as Record<string, number[]>);

            for (const [filePath, lines] of Object.entries(refsByFile)) {
                referencesSection += `- ${filePath} (Lines: ${(lines as number[]).sort((a: number, b: number)=>a-b).join(', ')})\n`;
            }
            referencesSection += '\n';
        }
        // -------------------------------

        return `
Please analyze the code snippet below and create a focused refactoring plan for it. You are working on: ${contextInfo}.

Code Snippet to Refactor:
\`\`\`${fileContext.language}
${codeSnippet}
\`\`\`
${referencesSection}
Overall File Metrics (for context, but focus analysis on the snippet):
${metrics}

Overall File Issues and Suggestions (for context, but focus analysis on the snippet):
${suggestions}

Refactoring Requirements (apply these primarily to the snippet):
1. Identify code smells and anti-patterns WITHIN the snippet.
2. Suggest design pattern implementations if appropriate for the snippet.
3. Consider performance improvements relevant to the snippet.
4. Maintain backwards compatibility for the snippet's external interface (if applicable).
5. Ensure type safety within the snippet.
6. Follow ${fileContext.language} best practices for the snippet.
7. Consider test impact for the snippet's functionality.
8. **IMPORTANT:** Consider the listed 'Known Usages'. If renaming or changing the signature, the plan MUST include steps to update these usages.

Language: ${fileContext.language}
Framework: ${fileContext.framework || 'None'}

Please provide a plan focusing ONLY on refactoring the provided snippet and updating its known usages. Locations in the plan (smells, change steps) should be relative to the START of the snippet (1-based). Steps for updating usages should specify the target file and line number.`;
    }

    private formatMetrics(metrics: CodeMetrics): string {
        return `
Complexity: ${metrics.complexity}
Maintainability: ${metrics.maintainability}
Testability: ${metrics.testability}
Documentation: ${metrics.documentation}
Duplications: ${metrics.duplications}
`;
    }

    private getRefactoringPlanSystemPrompt(): string {
        return `You are a refactoring expert. Your role is to:
1. Analyze code quality and structure for the provided snippet.
2. Identify improvement opportunities within the snippet.
3. Plan safe and effective refactoring steps for the snippet.
4. Consider code maintainability.
5. Ensure backward compatibility where applicable.
6. Follow clean code principles.
7. **IMPORTANT:** If your analysis reveals potential improvements beyond the immediate refactoring scope, or alternative approaches, flag them using the format: [IMPROVEMENT_SUGGESTION]: <Your suggestion here>.

Provide your refactoring plan in this JSON format (locations relative to snippet start):
{
    "analysis": {
        "codeSmells": [
            {
                "type": "smell type",
                "description": "smell description (potentially include [IMPROVEMENT_SUGGESTION]: flag)", 
                "severity": "high|medium|low",
                "location": {
                    "startLine": number,
                    "endLine": number
                }
            }
        ],
        "designIssues": [
            {
                "type": "issue type",
                "description": "issue description (potentially include [IMPROVEMENT_SUGGESTION]: flag)",
                "suggestedPattern": "design pattern name",
                "rationale": "why this pattern"
            }
        ],
        "performanceIssues": [
            {
                "description": "issue description",
                "impact": "impact description",
                "suggestion": "improvement suggestion"
            }
        ]
    },
    "changes": [
        {
            "id": "unique change id",
            "type": "extract|move|rename|inline|split|merge",
            "description": "change description (potentially include [IMPROVEMENT_SUGGESTION]: flag for alternatives)",
            "rationale": "why this change",
            "impact": {
                "complexity": "impact on complexity",
                "maintainability": "impact on maintainability",
                "scope": ["affected areas"]
            },
            "steps": [
                {
                    "order": number,
                    "action": "what to do",
                    "target": {
                        "startLine": number,
                        "endLine": number
                    },
                    "code": "new code"
                }
            ]
        }
    ],
    "risks": [
        {
            "type": "risk type",
            "description": "risk description",
            "mitigation": "how to mitigate"
        }
    ],
    "testingStrategy": {
        "impactedTests": ["test names"],
        "newTestsNeeded": ["test descriptions"],
        "regressionRisks": ["risk descriptions"]
    }
}`;
    }

    private parseRefactoringPlan(aiResponse: string): RefactoringPlan {
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            console.error('Error parsing refactoring plan:', error);
            throw new Error('Failed to parse AI response for refactoring plan');
        }
    }

    private async generateRefactoringChanges(plan: RefactoringPlan): Promise<RefactoringChanges> {
        const prompt = this.buildRefactoringChangesPrompt(plan);
        
        const response = await this.aiEngine.generateResponse({
            messages: [
                { role: 'system', content: this.getRefactoringChangesSystemPrompt() },
                { role: 'user', content: prompt }
            ],
            context: {
                prompt: prompt
            }
        });

        return this.parseRefactoringChanges(response.message);
    }

    private buildRefactoringChangesPrompt(plan: RefactoringPlan): string {
        return `Based on the plan:
${JSON.stringify(plan, null, 2)}
Generate the code changes in JSON format matching RefactoringChanges interface.`;
    }

    private getRefactoringChangesSystemPrompt(): string {
        return `You generate code changes based on a refactoring plan. Output ONLY the JSON.`;
    }

    private parseRefactoringChanges(aiResponse: string): RefactoringChanges {
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            console.error('Error parsing refactoring changes:', error);
            throw new Error('Failed to parse AI response for refactoring changes');
        }
    }

    private async showRefactoringPreview(changes: RefactoringChanges, plan: RefactoringPlan): Promise<boolean> {
        const panel = vscode.window.createWebviewPanel(
            'refactoringPreview',
            'Refactoring Preview',
            vscode.ViewColumn.Two,
            {
                enableScripts: true
            }
        );

        panel.webview.html = this.generatePreviewHTML(changes, plan);

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

    private generatePreviewHTML(changes: RefactoringChanges, plan: RefactoringPlan): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>Refactoring Preview</title>
    <style>
        :root {
            --primary-color: #007acc;
            --secondary-color: #3d3d3d; /* A bit lighter for sections */
            --background-color: #1e1e1e;
            --text-color: #d4d4d4;
            --border-color: #404040;
            --success-color: #4caf50;
            --warning-color: #ff9800;
            --error-color: #f44336;
            --info-color: #2196f3;
            /* Use VS Code theme variables for better integration */
            --vscode-editor-background: var(--vscode-editor-background, #1e1e1e);
            --vscode-editor-foreground: var(--vscode-editor-foreground, #d4d4d4);
            --vscode-editorGutter-background: var(--vscode-editorGutter-background, #1e1e1e);
            --vscode-editorLineNumber-foreground: var(--vscode-editorLineNumber-foreground, #858585);
            --vscode-descriptionForeground: var(--vscode-descriptionForeground, #cccccc);
            --vscode-editorInfo-foreground: var(--vscode-editorInfo-foreground, #9cdcfe);
            --vscode-editorWarning-foreground: var(--vscode-editorWarning-foreground, #ffcc00);
            --vscode-editorError-foreground: var(--vscode-editorError-foreground, #f44747);
            --vscode-button-background: var(--vscode-button-background, #0e639c);
            --vscode-button-foreground: var(--vscode-button-foreground, #ffffff);
            --vscode-button-hoverBackground: var(--vscode-button-hoverBackground, #1177bb);
            --vscode-input-background: var(--vscode-input-background, #3c3c3c);
            --vscode-input-border: var(--vscode-input-border, #3c3c3c);
            --vscode-font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
            --vscode-font-size: var(--vscode-editor-font-size, 14px);
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-size: var(--vscode-font-size);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-color);
        }
        .header h1 {
            color: var(--primary-color);
            margin: 0;
        }

        .section {
            background-color: var(--secondary-color);
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid var(--border-color);
        }

        .section h2 {
            color: var(--primary-color);
            margin-top: 0;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 10px;
        }
        .section h3 {
             color: var(--vscode-editorInfo-foreground);
             margin-top: 15px;
             margin-bottom: 10px;
             font-weight: 600;
        }
        .section h4 {
             color: var(--vscode-descriptionForeground);
             margin-top: 10px;
             margin-bottom: 5px;
             font-weight: normal;
        }


        pre {
            margin: 5px 0 10px 0;
            padding: 10px;
            background-color: var(--vscode-input-background); /* Use input background for contrast */
            border: 1px solid var(--border-color);
            border-radius: 4px;
            overflow-x: auto;
            color: var(--vscode-editor-foreground);
        }
        code {
             font-family: var(--vscode-font-family);
             font-size: inherit; /* Inherit from body or container */
        }

        .analysis { } /* Specific styles for analysis section if needed */

        .issue, .risk-item, .test-item, .step, .change-item, .edit-detail {
            background-color: var(--vscode-editorGutter-background); /* Slightly different bg */
            padding: 10px 15px;
            border-radius: 4px;
            margin-bottom: 10px;
            border: 1px solid var(--border-color);
        }
        .issue h4, .change-item h4 {
             color: var(--vscode-editorInfo-foreground);
             margin: 0 0 8px 0;
             font-size: 1.05em;
             border-bottom: 1px dashed var(--border-color);
             padding-bottom: 5px;
        }
         .risk-item strong, .test-item strong {
             color: var(--vscode-editorInfo-foreground);
         }


        .tag {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px; /* More rounded */
            font-size: 0.85em;
            margin-right: 8px;
            color: white; /* Ensure contrast */
            font-weight: bold;
        }

        .tag.high { background-color: var(--vscode-editorError-foreground); }
        .tag.medium { background-color: var(--vscode-editorWarning-foreground); }
        .tag.low { background-color: var(--success-color); } /* Keep custom green or use a vscode info color */

        ul {
             margin: 5px 0 10px 0;
             padding-left: 25px;
             list-style: disc;
        }
         li {
             margin-bottom: 5px;
         }


        /* --- Improved Styles for Changes Section --- */
        .change-item { } /* Base style already defined */

        .edit-detail {
            margin-bottom: 15px; /* Add more space between edits */
            padding-left: 15px;
            border-left: 3px solid var(--primary-color);
        }
        .edit-info {
            margin-bottom: 8px; /* Space below info line */
            display: flex;
            align-items: center;
            gap: 10px; /* Space between type and location */
        }
        .edit-type {
            font-weight: bold;
            background-color: var(--primary-color);
            color: white;
            padding: 3px 8px; /* Slightly larger padding */
            border-radius: 4px; /* Match other radius */
            font-size: 0.9em;
            /* margin-right: 10px; */ /* Use gap instead */
        }
        .edit-location {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .edit-description {
            margin-top: 5px;
            margin-bottom: 8px; /* More space before code */
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .edit-detail h5 { /* Style for 'New Code:' header */
            margin-top: 10px;
            margin-bottom: 5px;
            font-size: 0.9em;
            font-weight: bold;
            color: var(--vscode-editorInfo-foreground);
        }
        /* pre/code styles already defined, ensure they apply */
        /* --- End of Improved Changes Section Styles --- */


        .button-container {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
            padding-top: 15px;
             border-top: 1px solid var(--border-color);
        }

        .button {
            padding: 8px 16px;
            border: 1px solid transparent; /* Add border for definition */
            border-radius: 4px;
            cursor: pointer;
            font-size: inherit; /* Use base font size */
            transition: background-color 0.2s, border-color 0.2s;
        }

        .approve {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        .approve:hover {
             background-color: var(--vscode-button-hoverBackground);
             border-color: var(--vscode-button-hoverBackground);
        }

        .reject {
            background-color: var(--vscode-editorError-foreground); /* Use error color for reject */
            color: white;
            border-color: var(--vscode-editorError-foreground);
        }
         .reject:hover {
             opacity: 0.8; /* Dim on hover */
         }

    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Refactoring Preview</h1>
        </div>

        <div class="section analysis">
            <h2>Analysis</h2>

            ${plan.analysis.codeSmells?.length > 0 ? `
                <h3>Code Smells</h3>
                ${plan.analysis.codeSmells.map(smell => `
                    <div class="issue">
                        <span class="tag ${smell.severity}">${smell.severity}</span>
                        <h4>${this.escapeHtml(smell.type)}</h4>
                        <p>${this.escapeHtml(smell.description)}</p>
                        ${smell.location ? `<div><small>Location: Lines ${smell.location.startLine}-${smell.location.endLine}</small></div>` : ''}
                    </div>
                `).join('')}
            ` : '<h3>Code Smells</h3><p>None identified.</p>'}

             ${plan.analysis.designIssues?.length > 0 ? `
                <h3>Design Issues</h3>
                ${plan.analysis.designIssues.map(issue => `
                    <div class="issue">
                        <h4>${this.escapeHtml(issue.type)}</h4>
                        <p>${this.escapeHtml(issue.description)}</p>
                        <p><strong>Suggested Pattern:</strong> ${this.escapeHtml(issue.suggestedPattern)}</p>
                        <p><small>Rationale: ${this.escapeHtml(issue.rationale)}</small></p>
                    </div>
                `).join('')}
             ` : '<h3>Design Issues</h3><p>None identified.</p>'}

            ${plan.analysis.performanceIssues?.length > 0 ? `
                <h3>Performance Issues</h3>
                ${plan.analysis.performanceIssues.map(issue => `
                    <div class="issue">
                        <p>${this.escapeHtml(issue.description)}</p>
                        <p><strong>Impact:</strong> ${this.escapeHtml(issue.impact)}</p>
                        <p><strong>Suggestion:</strong> ${this.escapeHtml(issue.suggestion)}</p>
                    </div>
                `).join('')}
             ` : '<h3>Performance Issues</h3><p>None identified.</p>'}
        </div>

        <!-- Updated Changes Section -->
        <div class="section changes">
             <h2>Proposed Changes</h2>
             ${changes.fileChanges && changes.fileChanges.length > 0
                 ? changes.fileChanges.map(file => `
                 <div class="change-item">
                     <h4>File: ${this.escapeHtml(file.filePath)}</h4>
                     ${file.edits && file.edits.length > 0
                         ? file.edits.map(edit => `
                         <div class="edit-detail">
                             <div class="edit-info">
                                 <!-- Display type if available, default to MODIFY -->
                                 <span class="edit-type">${this.escapeHtml(edit.type || 'MODIFY')}</span>
                                 <!-- Display range -->
                                 <span class="edit-location">Lines ${edit.range.startLine}-${edit.range.endLine}</span>
                             </div>
                             <!-- Display description if available -->
                             ${edit.description ? `<p class="edit-description">${this.escapeHtml(edit.description)}</p>` : ''}
                             <!-- Display new code block clearly -->
                             <h5>New Code:</h5>
                             <pre><code>${this.escapeHtml(edit.newText)}</code></pre>
                         </div>
                     `).join('')
                         : '<p>No specific edits provided for this file.</p>'
                     }
                 </div>
             `).join('')
                 : '<p>No file changes proposed.</p>'
             }
         </div>
         <!-- End of Updated Changes Section -->


        ${changes.orderOfExecution && changes.orderOfExecution.length > 0 ? `
        <div class="section">
            <h2>Execution Plan (Order)</h2>
            ${changes.orderOfExecution.map(step => `
                <div class="step">
                    <h4>Step ${step.step}</h4>
                    <div>File: ${this.escapeHtml(step.fileChange)}</div>
                    <div>Change Index: ${step.changeIndex}</div>
                    <div>Dependencies: ${step.dependencies.join(', ') || 'None'}</div>
                </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="section">
            <h2>Risks and Testing</h2>
            <div class="risks">
                <h3>Identified Risks</h3>
                 ${plan.risks?.length > 0 ? `
                    <ul>
                        ${plan.risks.map(risk => `
                            <li class="risk-item">
                                <strong>${this.escapeHtml(risk.type)}:</strong> ${this.escapeHtml(risk.description)}
                                <br>
                                <small>Mitigation: ${this.escapeHtml(risk.mitigation)}</small>
                            </li>
                        `).join('')}
                    </ul>
                 ` : '<p>No specific risks identified.</p>'}
            </div>

            <div class="testing">
                <h3>Testing Strategy</h3>
                <p><strong>Impacted Tests:</strong></p>
                ${plan.testingStrategy?.impactedTests?.length > 0 ? `
                    <ul>${plan.testingStrategy.impactedTests.map(test => `<li>${this.escapeHtml(test)}</li>`).join('')}</ul>
                ` : '<p>None specified.</p>'}

                <p><strong>New Tests Needed:</strong></p>
                ${plan.testingStrategy?.newTestsNeeded?.length > 0 ? `
                     <ul>${plan.testingStrategy.newTestsNeeded.map(test => `<li>${this.escapeHtml(test)}</li>`).join('')}</ul>
                 ` : '<p>None specified.</p>'}

                <p><strong>Regression Risks:</strong></p>
                 ${plan.testingStrategy?.regressionRisks?.length > 0 ? `
                     <ul>${plan.testingStrategy.regressionRisks.map(risk => `<li>${this.escapeHtml(risk)}</li>`).join('')}</ul>
                 ` : '<p>None specified.</p>'}
            </div>
        </div>

        <div class="button-container">
            <button class="button reject">Reject</button>
            <button class="button approve">Approve</button>
        </div>
    </div>

    <script>
        // Use VS Code API to post messages
        const vscode = acquireVsCodeApi();

        document.querySelector('.approve').addEventListener('click', () => {
            // vscode.postMessage({ command: 'approve' }, '*'); // '*' is not needed for acquireVsCodeApi
             vscode.postMessage({ command: 'approve' });
        });

        document.querySelector('.reject').addEventListener('click', () => {
            // vscode.postMessage({ command: 'reject' }, '*');
            vscode.postMessage({ command: 'reject' });
        });
    </script>
</body>
</html>`;
    }

    private escapeHtml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    private async applyRefactoring(changes: RefactoringChanges): Promise<void> {
        console.warn('[RefactoringExecutor] applyRefactoring currently only supports single-file changes based on AI plan structure. Multi-file reference updates are NOT implemented.');

        const workspaceEdit = new vscode.WorkspaceEdit();

        if (changes?.fileChanges) { 
            for (const fileChange of changes.fileChanges) {
                const fileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, fileChange.filePath);
                for (const edit of fileChange.edits) { 
                     const range = new vscode.Range(edit.range.startLine -1, edit.range.startChar, edit.range.endLine -1, edit.range.endChar);
                     workspaceEdit.replace(fileUri, range, edit.newText);
                }
            }
        }

        const success = await vscode.workspace.applyEdit(workspaceEdit);
        if (!success) {
            throw new Error('Failed to apply refactoring edits.');
        }
    }

    // Adjust plan location helper method
    private adjustPlanLocations(plan: RefactoringPlan, baseLineOffset: number): void {
         if (plan.analysis?.codeSmells) {
            plan.analysis.codeSmells.forEach(smell => {
                if (smell.location) {
                    smell.location.startLine = Math.max(1, smell.location.startLine) + baseLineOffset;
                    smell.location.endLine = Math.max(1, smell.location.endLine) + baseLineOffset;
                }
            });
        }
        if (plan.changes) {
            plan.changes.forEach((change: any) => { 
                if (change.steps) {
                    change.steps.forEach((step: any) => {
                        if (step.target) {
                            step.target.startLine = Math.max(1, step.target.startLine) + baseLineOffset;
                            step.target.endLine = Math.max(1, step.target.endLine) + baseLineOffset;
                        }
                    });
                }
            });
        }
    }

    // Add suggestion extraction helper
    /**
     * Extracts improvement suggestions flagged in the refactoring plan.
     * @param plan The parsed refactoring plan.
     * @returns An array of suggestion strings.
     */
    private extractSuggestionsFromPlan(plan: RefactoringPlan): string[] {
        const suggestions: string[] = [];
        const regex = /\\\[IMPROVEMENT_SUGGESTION\\\]:\\s*(.*)/gi; // Case-insensitive, global

        const checkContent = (content: string | undefined) => {
            if (!content) return;
            let match;
            regex.lastIndex = 0; // Reset regex state
            while ((match = regex.exec(content)) !== null) {
                if (match[1]) suggestions.push(match[1].trim());
            }
        };

        // Check analysis descriptions
        plan.analysis?.codeSmells?.forEach(smell => checkContent(smell.description));
        plan.analysis?.designIssues?.forEach(issue => checkContent(issue.description));
        plan.analysis?.performanceIssues?.forEach(issue => {
             checkContent(issue.description);
             checkContent(issue.suggestion); // Check both fields separately
        });

        // Check changes descriptions
        plan.changes?.forEach(change => checkContent(change.description));

        // Check risks descriptions/mitigations
        plan.risks?.forEach(risk => {
             checkContent(risk.description); 
             checkContent(risk.mitigation); // Check both fields separately
        });

        return suggestions;
    }
}