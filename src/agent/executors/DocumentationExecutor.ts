import * as vscode from 'vscode';
import { Task, TaskType, TaskResult, TaskExecutor } from '../types';
import { CodeAnalysis, ClassInfo, FunctionInfo } from '../../utils/CodeAnalyzer';
import { AIEngine } from '../../ai-engine/AIEngine';
import { AIMessage } from '../../ai-engine/types';

interface DocumentationSection {
    type: 'class' | 'function' | 'interface' | 'constant';
    target: string;
    documentation: string;
}

interface Documentation {
    fileHeader: string;
    sections: DocumentationSection[];
}

interface DocumentationPlan {
    overview: {
        description: string;
        purpose: string;
        dependencies: string[];
        usage: string;
    };
    sections: {
        type: 'class' | 'function' | 'interface' | 'constant';
        target: string;
        content: {
            description: string;
            params?: {
                name: string;
                type: string;
                description: string;
                optional: boolean;
                defaultValue?: string;
            }[];
            returns?: {
                type: string;
                description: string;
            };
            throws?: {
                type: string;
                condition: string;
            }[];
            examples?: {
                description: string;
                code: string;
            }[];
            notes?: string[];
            seeAlso?: string[];
        };
    }[];
    style: {
        format: string;
        conventions: string[];
    };
}

export class DocumentationExecutor implements TaskExecutor {
    private readonly aiEngine: AIEngine;

    constructor(aiEngine: AIEngine) {
        this.aiEngine = aiEngine;
    }

    public canHandle(task: Task): boolean {
        return task.type === TaskType.DOCUMENTATION;
    }

    public async execute(task: Task): Promise<TaskResult> {
        try {
            if (!task.metadata?.fileContext || !task.metadata?.codeAnalysis) {
                throw new Error('Task metadata is missing required analysis context');
            }

            // Dokümantasyon planı oluştur
            const docPlan = await this.createDocumentationPlan(task);

            // Dokümantasyon üret
            const documentation = await this.generateDocumentation(docPlan);

            // Preview göster ve onay al
            const approved = await this.showDocumentationPreview(documentation, docPlan);
            
            if (!approved) {
                return {
                    success: false,
                    error: 'Documentation generation was cancelled by user'
                };
            }

            // Dokümantasyonu uygula
            await this.applyDocumentation(documentation);

            return {
                success: true,
                data: {
                    documentation,
                    plan: docPlan
                }
            };
        } catch (error) {
            console.error('Error in DocumentationExecutor:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error in documentation generation'
            };
        }
    }

    private async createDocumentationPlan(task: Task): Promise<DocumentationPlan> {
        const { codeAnalysis, fileContext } = task.metadata!;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        const sourceCode = editor.document.getText();
        const prompt = this.buildDocPlanPrompt(sourceCode, codeAnalysis, fileContext);

        const messages: AIMessage[] = [{
            role: 'user',
            content: prompt,
            timestamp: Date.now()
        }];

        const response = await this.aiEngine.generateResponse({
            messages,
            systemPrompt: this.getDocPlanSystemPrompt()
        });

        return this.parseDocPlan(response.message);
    }

    private buildDocPlanPrompt(sourceCode: string, analysis: CodeAnalysis, fileContext: any): string {
        const classes = analysis.structure.classes
            .map(c => this.formatClassInfo(c))
            .join('\n\n');

        const functions = analysis.structure.functions
            .filter(f => !f.name.startsWith('_')) // Özel metodları hariç tut
            .map(f => this.formatFunctionInfo(f))
            .join('\n\n');

        return `
Please analyze this code and create a comprehensive documentation plan:

Source Code:
\`\`\`${fileContext.language}
${sourceCode}
\`\`\`

Classes:
${classes}

Functions:
${functions}

Requirements:
1. Create clear and concise documentation
2. Follow ${fileContext.language} documentation standards
3. Include examples where appropriate
4. Document public APIs thoroughly
5. Add proper type information
6. Include usage notes and warnings
7. Document error handling

Language: ${fileContext.language}
Framework: ${fileContext.framework || 'None'}
Documentation Style: ${this.detectDocStyle(fileContext)}
`;
    }

    private formatClassInfo(cls: ClassInfo): string {
        return `
Class: ${cls.name}
Extends: ${cls.superClass || 'none'}
Implements: ${cls.interfaces?.join(', ') || 'none'}
Methods: ${cls.methods.map(m => m.name).join(', ')}
Properties: ${cls.properties.map(p => p.name).join(', ')}
Decorators: ${cls.decorators?.join(', ') || 'none'}
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

    private getDocPlanSystemPrompt(): string {
        return `You are a documentation expert. Your role is to:
1. Analyze code structure and purpose
2. Identify what needs documentation
3. Plan comprehensive documentation
4. Follow documentation best practices
5. Ensure clarity and completeness
6. Consider developer experience

Please provide your documentation plan in this JSON format:
{
    "overview": {
        "description": "Brief description of the code",
        "purpose": "Main purpose and functionality",
        "dependencies": ["List of dependencies"],
        "usage": "General usage information"
    },
    "sections": [
        {
            "type": "class|function|interface|constant",
            "target": "Name of the item",
            "content": {
                "description": "Detailed description",
                "params": [
                    {
                        "name": "Parameter name",
                        "type": "Parameter type",
                        "description": "Parameter description",
                        "optional": boolean,
                        "defaultValue": "Default value if any"
                    }
                ],
                "returns": {
                    "type": "Return type",
                    "description": "Return value description"
                },
                "throws": [
                    {
                        "type": "Error type",
                        "condition": "When this error occurs"
                    }
                ],
                "examples": [
                    {
                        "description": "Example description",
                        "code": "Example code"
                    }
                ],
                "notes": ["Important notes"],
                "seeAlso": ["Related items"]
            }
        }
    ],
    "style": {
        "format": "Documentation format to use",
        "conventions": ["Documentation conventions to follow"]
    }
}`;
    }

    private parseDocPlan(aiResponse: string): DocumentationPlan {
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            console.error('Error parsing documentation plan:', error);
            throw new Error('Failed to parse AI response for documentation plan');
        }
    }

    private async generateDocumentation(plan: DocumentationPlan): Promise<Documentation> {
        const prompt = this.buildDocGenerationPrompt(plan);
        
        const messages: AIMessage[] = [{
            role: 'user',
            content: prompt,
            timestamp: Date.now()
        }];

        const response = await this.aiEngine.generateResponse({
            messages,
            systemPrompt: this.getDocGenerationSystemPrompt()
        });

        return this.parseDocumentation(response.message);
    }

    private buildDocGenerationPrompt(plan: DocumentationPlan): string {
        return `
Please generate documentation based on this plan:

${JSON.stringify(plan, null, 2)}

Requirements:
1. Follow the specified documentation style
2. Use clear and concise language
3. Include all specified sections
4. Add proper formatting
5. Include examples where specified
6. Follow type documentation conventions
7. Maintain consistent style
`;
    }

    private getDocGenerationSystemPrompt(): string {
        return `You are a documentation generator. Your role is to:
1. Generate clear and accurate documentation
2. Follow the documentation plan exactly
3. Use proper formatting and structure
4. Include all necessary details
5. Maintain consistent style
6. Ensure technical accuracy

Generate documentation in this format:
{
    "fileHeader": "File header comment",
    "sections": [
        {
            "type": "class|function|interface|constant",
            "target": "Name of the item",
            "documentation": "Generated documentation"
        }
    ]
}`;
    }

    private parseDocumentation(aiResponse: string): Documentation {
        try {
            return JSON.parse(aiResponse);
        } catch (error) {
            console.error('Error parsing documentation:', error);
            throw new Error('Failed to parse AI response for documentation');
        }
    }

    private async showDocumentationPreview(documentation: Documentation, plan: DocumentationPlan): Promise<boolean> {
        const preview = this.generatePreview(documentation, plan);
        const choice = await vscode.window.showInformationMessage(
            'Review the generated documentation:',
            { modal: true, detail: preview },
            'Apply',
            'Cancel'
        );
        return choice === 'Apply';
    }

    private generatePreview(documentation: Documentation, plan: DocumentationPlan): string {
        return `
Documentation Plan:
${JSON.stringify(plan, null, 2)}

Generated Documentation:
${JSON.stringify(documentation, null, 2)}
`;
    }

    private async applyDocumentation(documentation: Documentation): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        const workspaceEdit = new vscode.WorkspaceEdit();
        const document = editor.document;

        // Dosya başlığını ekle
        if (documentation.fileHeader) {
            workspaceEdit.insert(
                document.uri,
                new vscode.Position(0, 0),
                documentation.fileHeader + '\n\n'
            );
        }

        // Her bölüm için dokümantasyonu ekle
        for (const section of documentation.sections) {
            // Bölümün konumunu bul
            const position = await this.findDocumentationPosition(document, section);
            if (position) {
                workspaceEdit.insert(
                    document.uri,
                    position,
                    section.documentation + '\n'
                );
            }
        }

        await vscode.workspace.applyEdit(workspaceEdit);
    }

    private async findDocumentationPosition(document: vscode.TextDocument, section: DocumentationSection): Promise<vscode.Position | undefined> {
        // Bu metod, dokümantasyonun nereye ekleneceğini belirler
        // Örneğin, bir sınıf veya fonksiyon için dokümantasyon eklerken,
        // o öğenin hemen üstüne eklenmesi gerekir
        
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.includes(section.target)) {
                // Öğenin başlangıcını bulduk, dokümantasyonu buraya ekle
                return new vscode.Position(i, 0);
            }
        }

        return undefined;
    }

    private detectDocStyle(fileContext: any): string {
        // Dosya türüne göre dokümantasyon stilini belirle
        switch (fileContext.language.toLowerCase()) {
            case 'typescript':
            case 'javascript':
                return 'JSDoc';
            case 'python':
                return 'Google Style Python Docstrings';
            case 'java':
                return 'Javadoc';
            case 'c#':
                return 'XML Documentation Comments';
            default:
                return 'Standard Documentation Comments';
        }
    }
} 