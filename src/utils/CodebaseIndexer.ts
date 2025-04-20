import * as vscode from 'vscode';
import { FileAnalyzer, FileContext } from './FileAnalyzer';
import { CodeAnalyzer } from './CodeAnalyzer';

interface IndexedFile extends FileContext {
    uri: vscode.Uri;
    lastModified: number;
    symbols: CodeSymbol[];
    dependencies: string[];
    references: CodeReference[];
    ast?: any;
}

interface CodeSymbol {
    name: string;
    kind: vscode.SymbolKind;
    location: vscode.Location;
    containerName?: string;
    children?: CodeSymbol[];
}

interface CodeReference {
    symbol: string;
    location: vscode.Location;
    type: 'definition' | 'reference' | 'implementation';
}

interface SearchResult {
    file: string;
    matches: {
        line: number;
        content: string;
        symbol?: string;
    }[];
}

export class CodebaseIndexer {
    private static instance: CodebaseIndexer;
    private fileAnalyzer: FileAnalyzer;
    private codeAnalyzer: CodeAnalyzer;
    private indexedFiles: Map<string, IndexedFile>;
    private isIndexing: boolean;
    private watcher: vscode.FileSystemWatcher | undefined;

    private constructor() {
        this.fileAnalyzer = FileAnalyzer.getInstance();
        this.codeAnalyzer = CodeAnalyzer.getInstance();
        this.indexedFiles = new Map();
        this.isIndexing = false;
        this.setupWatchers();
    }

    private setupWatchers() {
        // Dosya değişikliklerini izle
        this.watcher = vscode.workspace.createFileSystemWatcher(
            '**/*.*',
            false, // create
            false, // change
            false  // delete
        );

        this.watcher.onDidCreate(uri => this.handleFileChange(uri));
        this.watcher.onDidChange(uri => this.handleFileChange(uri));
        this.watcher.onDidDelete(uri => this.handleFileDelete(uri));

        // Editör değişikliklerini izle
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.handleFileChange(editor.document.uri);
            }
        });
    }

    public static getInstance(): CodebaseIndexer {
        if (!CodebaseIndexer.instance) {
            CodebaseIndexer.instance = new CodebaseIndexer();
        }
        return CodebaseIndexer.instance;
    }

    public async indexWorkspace() {
        if (this.isIndexing) return;
        this.isIndexing = true;

        try {
            // Tüm desteklenen dillerdeki dosyaları bul
            const files = await this.findAllSupportedFiles();

            // Her dosyayı indexle
            for (const file of files) {
                await this.indexFile(file);
            }

            // Referansları ve bağımlılıkları analiz et
            await this.analyzeReferences();
        } catch (error) {
            console.error('Workspace indexing error:', error);
        } finally {
            this.isIndexing = false;
        }
    }

    private async findAllSupportedFiles(): Promise<vscode.Uri[]> {
        const patterns = [
            '**/*.{ts,tsx,js,jsx}',   // TypeScript/JavaScript
            '**/*.{py,pyw}',          // Python
            '**/*.{java,kt}',         // Java/Kotlin
            '**/*.{cs,vb}',           // C#/VB.NET
            '**/*.{cpp,hpp,c,h}',     // C++/C
            '**/*.{go}',              // Go
            '**/*.{rs}',              // Rust
            '**/*.{php}',             // PHP
            '**/*.{rb}',              // Ruby
            '**/*.{swift}'            // Swift
        ];

        const excludePattern = '**/node_modules/**';
        const files: vscode.Uri[] = [];

        for (const pattern of patterns) {
            const found = await vscode.workspace.findFiles(pattern, excludePattern);
            files.push(...found);
        }

        return files;
    }

    private async indexFile(uri: vscode.Uri): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            
            // Dosya analizi yap
            const context = await this.fileAnalyzer.analyzeFile(uri);
            await this.codeAnalyzer.analyzeCode(uri, context);
            
            // Sembolleri çıkar
            const symbols = await this.extractSymbols(document);
            
            // AST oluştur
            const ast = await this.parseAST();

            // Bağımlılıkları bul
            const dependencies = await this.findDependencies(document);

            // Index'e ekle
            const indexedFile: IndexedFile = {
                ...context,
                uri,
                lastModified: Date.now(),
                symbols,
                dependencies,
                references: [],
                ast
            };

            this.indexedFiles.set(uri.fsPath, indexedFile);
        } catch (error) {
            console.error(`File indexing error for ${uri.fsPath}:`, error);
        }
    }

    private async extractSymbols(document: vscode.TextDocument): Promise<CodeSymbol[]> {
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        return (symbols || []).map(symbol => ({
            name: symbol.name,
            kind: symbol.kind,
            location: symbol.location,
            containerName: symbol.containerName
        }));
    }

    private async parseAST(): Promise<any> {
        // TODO: Implement AST parsing for different languages
        return null;
    }

    private async findDependencies(document: vscode.TextDocument): Promise<string[]> {
        const content = document.getText();
        const dependencies: Set<string> = new Set();

        // Dile göre import/require pattern'larını kontrol et
        const patterns = {
            typescript: [/import.*from\s+['"](.+?)['"]/g, /require\(['"](.+?)['"]\)/g],
            javascript: [/import.*from\s+['"](.+?)['"]/g, /require\(['"](.+?)['"]\)/g],
            python: [/import\s+(\w+)/g, /from\s+(\w+)\s+import/g],
            java: [/import\s+([\w.]+);/g],
            csharp: [/using\s+([\w.]+);/g]
        };

        const currentPatterns = patterns[document.languageId as keyof typeof patterns] || [];
        
        for (const pattern of currentPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                dependencies.add(match[1]);
            }
        }

        return Array.from(dependencies);
    }

    private async analyzeReferences() {
        for (const [filePath, file] of this.indexedFiles) {
            const references: CodeReference[] = [];

            // Sembol referanslarını bul
            for (const symbol of file.symbols) {
                const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeReferenceProvider',
                    file.uri,
                    symbol.location.range.start
                );

                if (locations) {
                    references.push(...locations.map(loc => ({
                        symbol: symbol.name,
                        location: loc,
                        type: 'reference' as const
                    })));
                }
            }

            file.references = references;
            this.indexedFiles.set(filePath, file);
        }
    }

    public async searchCode(query: string): Promise<SearchResult[]> {
        const results: SearchResult[] = [];

        for (const [filePath, file] of this.indexedFiles) {
            const document = await vscode.workspace.openTextDocument(file.uri);
            const content = document.getText();
            const lines = content.split('\n');
            const matches: SearchResult['matches'] = [];

            // Metin araması
            lines.forEach((line, index) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                    matches.push({
                        line: index + 1,
                        content: line.trim()
                    });
                }
            });

            // Sembol araması
            file.symbols.forEach(symbol => {
                if (symbol.name.toLowerCase().includes(query.toLowerCase())) {
                    const line = document.lineAt(symbol.location.range.start.line);
                    matches.push({
                        line: line.lineNumber + 1,
                        content: line.text.trim(),
                        symbol: symbol.name
                    });
                }
            });

            if (matches.length > 0) {
                results.push({
                    file: filePath,
                    matches
                });
            }
        }

        return results;
    }

    public getFileContext(uri: vscode.Uri): FileContext | undefined {
        return this.indexedFiles.get(uri.fsPath);
    }

    public getProjectStructure(): any {
        const structure: any = {};

        for (const [path, file] of this.indexedFiles) {
            const parts = path.split('/');
            let current = structure;

            for (const part of parts) {
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            }

            current._file = {
                symbols: file.symbols,
                dependencies: file.dependencies,
                references: file.references
            };
        }

        return structure;
    }

    public dispose() {
        if (this.watcher) {
            this.watcher.dispose();
        }
        this.indexedFiles.clear();
    }

    private async handleFileChange(uri: vscode.Uri) {
        await this.indexFile(uri);
        await this.analyzeReferences();
    }

    private handleFileDelete(uri: vscode.Uri) {
        this.indexedFiles.delete(uri.fsPath);
    }
} 
