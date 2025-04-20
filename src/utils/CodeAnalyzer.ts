import * as vscode from 'vscode';
import { FileContext } from './FileAnalyzer';

export interface CodeStructure {
    classes: ClassInfo[];
    functions: FunctionInfo[];
    variables: VariableInfo[];
    imports: ImportInfo[];
    exports: ExportInfo[];
}

export interface ClassInfo {
    name: string;
    methods: FunctionInfo[];
    properties: VariableInfo[];
    superClass?: string;
    interfaces?: string[];
    decorators?: string[];
    location: vscode.Location;
}

export interface ParameterInfo {
    name: string;
    type?: string;
    defaultValue?: string;
    isOptional: boolean;
    isRest: boolean;
}

export interface FunctionInfo {
    name: string;
    parameters: ParameterInfo[];
    returnType?: string;
    isAsync: boolean;
    complexity: number;
    dependencies: string[];
    location: vscode.Location;
    startLine: number;
    endLine: number;
    lines: number;
}

export interface VariableInfo {
    name: string;
    type?: string;
    isConst: boolean;
    isExported: boolean;
    references: vscode.Location[];
    location: vscode.Location;
}

export interface ImportInfo {
    module: string;
    elements: string[];
    isDefault: boolean;
    location: vscode.Location;
}

export interface ExportInfo {
    name: string;
    type: 'default' | 'named';
    location: vscode.Location;
}

export interface CodeMetrics {
    complexity: number;
    maintainability: number;
    testability: number;
    documentation: number;
    duplications: number;
}

export interface CodeAnalysis {
    structure: CodeStructure;
    metrics: CodeMetrics;
    suggestions: CodeSuggestion[];
    dependencies: DependencyInfo[];
}

export interface CodeSuggestion {
    type: 'refactor' | 'improvement' | 'security' | 'performance';
    description: string;
    priority: 'low' | 'medium' | 'high';
    location: vscode.Location;
    fix?: string;
    file: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface DependencyInfo {
    module: string;
    type: 'internal' | 'external';
    usageLocations: vscode.Location[];
}

export class CodeAnalyzer {
    private static instance: CodeAnalyzer;

    private constructor() {}

    public static getInstance(): CodeAnalyzer {
        if (!CodeAnalyzer.instance) {
            CodeAnalyzer.instance = new CodeAnalyzer();
        }
        return CodeAnalyzer.instance;
    }

    public async analyzeCode(uri: vscode.Uri, fileContext: FileContext): Promise<CodeAnalysis> {
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();
        const structure = await this.analyzeStructure(fileContext);
        const metrics = this.calculateMetrics(structure, content);
        const suggestions = await this.generateSuggestions(structure, metrics, fileContext);
        const dependencies = await this.analyzeDependencies(structure);

        return {
            structure,
            metrics,
            suggestions,
            dependencies
        };
    }

    private async analyzeStructure(fileContext: FileContext): Promise<CodeStructure> {
        // Dile özgü parser'ları kullan
        switch (fileContext.language) {
            case 'typescript':
            case 'javascript':
                return this.analyzeJavaScriptFamily();
            case 'python':
                return this.analyzePython();
            case 'java':
                return this.analyzeJava();
            default:
                return this.analyzeGeneric();
        }
    }

    private async analyzeJavaScriptFamily(): Promise<CodeStructure> {
        // TypeScript/JavaScript için AST analizi
        // TODO: typescript-parser veya @babel/parser kullanarak implementasyon
        // For now, return basic structure with empty arrays
        return {
            classes: [],
            functions: [],
            variables: [],
            imports: [],
            exports: []
        };
    }

    private async analyzePython(): Promise<CodeStructure> {
        // Python için AST analizi
        // TODO: python-parser kullanarak implementasyon
        // For now, return basic structure with empty arrays
        return {
            classes: [],
            functions: [],
            variables: [],
            imports: [],
            exports: []
        };
    }

    private async analyzeJava(): Promise<CodeStructure> {
        // Java için AST analizi
        // TODO: java-parser kullanarak implementasyon
        // For now, return basic structure with empty arrays
        return {
            classes: [],
            functions: [],
            variables: [],
            imports: [],
            exports: []
        };
    }

    private async analyzeGeneric(): Promise<CodeStructure> {
        // Genel amaçlı basit analiz
        // TODO: Regex ve basit parsing ile implementasyon
        // For now, return basic structure with empty arrays
        return {
            classes: [],
            functions: [],
            variables: [],
            imports: [],
            exports: []
        };
    }

    private calculateMetrics(structure: CodeStructure, content: string): CodeMetrics {
        return {
            complexity: this.calculateComplexity(structure),
            maintainability: this.calculateMaintainability(structure, content),
            testability: this.calculateTestability(structure),
            documentation: this.calculateDocumentation(content),
            duplications: this.calculateDuplications(content)
        };
    }

    private calculateComplexity(structure: CodeStructure): number {
        // Calculate cyclomatic complexity based on functions and classes
        let totalComplexity = 0;
        
        // Add complexity for each function
        structure.functions.forEach(func => {
            totalComplexity += func.complexity;
        });

        // Add complexity for each class method
        structure.classes.forEach(cls => {
            cls.methods.forEach(method => {
                totalComplexity += method.complexity;
            });
        });

        return totalComplexity;
    }

    private calculateMaintainability(structure: CodeStructure, content: string): number {
        // Calculate maintainability index based on various factors
        const halsteadVolume = this.calculateHalsteadVolume(content);
        const cyclomaticComplexity = this.calculateComplexity(structure);
        const linesOfCode = content.split('\n').length;
        
        // Maintainability Index formula: 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
        const maintainability = 171 - 
            5.2 * Math.log(halsteadVolume) - 
            0.23 * cyclomaticComplexity - 
            16.2 * Math.log(linesOfCode);
            
        // Normalize to 0-100 range
        return Math.max(0, Math.min(100, maintainability));
    }

    private calculateTestability(structure: CodeStructure): number {
        // Calculate testability based on various metrics
        let testabilityScore = 100;

        // Reduce score based on complexity
        const complexity = this.calculateComplexity(structure);
        testabilityScore -= complexity * 0.5;

        // Reduce score for each function with many parameters
        structure.functions.forEach(func => {
            if (func.parameters.length > 3) {
                testabilityScore -= (func.parameters.length - 3) * 5;
            }
        });

        // Reduce score for each class with many methods
        structure.classes.forEach(cls => {
            if (cls.methods.length > 10) {
                testabilityScore -= (cls.methods.length - 10) * 2;
            }
        });

        return Math.max(0, Math.min(100, testabilityScore));
    }

    private calculateDocumentation(content: string): number {
        // Calculate documentation coverage
        const lines = content.split('\n');
        let documentedLines = 0;
        let totalLines = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0) continue;

            totalLines++;
            if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
                documentedLines++;
            }
        }

        return totalLines > 0 ? (documentedLines / totalLines) * 100 : 100;
    }

    private calculateDuplications(content: string): number {
        // Simple duplication detection
        const lines = content.split('\n');
        const lineMap = new Map<string, number>();
        let duplicateLines = 0;

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.length > 0) {
                const count = (lineMap.get(trimmedLine) || 0) + 1;
                lineMap.set(trimmedLine, count);
                if (count > 1) {
                    duplicateLines++;
                }
            }
        });

        return lines.length > 0 ? (duplicateLines / lines.length) * 100 : 0;
    }

    private calculateHalsteadVolume(content: string): number {
        // Simple Halstead Volume calculation
        const operators = new Set<string>();
        const operands = new Set<string>();
        
        // Simple regex to identify operators and operands
        const operatorRegex = /[+\-*/%=<>!&|^~?:]+/g;
        const operandRegex = /[a-zA-Z_]\w*/g;
        
        const operatorMatches = content.match(operatorRegex) || [];
        const operandMatches = content.match(operandRegex) || [];
        
        operatorMatches.forEach(op => operators.add(op));
        operandMatches.forEach(op => operands.add(op));
        
        const n1 = operators.size; // unique operators
        const n2 = operands.size;  // unique operands
        const N1 = operatorMatches.length; // total operators
        const N2 = operandMatches.length;  // total operands
        
        const vocabulary = n1 + n2;
        const length = N1 + N2;
        
        // Volume = N * log2(n)
        return length * Math.log2(vocabulary);
    }

    private async generateSuggestions(
        structure: CodeStructure,
        metrics: CodeMetrics,
        fileContext: FileContext
    ): Promise<CodeSuggestion[]> {
        const suggestions: CodeSuggestion[] = [];

        // Check for long functions
        for (const func of structure.functions) {
            if (func.lines > 30) {
                const location = new vscode.Location(
                    vscode.Uri.file(fileContext.path),
                    new vscode.Range(
                        new vscode.Position(func.startLine, 0),
                        new vscode.Position(func.endLine, 0)
                    )
                );
                suggestions.push({
                    type: 'refactor',
                    description: `Function '${func.name}' is too long (${func.lines} lines). Consider breaking it into smaller functions.`,
                    priority: 'medium',
                    location,
                    file: fileContext.path,
                    range: {
                        start: { line: func.startLine, character: 0 },
                        end: { line: func.endLine, character: 0 }
                    }
                });
            }
        }

        // Check for high complexity
        if (metrics.complexity > 10) {
            const location = new vscode.Location(
                vscode.Uri.file(fileContext.path),
                new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(0, 0)
                )
            );
            suggestions.push({
                type: 'improvement',
                description: `File has high cyclomatic complexity (${metrics.complexity}). Consider simplifying the logic.`,
                priority: 'high',
                location,
                file: fileContext.path,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 }
                }
            });
        }

        return suggestions;
    }

    private analyzeDependencies(structure: CodeStructure): DependencyInfo[] {
        const dependencies: DependencyInfo[] = [];

        // Process imports
        for (const importInfo of structure.imports) {
            dependencies.push({
                module: importInfo.module,
                type: importInfo.module.startsWith('.') ? 'internal' : 'external',
                usageLocations: [importInfo.location]
            });
        }

        // Process exports
        for (const exportInfo of structure.exports) {
            dependencies.push({
                module: exportInfo.name,
                type: 'internal',
                usageLocations: [exportInfo.location]
            });
        }

        return dependencies;
    }
}
