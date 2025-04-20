import * as vscode from 'vscode';
import * as path from 'path';
import { CodeAnalysis } from './CodeAnalyzer';

export interface FileContext {
    path: string;
    content: string;
    language: string;
    framework?: string;
    fileType: FileType;
    projectType?: ProjectType;
    dependencies?: string[];
    imports?: string[];
    exports?: string[];
    analysis?: CodeAnalysis;
    ast?: any;
    metadata?: {
        size: number;
        lastModified: number;
        gitHistory?: any;
        coverage?: number;
        complexity?: number;
    };
}

export enum FileType {
    SOURCE = 'SOURCE',
    TEST = 'TEST',
    CONFIG = 'CONFIG',
    DOCUMENTATION = 'DOCUMENTATION',
    STYLE = 'STYLE',
    RESOURCE = 'RESOURCE',
    UNKNOWN = 'UNKNOWN'
}

export enum ProjectType {
    NODE = 'NODE',
    PYTHON = 'PYTHON',
    JAVA = 'JAVA',
    DOTNET = 'DOTNET',
    WEB = 'WEB',
    UNKNOWN = 'UNKNOWN'
}

interface LanguageConfig {
    extensions: string[];
    frameworks: {
        name: string;
        patterns: string[];
    }[];
    importPatterns: RegExp[];
    exportPatterns: RegExp[];
    testPatterns: string[];
}

export class FileAnalyzer {
    private static instance: FileAnalyzer;
    private projectContext: Map<string, FileContext>;
    private languageConfigs: Map<string, LanguageConfig>;

    private constructor() {
        this.projectContext = new Map();
        this.languageConfigs = new Map();
        this.initializeLanguageConfigs();
    }

    private initializeLanguageConfigs() {
        this.languageConfigs = new Map([
            ['typescript', {
                extensions: ['.ts', '.tsx'],
                frameworks: [
                    { name: 'react', patterns: ['react', 'jsx', 'tsx'] },
                    { name: 'angular', patterns: ['@angular', 'ngModule'] },
                    { name: 'vue', patterns: ['vue', 'createApp'] },
                    { name: 'nest', patterns: ['@nestjs', '@Injectable'] }
                ],
                importPatterns: [
                    /import\s+.*?from\s+['"](.+?)['"]/g,
                    /require\(['"](.+?)['"]\)/g
                ],
                exportPatterns: [
                    /export\s+(?:default\s+)?(?:class|interface|function|const|let|var)\s+(\w+)/g,
                    /export\s+{\s*(.+?)\s*}/g
                ],
                testPatterns: ['.test.ts', '.spec.ts', '__tests__']
            }],
            ['javascript', {
                extensions: ['.js', '.jsx'],
                frameworks: [
                    { name: 'react', patterns: ['react', 'jsx'] },
                    { name: 'vue', patterns: ['vue', 'createApp'] },
                    { name: 'express', patterns: ['express()', 'app.use'] }
                ],
                importPatterns: [
                    /import\s+.*?from\s+['"](.+?)['"]/g,
                    /require\(['"](.+?)['"]\)/g
                ],
                exportPatterns: [
                    /module\.exports\s*=\s*/g,
                    /exports\.\w+\s*=\s*/g
                ],
                testPatterns: ['.test.js', '.spec.js', '__tests__']
            }],
            ['python', {
                extensions: ['.py', '.pyw'],
                frameworks: [
                    { name: 'django', patterns: ['django', 'urls.py'] },
                    { name: 'flask', patterns: ['flask', 'Flask'] },
                    { name: 'fastapi', patterns: ['fastapi', 'FastAPI'] }
                ],
                importPatterns: [
                    /import\s+(\w+)/g,
                    /from\s+(\w+)\s+import/g
                ],
                exportPatterns: [
                    /^def\s+\w+/gm,
                    /^class\s+\w+/gm
                ],
                testPatterns: ['test_', '_test.py', 'tests/']
            }],
            // Diğer diller için benzer konfigürasyonlar...
        ]);
    }

    public static getInstance(): FileAnalyzer {
        if (!FileAnalyzer.instance) {
            FileAnalyzer.instance = new FileAnalyzer();
        }
        return FileAnalyzer.instance;
    }

    public async analyzeFile(uri: vscode.Uri): Promise<FileContext> {
        const filePath = uri.fsPath;
        const extension = path.extname(filePath);
        const fileName = path.basename(filePath);

        // Önce cache'e bakalım
        const cached = this.projectContext.get(filePath);
        if (cached) return cached;

        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();
        const stats = await vscode.workspace.fs.stat(uri);

        const language = this.detectLanguage(extension);
        const languageConfig = this.languageConfigs.get(language);

        const context: FileContext = {
            path: filePath,
            content,
            language,
            fileType: this.detectFileType(fileName, extension, content, languageConfig),
            framework: this.detectFramework(content, languageConfig),
            dependencies: this.detectDependencies(content, languageConfig),
            imports: this.extractImports(content, languageConfig),
            exports: this.extractExports(content, languageConfig),
            metadata: {
                size: stats.size,
                lastModified: stats.mtime,
                complexity: this.calculateComplexity(content)
            }
        };

        // AST oluştur
        context.ast = await this.parseAST();

        // Projenin tipini belirle
        context.projectType = await this.detectProjectType(uri);

        // Context'i cache'le
        this.projectContext.set(filePath, context);

        return context;
    }

    private detectLanguage(extension: string): string {
        for (const [language, config] of this.languageConfigs) {
            if (config.extensions.includes(extension.toLowerCase())) {
                return language;
            }
        }
        return 'plaintext';
    }

    private detectFileType(
        fileName: string,
        extension: string,
        content: string,
        config?: LanguageConfig
    ): FileType {
        // Test dosyaları
        if (config?.testPatterns.some(pattern => 
            fileName.includes(pattern) || content.includes(pattern)
        )) {
            return FileType.TEST;
        }

        // Konfigürasyon dosyaları
        if (fileName.includes('config') || 
            ['.json', '.yml', '.yaml', '.env'].includes(extension)) {
            return FileType.CONFIG;
        }

        // Dokümantasyon
        if (['.md', '.txt', '.rst', '.doc'].includes(extension)) {
            return FileType.DOCUMENTATION;
        }

        // Stil dosyaları
        if (['.css', '.scss', '.less', '.sass'].includes(extension)) {
            return FileType.STYLE;
        }

        // Kaynak dosyaları
        if (['.png', '.jpg', '.svg', '.gif', '.ico'].includes(extension)) {
            return FileType.RESOURCE;
        }

        return FileType.SOURCE;
    }

    private detectFramework(content: string, config?: LanguageConfig): string | undefined {
        if (!config) return undefined;

        for (const framework of config.frameworks) {
            if (framework.patterns.some(pattern => content.includes(pattern))) {
                return framework.name;
            }
        }

        return undefined;
    }

    private detectDependencies(content: string, config?: LanguageConfig): string[] {
        const dependencies: Set<string> = new Set();
        
        if (!config) return [];

        for (const pattern of config.importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                dependencies.add(match[1]);
            }
        }

        return Array.from(dependencies);
    }

    private extractImports(content: string, config?: LanguageConfig): string[] {
        const imports: Set<string> = new Set();
        
        if (!config) return [];

        for (const pattern of config.importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                imports.add(match[1]);
            }
        }

        return Array.from(imports);
    }

    private extractExports(content: string, config?: LanguageConfig): string[] {
        const exports: Set<string> = new Set();
        
        if (!config) return [];

        for (const pattern of config.exportPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                exports.add(match[1]);
            }
        }

        return Array.from(exports);
    }

    private async parseAST(): Promise<any> {
        // TODO: Implement AST parsing based on language
        return null;
    }

    private calculateComplexity(content: string): number {
        // Basit bir karmaşıklık hesaplaması
        const lines = content.split('\n').length;
        const conditionals = (content.match(/if|else|switch|case|for|while|do/g) || []).length;
        const functions = (content.match(/function|=>|\bdef\b|\bclass\b/g) || []).length;
        
        return Math.round((lines + conditionals * 2 + functions * 3) / 10);
    }

    private async detectProjectType(uri: vscode.Uri): Promise<ProjectType> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) return ProjectType.UNKNOWN;

        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceFolder, '**/*'));
        
        // Proje tipi belirteçleri
        const indicators = {
            [ProjectType.NODE]: ['package.json', 'node_modules'],
            [ProjectType.PYTHON]: ['requirements.txt', 'setup.py', 'pyproject.toml'],
            [ProjectType.JAVA]: ['pom.xml', 'build.gradle'],
            [ProjectType.DOTNET]: ['*.csproj', '*.sln'],
            [ProjectType.WEB]: ['index.html', 'webpack.config.js', 'vite.config.js']
        };

        for (const [type, patterns] of Object.entries(indicators)) {
            for (const file of files) {
                if (patterns.some(pattern => 
                    file.fsPath.includes(pattern) || 
                    path.basename(file.fsPath).match(new RegExp(pattern.replace('*', '.*'))))) {
                    return type as ProjectType;
                }
            }
        }

        return ProjectType.UNKNOWN;
    }

    public clearCache(): void {
        this.projectContext.clear();
    }
} 