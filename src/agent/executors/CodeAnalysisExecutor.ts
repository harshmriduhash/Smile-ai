import * as vscode from 'vscode';
import { Task, TaskType, TaskResult, TaskExecutor } from '../types';
import { CodeAnalysis, CodeSuggestion } from '../../utils/CodeAnalyzer';
import { AIEngine } from '../../ai-engine/AIEngine';
import { AIMessage } from '../../ai-engine/types';

export class CodeAnalysisExecutor implements TaskExecutor {
    private readonly aiEngine: AIEngine;

    constructor(aiEngine: AIEngine) {
        this.aiEngine = aiEngine;
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.CODE_ANALYSIS;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            if (!task.metadata?.fileContext || !task.metadata?.codeAnalysis) {
                throw new Error('Task metadata is missing required analysis context');
            }

            // Detaylı analiz raporu oluştur
            const analysisReport = await this.generateAnalysisReport(task);

            // Önerileri WebView panelinde göster
            await this.showAnalysisResults(analysisReport);

            return {
                success: true,
                data: analysisReport,
                aiResponse: analysisReport.aiInsights
            };
        } catch (error) {
            console.error('Error in CodeAnalysisExecutor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in code analysis'
            };
        }
    }

    private async generateAnalysisReport(task: Task): Promise<AnalysisReport> {
        const { codeAnalysis, fileContext } = task.metadata!;

        // AI'dan detaylı analiz iste
        const aiInsights = await this.getAIInsights(codeAnalysis, fileContext);

        // Önerileri önceliklendir ve grupla
        const prioritizedSuggestions = this.prioritizeSuggestions(codeAnalysis.suggestions);

        // Metrik açıklamalarını oluştur
        const metricInsights = this.generateMetricInsights(codeAnalysis);

        return {
            overview: {
                fileName: fileContext.language,
                fileType: fileContext.fileType,
                framework: fileContext.framework,
                totalIssues: codeAnalysis.suggestions.length,
                complexity: codeAnalysis.metrics.complexity,
                maintainability: codeAnalysis.metrics.maintainability
            },
            metrics: metricInsights,
            suggestions: prioritizedSuggestions,
            aiInsights,
            codeStructure: {
                classes: codeAnalysis.structure.classes.length,
                functions: codeAnalysis.structure.functions.length,
                dependencies: codeAnalysis.dependencies.length,
                exports: codeAnalysis.structure.exports.length
            }
        };
    }

    private async getAIInsights(codeAnalysis: CodeAnalysis, fileContext: any) {
        const messages: AIMessage[] = [{
            role: 'user',
            content: `
Please analyze this code and provide insights on:
1. Overall code quality and architecture
2. Potential improvements and best practices
3. Security considerations
4. Performance optimization opportunities
5. Maintainability recommendations

Code Metrics:
- Complexity: ${codeAnalysis.metrics.complexity}
- Maintainability: ${codeAnalysis.metrics.maintainability}
- Documentation: ${codeAnalysis.metrics.documentation}
- Duplications: ${codeAnalysis.metrics.duplications}

Language: ${fileContext.language}
Framework: ${fileContext.framework || 'None'}
`,
            timestamp: Date.now()
        }];

        const response = await this.aiEngine.generateResponse({
            messages,
            systemPrompt: this.getAnalysisSystemPrompt()
        });

        return response.message;
    }

    private prioritizeSuggestions(suggestions: CodeSuggestion[]): PrioritizedSuggestions {
        const result: PrioritizedSuggestions = {
            critical: [],
            high: [],
            medium: [],
            low: []
        };

        for (const suggestion of suggestions) {
            switch (suggestion.priority) {
                case 'high':
                    if (suggestion.type === 'security') {
                        result.critical.push(suggestion);
                    } else {
                        result.high.push(suggestion);
                    }
                    break;
                case 'medium':
                    result.medium.push(suggestion);
                    break;
                case 'low':
                    result.low.push(suggestion);
                    break;
            }
        }

        return result;
    }

    private generateMetricInsights(analysis: CodeAnalysis): MetricInsights {
        return {
            complexity: {
                score: analysis.metrics.complexity,
                interpretation: this.interpretComplexity(analysis.metrics.complexity),
                recommendations: this.getComplexityRecommendations(analysis.metrics.complexity)
            },
            maintainability: {
                score: analysis.metrics.maintainability,
                interpretation: this.interpretMaintainability(analysis.metrics.maintainability),
                recommendations: this.getMaintainabilityRecommendations(analysis.metrics.maintainability)
            },
            testability: {
                score: analysis.metrics.testability,
                interpretation: this.interpretTestability(analysis.metrics.testability),
                recommendations: this.getTestabilityRecommendations(analysis.metrics.testability)
            },
            documentation: {
                score: analysis.metrics.documentation,
                interpretation: this.interpretDocumentation(analysis.metrics.documentation),
                recommendations: this.getDocumentationRecommendations(analysis.metrics.documentation)
            }
        };
    }

    private async showAnalysisResults(report: AnalysisReport): Promise<void> {
        // WebView panel oluştur
        const panel = vscode.window.createWebviewPanel(
            'codeAnalysis',
            'Code Analysis Results',
            vscode.ViewColumn.Two,
            {
                enableScripts: true
            }
        );

        // Panel içeriğini oluştur
        panel.webview.html = this.generateAnalysisHTML(report);

        // Panel mesajlarını dinle
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'applyFix':
                        await this.applyAutoFix(message.suggestion);
                        break;
                    case 'showDetail':
                        await this.showSuggestionDetail(message.suggestion);
                        break;
                }
            },
            undefined
        );
    }

    private generateAnalysisHTML(report: AnalysisReport): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>Code Analysis Report</title>
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
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
        }

        .overview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .metric-card {
            background-color: var(--secondary-color);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .metric-card h3 {
            margin: 0 0 10px 0;
            color: var(--primary-color);
        }

        .metric-value {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }

        .suggestions-container {
            margin-top: 30px;
        }

        .suggestion-group {
            margin-bottom: 20px;
        }

        .suggestion-group h3 {
            color: var(--primary-color);
            margin-bottom: 15px;
        }

        .suggestion-item {
            background-color: var(--secondary-color);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .suggestion-content {
            flex: 1;
        }

        .suggestion-actions {
            display: flex;
            gap: 10px;
        }

        .button {
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }

        .button:hover {
            background-color: #005999;
        }

        .tag {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            margin-right: 8px;
        }

        .tag.critical { background-color: var(--error-color); }
        .tag.high { background-color: var(--warning-color); }
        .tag.medium { background-color: var(--info-color); }
        .tag.low { background-color: var(--success-color); }

        .metrics-details {
            margin-top: 30px;
        }

        .metric-detail {
            background-color: var(--secondary-color);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .metric-detail h3 {
            color: var(--primary-color);
            margin-top: 0;
        }

        .recommendations-list {
            list-style-type: none;
            padding: 0;
        }

        .recommendations-list li {
            margin-bottom: 8px;
            padding-left: 20px;
            position: relative;
        }

        .recommendations-list li::before {
            content: "→";
            position: absolute;
            left: 0;
            color: var(--primary-color);
        }

        .code-structure {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 30px;
        }

        .structure-item {
            background-color: var(--secondary-color);
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }

        .structure-item .value {
            font-size: 24px;
            font-weight: bold;
            color: var(--primary-color);
        }

        .structure-item .label {
            margin-top: 5px;
            font-size: 14px;
            color: var(--text-color);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Code Analysis Report</h1>
            <div>
                <span>File: ${report.overview.fileName}</span>
                <span>Type: ${report.overview.fileType}</span>
                ${report.overview.framework ? `<span>Framework: ${report.overview.framework}</span>` : ''}
            </div>
        </div>

        <div class="overview-grid">
            <div class="metric-card">
                <h3>Complexity</h3>
                <div class="metric-value">${report.metrics.complexity.score}</div>
                <div>${report.metrics.complexity.interpretation}</div>
            </div>
            <div class="metric-card">
                <h3>Maintainability</h3>
                <div class="metric-value">${report.metrics.maintainability.score}</div>
                <div>${report.metrics.maintainability.interpretation}</div>
            </div>
            <div class="metric-card">
                <h3>Testability</h3>
                <div class="metric-value">${report.metrics.testability.score}</div>
                <div>${report.metrics.testability.interpretation}</div>
            </div>
            <div class="metric-card">
                <h3>Documentation</h3>
                <div class="metric-value">${report.metrics.documentation.score}</div>
                <div>${report.metrics.documentation.interpretation}</div>
            </div>
        </div>

        <div class="code-structure">
            <div class="structure-item">
                <div class="value">${report.codeStructure.classes}</div>
                <div class="label">Classes</div>
            </div>
            <div class="structure-item">
                <div class="value">${report.codeStructure.functions}</div>
                <div class="label">Functions</div>
            </div>
            <div class="structure-item">
                <div class="value">${report.codeStructure.dependencies}</div>
                <div class="label">Dependencies</div>
            </div>
            <div class="structure-item">
                <div class="value">${report.codeStructure.exports}</div>
                <div class="label">Exports</div>
            </div>
        </div>

        <div class="suggestions-container">
            <h2>Suggestions</h2>
            ${this.generateSuggestionsHTML(report.suggestions)}
        </div>

        <div class="metrics-details">
            <h2>Detailed Metrics</h2>
            ${this.generateMetricsDetailsHTML(report.metrics)}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function applyFix(suggestionId) {
            vscode.postMessage({
                command: 'applyFix',
                suggestion: suggestionId
            });
        }

        function showDetail(suggestionId) {
            vscode.postMessage({
                command: 'showDetail',
                suggestion: suggestionId
            });
        }
    </script>
</body>
</html>`;
    }

    private generateSuggestionsHTML(suggestions: PrioritizedSuggestions): string {
        const generateSuggestionGroup = (title: string, items: CodeSuggestion[], priority: string) => {
            if (items.length === 0) return '';
            
            return `
                <div class="suggestion-group">
                    <h3>${title} (${items.length})</h3>
                    ${items.map(suggestion => `
                        <div class="suggestion-item">
                            <div class="suggestion-content">
                                <span class="tag ${priority}">${suggestion.type}</span>
                                ${suggestion.description}
                            </div>
                            <div class="suggestion-actions">
                                <button class="button" onclick="showDetail('${suggestion.location}')">Details</button>
                                <button class="button" onclick="applyFix('${suggestion.location}')">Fix</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        };

        return `
            ${generateSuggestionGroup('Critical Issues', suggestions.critical, 'critical')}
            ${generateSuggestionGroup('High Priority', suggestions.high, 'high')}
            ${generateSuggestionGroup('Medium Priority', suggestions.medium, 'medium')}
            ${generateSuggestionGroup('Low Priority', suggestions.low, 'low')}
        `;
    }

    private generateMetricsDetailsHTML(metrics: MetricInsights): string {
        const generateMetricDetail = (title: string, metric: MetricDetail) => `
            <div class="metric-detail">
                <h3>${title}</h3>
                <p>${metric.interpretation}</p>
                <h4>Recommendations:</h4>
                <ul class="recommendations-list">
                    ${metric.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        `;

        return `
            ${generateMetricDetail('Complexity Analysis', metrics.complexity)}
            ${generateMetricDetail('Maintainability Analysis', metrics.maintainability)}
            ${generateMetricDetail('Testability Analysis', metrics.testability)}
            ${generateMetricDetail('Documentation Analysis', metrics.documentation)}
        `;
    }

    private async applyAutoFix(suggestion: CodeSuggestion): Promise<void> {
        if (suggestion.fix) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            const uri = vscode.Uri.file(suggestion.file);
            const range = new vscode.Range(
                suggestion.range.start.line,
                suggestion.range.start.character,
                suggestion.range.end.line,
                suggestion.range.end.character
            );
            workspaceEdit.replace(uri, range, suggestion.fix);
            await vscode.workspace.applyEdit(workspaceEdit);
        }
    }

    private async showSuggestionDetail(suggestion: CodeSuggestion): Promise<void> {
        const message = `
Type: ${suggestion.type}
Priority: ${suggestion.priority}
Description: ${suggestion.description}
Location: ${suggestion.file}:${suggestion.range.start.line + 1}:${suggestion.range.start.character + 1}
${suggestion.fix ? `\nSuggested Fix:\n${suggestion.fix}` : ''}
`;
        await vscode.window.showInformationMessage(message, { modal: true });
    }

    private getAnalysisSystemPrompt(): string {
        return `You are a code analysis expert. Your role is to:
1. Analyze code quality and structure
2. Identify potential improvements
3. Suggest best practices
4. Consider security implications
5. Evaluate performance aspects
6. Provide actionable recommendations
Please provide your analysis in a structured JSON format.`;
    }

    private interpretComplexity(score: number): string {
        if (score <= 5) {
            return "Excellent complexity score. The code is simple and easy to understand.";
        } else if (score <= 10) {
            return "Good complexity score. The code is reasonably maintainable.";
        } else if (score <= 20) {
            return "Moderate complexity. Consider breaking down complex functions.";
        } else if (score <= 30) {
            return "High complexity. Code may be difficult to maintain and test.";
        } else {
            return "Very high complexity. Immediate refactoring is recommended.";
        }
    }

    private getComplexityRecommendations(score: number): string[] {
        const recommendations: string[] = [];

        if (score > 10) {
            recommendations.push("Break down complex functions into smaller, more focused functions");
            recommendations.push("Reduce nested conditionals using early returns or guard clauses");
        }
        if (score > 20) {
            recommendations.push("Consider extracting complex logic into separate utility classes");
            recommendations.push("Implement design patterns to better organize complex logic");
        }
        if (score > 30) {
            recommendations.push("Perform major refactoring to simplify code structure");
            recommendations.push("Consider rewriting complex parts using more maintainable approaches");
        }

        return recommendations;
    }

    private interpretMaintainability(score: number): string {
        if (score >= 85) {
            return "Highly maintainable code. Well structured and documented.";
        } else if (score >= 70) {
            return "Good maintainability. Minor improvements possible.";
        } else if (score >= 50) {
            return "Moderate maintainability. Several areas need attention.";
        } else if (score >= 30) {
            return "Poor maintainability. Significant improvements needed.";
        } else {
            return "Very poor maintainability. Major refactoring required.";
        }
    }

    private getMaintainabilityRecommendations(score: number): string[] {
        const recommendations: string[] = [];

        if (score < 85) {
            recommendations.push("Improve code documentation and comments");
            recommendations.push("Follow consistent naming conventions");
        }
        if (score < 70) {
            recommendations.push("Reduce code duplication through abstraction");
            recommendations.push("Improve function and class organization");
        }
        if (score < 50) {
            recommendations.push("Break down large classes and functions");
            recommendations.push("Implement proper error handling");
        }
        if (score < 30) {
            recommendations.push("Consider major architectural improvements");
            recommendations.push("Implement comprehensive testing");
        }

        return recommendations;
    }

    private interpretTestability(score: number): string {
        if (score >= 90) {
            return "Excellent testability. Code is well-structured for testing.";
        } else if (score >= 75) {
            return "Good testability. Most components can be tested easily.";
        } else if (score >= 60) {
            return "Moderate testability. Some components may be difficult to test.";
        } else if (score >= 40) {
            return "Poor testability. Significant improvements needed for testing.";
        } else {
            return "Very poor testability. Code structure makes testing very difficult.";
        }
    }

    private getTestabilityRecommendations(score: number): string[] {
        const recommendations: string[] = [];

        if (score < 90) {
            recommendations.push("Ensure proper dependency injection");
            recommendations.push("Create interfaces for better abstraction");
        }
        if (score < 75) {
            recommendations.push("Reduce dependencies between components");
            recommendations.push("Implement clear separation of concerns");
        }
        if (score < 60) {
            recommendations.push("Break down complex methods for better testing");
            recommendations.push("Add proper mocking points in the code");
        }
        if (score < 40) {
            recommendations.push("Restructure code to be more modular");
            recommendations.push("Implement dependency inversion principle");
        }

        return recommendations;
    }

    private interpretDocumentation(score: number): string {
        if (score >= 90) {
            return "Excellent documentation. Code is well-documented with clear explanations.";
        } else if (score >= 70) {
            return "Good documentation. Most important parts are documented.";
        } else if (score >= 50) {
            return "Moderate documentation. Some critical parts lack documentation.";
        } else if (score >= 30) {
            return "Poor documentation. Many important parts are not documented.";
        } else {
            return "Very poor documentation. Little to no documentation present.";
        }
    }

    private getDocumentationRecommendations(score: number): string[] {
        const recommendations: string[] = [];

        if (score < 90) {
            recommendations.push("Add JSDoc comments to public APIs");
            recommendations.push("Include examples in documentation");
        }
        if (score < 70) {
            recommendations.push("Document complex algorithms and business logic");
            recommendations.push("Add inline comments for complex code sections");
        }
        if (score < 50) {
            recommendations.push("Create README files for major components");
            recommendations.push("Document error handling and edge cases");
        }
        if (score < 30) {
            recommendations.push("Implement comprehensive documentation strategy");
            recommendations.push("Add architecture and design documentation");
        }

        return recommendations;
    }
}

interface AnalysisReport {
    overview: {
        fileName: string;
        fileType: string;
        framework?: string;
        totalIssues: number;
        complexity: number;
        maintainability: number;
    };
    metrics: MetricInsights;
    suggestions: PrioritizedSuggestions;
    aiInsights: any;
    codeStructure: {
        classes: number;
        functions: number;
        dependencies: number;
        exports: number;
    };
}

interface MetricInsights {
    complexity: MetricDetail;
    maintainability: MetricDetail;
    testability: MetricDetail;
    documentation: MetricDetail;
}

interface MetricDetail {
    score: number;
    interpretation: string;
    recommendations: string[];
}

interface PrioritizedSuggestions {
    critical: CodeSuggestion[];
    high: CodeSuggestion[];
    medium: CodeSuggestion[];
    low: CodeSuggestion[];
} 