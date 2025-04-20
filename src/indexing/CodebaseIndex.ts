import * as vscode from 'vscode';
import * as ts from 'typescript'; // Import TypeScript Compiler API
import { AIEngine } from '../ai-engine/AIEngine'; // Import AIEngine
import { cosineSimilarity } from '../utils/vectorUtils'; // Import helper
import { IndexedFile } from './CodebaseIndexer';

/**
 * Represents information about a symbol found in the codebase.
 */
export interface SymbolInfo {
    name: string;
    kind: vscode.SymbolKind;
    location: vscode.Location;
    children?: SymbolInfo[];
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
    references?: vscode.Location[];
    embedding?: number[];
}

/**
 * Represents the indexed information for a single file.
 */
export interface FileIndexData {
    symbols: SymbolInfo[];
    references: Map<string, vscode.Location[]>;
    error?: string;
}

export interface IndexedDocument {
    uri: vscode.Uri;
    content: string;
    embedding: number[];
}

/**
 * Manages the indexing of the codebase to understand its structure,
 * symbols, and relationships.
 */
export class CodebaseIndex {
    protected static instance: CodebaseIndex;
    protected indexData: Map<string, FileIndexData> = new Map();
    protected isIndexing: boolean = false;
    private files: Map<string, IndexedFile> = new Map();
    private symbols: Map<string, vscode.SymbolInformation[]> = new Map();
    private dependencies: Map<string, string[]> = new Map();
    private documents: Map<string, IndexedFile> = new Map();
    private generateEmbeddingsEnabled: boolean = false;
    protected aiEngine?: AIEngine;

    public constructor() {}

    public static getInstance(): CodebaseIndex {
        if (!CodebaseIndex.instance) {
            CodebaseIndex.instance = new CodebaseIndex();
        }
        return CodebaseIndex.instance;
    }

    public findSymbolAtPosition(filePath: string, position: vscode.Position): SymbolInfo | undefined {
        const fileData = this.indexData.get(filePath);
        if (!fileData) return undefined;

        let bestMatch: SymbolInfo | undefined;
        for (const symbol of fileData.symbols) {
            const range = symbol.location.range;
            if (range.contains(position)) {
                if (!bestMatch || range.start.isAfter(bestMatch.location.range.start)) {
                    bestMatch = symbol;
                }
            }
        }
        return bestMatch;
    }

    public async indexWorkspace(): Promise<void> {
        if (this.isIndexing) return;
        this.isIndexing = true;

        try {
            const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx}');
            for (const file of files) {
                await this.indexFile(file);
            }
        } finally {
            this.isIndexing = false;
        }
    }

    public async indexFile(uri: vscode.Uri): Promise<void> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            if (symbols) {
                const fileSymbols: SymbolInfo[] = symbols.map(symbol => ({
                    name: symbol.name,
                    kind: symbol.kind,
                    location: symbol.location,
                    children: [],
                    startLine: symbol.location.range.start.line,
                    startChar: symbol.location.range.start.character,
                    endLine: symbol.location.range.end.line,
                    endChar: symbol.location.range.end.character
                }));

                this.indexData.set(uri.fsPath, {
                    symbols: fileSymbols,
                    references: new Map()
                });
            }
        } catch (error) {
            console.error(`Error indexing file ${uri.fsPath}:`, error);
            this.indexData.set(uri.fsPath, {
                symbols: [],
                references: new Map()
            });
        }
    }

    /**
     * Initiates the indexing process for the entire workspace using a full ts.Program.
     * @param progress Optional progress reporter.
     */
    public async buildIndex(progress?: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
        if (this.isIndexing) {
            vscode.window.showWarningMessage('Indexing is already in progress.');
            return;
        }
        // Add check for aiEngine
        if (this.generateEmbeddingsEnabled && !this.aiEngine) {
             this.isIndexing = false; // Reset flag before handling error
             console.error('[CodebaseIndex] Cannot generate embeddings because AI Engine has not been set via setAIEngine().');
             vscode.window.showErrorMessage('Smile AI: Cannot generate embeddings - AI Engine not ready.');
             return; // Prevent index build if embeddings are enabled but engine isn't set
        }
        this.isIndexing = true;
        this.indexData.clear(); // Clear previous index
        progress?.report({ message: 'Starting codebase indexing...' });
        console.log('Starting codebase indexing...');
        const startTime = Date.now();

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder open.');
            }
            const workspaceRootUri = workspaceFolders[0].uri;
            const workspaceRootPath = workspaceRootUri.fsPath;

            // --- Create Full ts.Program --- 
            progress?.report({ message: 'Finding tsconfig.json...'});
            const configFileName = ts.findConfigFile(
                workspaceRootPath,
                ts.sys.fileExists,
                'tsconfig.json'
            );

            if (!configFileName) {
                throw new Error('tsconfig.json not found in the workspace root.');
            }
            console.log(`Using tsconfig: ${configFileName}`);
            progress?.report({ message: 'Reading tsconfig.json...'});

            const configFile = ts.readConfigFile(configFileName, ts.sys.readFile);
            if (configFile.error) {
                 throw new Error(`Error reading tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`);
            }

            const parsedCommandLine = ts.parseJsonConfigFileContent(
                configFile.config,
                ts.sys,
                workspaceRootPath
            );

            if (parsedCommandLine.errors.length > 0) {
                // Handle tsconfig parsing errors - maybe log them but continue?
                console.warn(`Errors parsing tsconfig.json:`, parsedCommandLine.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')));
                // Depending on severity, might want to throw an error here
            }

            const rootFileNames = parsedCommandLine.fileNames;
            const compilerOptions = parsedCommandLine.options;
            
            progress?.report({ message: `Creating program with ${rootFileNames.length} files...`, increment: 10 });
            console.log(`Creating program with ${rootFileNames.length} root files...`);

            // Create the program that includes all files in the project
            const program = ts.createProgram(rootFileNames, compilerOptions);
            const typeChecker = program.getTypeChecker();
            const allSourceFiles = program.getSourceFiles(); // Get all source files from the program
            console.log(`Program created with ${allSourceFiles.length} total source files.`);
            // ----------------------------- 

            progress?.report({ message: `Analyzing ${allSourceFiles.length} files...`, increment: 10 });

            // 2. Parse each source file using the *same* program and typeChecker
            let processedCount = 0;
            for (const sourceFile of allSourceFiles) {
                // Skip declaration files (.d.ts) and external libraries if desired
                if (sourceFile.isDeclarationFile || program.isSourceFileFromExternalLibrary(sourceFile)) {
                    continue;
                }
                
                const fileUri = vscode.Uri.file(sourceFile.fileName); // Convert path back to Uri if needed
                const relativePath = vscode.workspace.asRelativePath(fileUri);
                
                progress?.report({ 
                    message: `Analyzing ${relativePath}...`, 
                    increment: (70 / allSourceFiles.length) // Allocate 70% to analysis
                });
                // Pass the program and typeChecker to parseFile
                await this.parseFileWithProgram(sourceFile, program, typeChecker);
                processedCount++;
                // Optional small delay
                // await new Promise(resolve => setTimeout(resolve, 5)); 
            }

            progress?.report({ message: 'Finalizing index...', increment: 10 });
            const endTime = Date.now();
            console.log(`Codebase indexing finished in ${(endTime - startTime) / 1000} seconds. Analyzed ${processedCount} files.`);
            vscode.window.showInformationMessage(`Codebase indexing finished (${processedCount} files).`);

        } catch (error) {
            console.error('Error during codebase indexing:', error);
            vscode.window.showErrorMessage(`Codebase indexing failed: ${error instanceof Error ? error.message : String(error)}`);
            this.isIndexing = false; // Ensure flag is reset on error
        } finally {
            this.isIndexing = false;
        }
    }

    // Rename and modify parseFile to accept program and checker
    // private async parseFile(fileUri: vscode.Uri): Promise<void> { ... }
    private async parseFileWithProgram(sourceFile: ts.SourceFile, program: ts.Program, typeChecker: ts.TypeChecker): Promise<void> {
        const filePath = vscode.workspace.asRelativePath(sourceFile.fileName);
        if (this.indexData.has(filePath)) {
            return;
        }
        try {
            const fileSymbols: SymbolInfo[] = [];
            const fileImports: string[] = [];

            const visitNodeAsync = async (node: ts.Node): Promise<void> => {
                let symbolInfo: SymbolInfo | undefined;
                let symbolName: string | undefined;

                const createSymbolInfo = (name: string, node: ts.Node): SymbolInfo => {
                    const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                    const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
                    const range = new vscode.Range(
                        new vscode.Position(startPos.line, startPos.character),
                        new vscode.Position(endPos.line, endPos.character)
                    );
                    
                    return {
                        name,
                        kind: this.convertSyntaxKindToSymbolKind(node.kind),
                        location: new vscode.Location(vscode.Uri.file(sourceFile.fileName), range),
                        children: [],
                        startLine: startPos.line + 1,
                        startChar: startPos.character,
                        endLine: endPos.line + 1,
                        endChar: endPos.character,
                        references: []
                    };
                };

                if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
                    symbolName = node.name?.getText(sourceFile);
                    if (symbolName) {
                        symbolInfo = createSymbolInfo(symbolName, node);
                    }
                } else if (ts.isClassDeclaration(node)) {
                    symbolName = node.name?.getText(sourceFile);
                    if (symbolName) {
                        symbolInfo = createSymbolInfo(symbolName, node);
                    }
                } else if (ts.isInterfaceDeclaration(node)) {
                    symbolName = node.name.getText(sourceFile);
                    symbolInfo = createSymbolInfo(symbolName, node);
                } else if (ts.isEnumDeclaration(node)) {
                    symbolName = node.name.getText(sourceFile);
                    symbolInfo = createSymbolInfo(symbolName, node);
                } else if (ts.isTypeAliasDeclaration(node)) {
                    symbolName = node.name.getText(sourceFile);
                    symbolInfo = createSymbolInfo(symbolName, node);
                } else if (ts.isVariableDeclaration(node)) {
                    if (ts.isIdentifier(node.name)) {
                        symbolName = node.name.getText(sourceFile);
                        symbolInfo = createSymbolInfo(symbolName, node);
                    }
                } else if (ts.isImportDeclaration(node)) {
                    if (ts.isStringLiteral(node.moduleSpecifier)) {
                        fileImports.push(node.moduleSpecifier.text);
                    }
                } else if (ts.isCallExpression(node)) {
                    const expression = node.expression;
                    try {
                        const symbol = typeChecker.getSymbolAtLocation(expression);
                        if (symbol) {
                            const declarations = symbol.getDeclarations();
                            if (declarations && declarations.length > 0) {
                                const declaration = declarations[0];
                                const declarationFile = declaration.getSourceFile();
                                const declarationStart = declaration.getStart();
                                const definitionFilePath = vscode.workspace.asRelativePath(declarationFile.fileName);

                                if (program.isSourceFileFromExternalLibrary(declarationFile) || declarationFile.isDeclarationFile) {
                                    await visitNodeAsync(node);
                                    return;
                                }

                                const definitionFileData = this.indexData.get(definitionFilePath);
                                let definitionSymbolInfo: SymbolInfo | undefined;
                                if (definitionFileData?.symbols) {
                                    const defStartPos = declarationFile.getLineAndCharacterOfPosition(declarationStart);
                                    definitionSymbolInfo = definitionFileData.symbols.find(def =>
                                        def.startLine === defStartPos.line + 1 &&
                                        def.startChar === defStartPos.character
                                    );
                                }

                                if (definitionSymbolInfo) {
                                    const callPos = sourceFile.getLineAndCharacterOfPosition(expression.getStart());
                                    const callEndPos = sourceFile.getLineAndCharacterOfPosition(expression.getEnd());
                                    const range = new vscode.Range(
                                        new vscode.Position(callPos.line, callPos.character),
                                        new vscode.Position(callEndPos.line, callEndPos.character)
                                    );
                                    const reference = new vscode.Location(vscode.Uri.file(sourceFile.fileName), range);

                                    if (!definitionSymbolInfo.references) {
                                        definitionSymbolInfo.references = [];
                                    }
                                    definitionSymbolInfo.references.push(reference);
                                }
                            }
                        }
                    } catch (checkerError) {
                        console.error(`TypeChecker error processing call at ${filePath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}:`, checkerError);
                    }
                }

                if (symbolInfo && symbolName) {
                    try {
                        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                        const endNode = ts.isVariableDeclaration(node) ? node.name : node;
                        const endPos = sourceFile.getLineAndCharacterOfPosition(endNode.getEnd());
                        const range = new vscode.Range(
                            new vscode.Position(startPos.line, startPos.character),
                            new vscode.Position(endPos.line, endPos.character)
                        );

                        const definition: SymbolInfo = {
                            name: symbolName,
                            kind: symbolInfo.kind,
                            location: new vscode.Location(vscode.Uri.file(sourceFile.fileName), range),
                            children: [],
                            startLine: startPos.line + 1,
                            startChar: startPos.character,
                            endLine: endPos.line + 1,
                            endChar: endPos.character,
                            references: symbolInfo.references
                        };

                        if (this.generateEmbeddingsEnabled && this.aiEngine) {
                            try {
                                const symbolCode = node.getSourceFile().text.substring(node.getStart(), node.getEnd());
                                const maxEmbedLength = 1000;
                                const truncatedCode = symbolCode.length > maxEmbedLength
                                    ? symbolCode.substring(0, maxEmbedLength)
                                    : symbolCode;
                                definition.embedding = await this.aiEngine.generateEmbeddings(truncatedCode);
                            } catch (embedError) {
                                console.warn(`[CodebaseIndex] Failed to generate embedding for symbol '${definition.name}' in ${filePath}:`, embedError);
                            }
                        }

                        fileSymbols.push(definition);
                    } catch (posError) {
                        console.error(`Error getting position for symbol ${symbolName} in ${filePath}:`, posError);
                    }
                }

                const children = node.getChildren(sourceFile);
                for (const child of children) {
                    await visitNodeAsync(child);
                }
            };

            await visitNodeAsync(sourceFile);

            this.indexData.set(filePath, {
                symbols: fileSymbols,
                references: new Map()
            });

        } catch (error) {
            const filePath = vscode.workspace.asRelativePath(sourceFile.fileName);
            console.error(`Error parsing file ${filePath}:`, error);
            this.indexData.set(filePath, {
                symbols: [],
                references: new Map(),
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Queries the index to find symbols by name.
     * (Basic implementation - can be expanded significantly)
     *
     * @param symbolName The name of the symbol to find.
     * @returns An array of SymbolInfo objects matching the name.
     */
    public findSymbolByName(symbolName: string): SymbolInfo[] {
        console.log(`Querying index for symbol: ${symbolName}`);
        const results: SymbolInfo[] = [];
        for (const fileData of this.indexData.values()) {
            if (fileData.symbols) {
                for (const symbol of fileData.symbols) {
                   if (symbol.name === symbolName) {
                       results.push(symbol);
                   }
                }
            }
        }
        return results;
    }

    /**
     * Finds all known references for a given symbol definition.
     * Note: Reliability depends on the successful linking during parsing.
     *
     * @param symbolInfo The SymbolInfo object for the definition.
     * @returns An array of ReferenceLocation objects, or an empty array if none found.
     */
    public findReferences(symbolInfo: SymbolInfo): vscode.Location[] {
        // The references are stored directly on the SymbolInfo object during parsing
        return symbolInfo.references || [];
    }

    /**
     * Gets the indexed data for a specific file.
     * @param filePath Relative path to the file.
     * @returns The indexed data or undefined if not found.
     */
    public getFileData(filePath: string): any | undefined {
        return this.indexData.get(filePath);
    }

    /**
     * Updates the index for a single file (definitions only) after a save.
     * Does not update cross-file references; full re-index recommended for that.
     * @param fileUri The URI of the file to update.
     */
    public async updateFileIndex(fileUri: vscode.Uri): Promise<void> {
        if (this.isIndexing) {
            console.warn('Skipping single file update, full indexing in progress.');
            return;
        }
        const filePath = vscode.workspace.asRelativePath(fileUri);
        console.log(`Updating definitions in index for ${filePath}...`);
        
        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const code = document.getText();

            // Use basic parsing without full Type Checker for speed
            const sourceFile = ts.createSourceFile(
                filePath,
                code,             
                ts.ScriptTarget.Latest,
                true              
            );

            const fileSymbols: SymbolInfo[] = [];
            const fileImports: string[] = [];

            // Simplified visitor - only extracts definitions
            const visitNode = (node: ts.Node) => {
                let symbolInfo: SymbolInfo | undefined;
                let symbolName: string | undefined;

                const createSymbolInfo = (name: string, node: ts.Node): SymbolInfo => {
                    const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                    const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
                    const range = new vscode.Range(
                        new vscode.Position(startPos.line, startPos.character),
                        new vscode.Position(endPos.line, endPos.character)
                    );
                    
                    return {
                        name,
                        kind: this.convertSyntaxKindToSymbolKind(node.kind),
                        location: new vscode.Location(vscode.Uri.file(sourceFile.fileName), range),
                        children: [],
                        startLine: startPos.line + 1,
                        startChar: startPos.character,
                        endLine: endPos.line + 1,
                        endChar: endPos.character,
                        references: []
                    };
                };

                if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
                    symbolName = node.name?.getText(sourceFile);
                    if (symbolName) {
                        symbolInfo = createSymbolInfo(symbolName, node);
                    }
                } else if (ts.isClassDeclaration(node)) {
                    symbolName = node.name?.getText(sourceFile);
                    if (symbolName) {
                        symbolInfo = createSymbolInfo(symbolName, node);
                    }
                } else if (ts.isInterfaceDeclaration(node)) {
                    symbolName = node.name.getText(sourceFile);
                    symbolInfo = createSymbolInfo(symbolName, node);
                } else if (ts.isEnumDeclaration(node)) {
                    symbolName = node.name.getText(sourceFile);
                    symbolInfo = createSymbolInfo(symbolName, node);
                } else if (ts.isTypeAliasDeclaration(node)) {
                    symbolName = node.name.getText(sourceFile);
                    symbolInfo = createSymbolInfo(symbolName, node);
                } else if (ts.isVariableDeclaration(node)) {
                    if (ts.isIdentifier(node.name)) {
                        symbolName = node.name.getText(sourceFile);
                        symbolInfo = createSymbolInfo(symbolName, node);
                    }
                } else if (ts.isImportDeclaration(node)) {
                    if (ts.isStringLiteral(node.moduleSpecifier)) {
                        fileImports.push(node.moduleSpecifier.text);
                    }
                }

                if (symbolInfo && symbolName) {
                    fileSymbols.push(symbolInfo);
                }
                ts.forEachChild(node, visitNode);
            };

            visitNode(sourceFile);

            // Update the index entry for this file
            this.indexData.set(filePath, {
                symbols: fileSymbols,
                references: new Map()
            });

            console.log(`Index definitions updated for ${filePath}.`);

        } catch (error) {
            console.error(`Error updating index for ${filePath}:`, error);
            this.indexData.set(filePath, {
                symbols: [],
                references: new Map(),
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Removes a file from the index.
     * @param fileUri The URI of the file to remove.
     */
    public removeFileIndex(fileUri: vscode.Uri): void {
        const filePath = vscode.workspace.asRelativePath(fileUri);
        if (this.indexData.delete(filePath)) {
            console.log(`Removed ${filePath} from index.`);
        }
    }

    /**
     * Cleans up resources, if any (e.g., file watchers).
     */
    public dispose(): void {
        // Placeholder for potential cleanup logic
        console.log('Disposing CodebaseIndex...');
        this.indexData.clear();
    }

    /** Set the AI Engine instance needed for embeddings */
    public setAIEngine(engine: AIEngine) {
        this.aiEngine = engine;
        console.log('[CodebaseIndex] AI Engine instance set.');
    }

    /**
     * Finds symbols in the index that are semantically similar to the provided embedding.
     * Requires embeddings to have been generated during indexing.
     *
     * @param queryEmbedding The embedding vector to search against.
     * @param topN The maximum number of similar symbols to return.
     * @param minSimilarity The minimum cosine similarity score to consider a match (e.g., 0.7).
     * @returns An array of objects containing the SymbolInfo and similarity score, sorted by similarity.
     */
    public findSimilarSymbols(
        queryEmbedding: number[], 
        topN: number = 5, 
        minSimilarity: number = 0.7
    ): { symbol: SymbolInfo; score: number }[] {
        
        if (!this.generateEmbeddingsEnabled) {
            console.warn('[CodebaseIndex] Cannot find similar symbols: Embeddings generation is disabled.');
            // Optionally throw an error or return empty
             vscode.window.showWarningMessage('Cannot perform semantic search: Embedding generation is disabled in Smile AI settings.');
            return [];
        }

        const results: { symbol: SymbolInfo; score: number }[] = [];

        console.log(`[CodebaseIndex] Searching for symbols similar to query vector (${queryEmbedding.length} dimensions)...`);
        const startTime = Date.now();

        for (const fileData of this.indexData.values()) {
            if (fileData.symbols) {
                for (const symbol of fileData.symbols) {
                    if (symbol.embedding && symbol.embedding.length === queryEmbedding.length) {
                        try {
                            const score = cosineSimilarity(queryEmbedding, symbol.embedding);
                            if (score >= minSimilarity) {
                                results.push({ symbol, score });
                            }
                        } catch (error) {
                             console.error(`Error calculating similarity for symbol ${symbol.name}:`, error);
                             // Skip this symbol if similarity calculation fails
                        }
                    }
                }
            }
        }

        // Sort results by score descending
        results.sort((a, b) => b.score - a.score);

        const endTime = Date.now();
        console.log(`[CodebaseIndex] Semantic search completed in ${endTime - startTime}ms. Found ${results.length} potential matches.`);

        // Return top N results
        return results.slice(0, topN);
    }

    private convertSyntaxKindToSymbolKind(kind: ts.SyntaxKind): vscode.SymbolKind {
        switch (kind) {
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.MethodDeclaration:
                return vscode.SymbolKind.Function;
            case ts.SyntaxKind.ClassDeclaration:
                return vscode.SymbolKind.Class;
            case ts.SyntaxKind.InterfaceDeclaration:
                return vscode.SymbolKind.Interface;
            case ts.SyntaxKind.EnumDeclaration:
                return vscode.SymbolKind.Enum;
            case ts.SyntaxKind.TypeAliasDeclaration:
                return vscode.SymbolKind.TypeParameter;
            case ts.SyntaxKind.VariableDeclaration:
                return vscode.SymbolKind.Variable;
            default:
                return vscode.SymbolKind.Variable;
        }
    }

    public addFile(file: IndexedFile): void {
        this.files.set(file.path, file);
    }

    public getFile(filePath: string): IndexedFile | undefined {
        return this.files.get(filePath);
    }

    public getAllFiles(): IndexedFile[] {
        return Array.from(this.files.values());
    }

    public addSymbols(filePath: string, symbols: vscode.SymbolInformation[]): void {
        this.symbols.set(filePath, symbols);
    }

    public getSymbols(filePath: string): vscode.SymbolInformation[] | undefined {
        return this.symbols.get(filePath);
    }

    public addDependencies(filePath: string, deps: string[]): void {
        this.dependencies.set(filePath, deps);
    }

    public getDependencies(filePath: string): string[] | undefined {
        return this.dependencies.get(filePath);
    }

    public clear(): void {
        this.documents.clear();
        this.files.clear();
        this.symbols.clear();
        this.dependencies.clear();
        this.indexData.clear();
    }

    public getFilesWithSymbol(symbolName: string): IndexedFile[] {
        const result: IndexedFile[] = [];
        this.symbols.forEach((symbols, filePath) => {
            if (symbols.some(s => s.name === symbolName)) {
                const file = this.files.get(filePath);
                if (file) {
                    result.push(file);
                }
            }
        });
        return result;
    }

    public getRelatedFiles(filePath: string): IndexedFile[] {
        const result: Set<IndexedFile> = new Set();
        
        // Add direct dependencies
        const deps = this.dependencies.get(filePath);
        if (deps) {
            deps.forEach(dep => {
                const file = this.files.get(dep);
                if (file) {
                    result.add(file);
                }
            });
        }

        // Add files that depend on this file
        this.dependencies.forEach((deps, path) => {
            if (deps.includes(filePath)) {
                const file = this.files.get(path);
                if (file) {
                    result.add(file);
                }
            }
        });

        return Array.from(result);
    }

    public addDocument(document: IndexedFile): void {
        this.documents.set(document.uri.fsPath, document);
    }

    public getDocument(uri: vscode.Uri): IndexedFile | undefined {
        return this.documents.get(uri.fsPath);
    }

    public getAllDocuments(): IndexedFile[] {
        return Array.from(this.documents.values());
    }

    public searchSimilar(embedding: number[], limit: number = 5): IndexedFile[] {
        const documents = Array.from(this.documents.values());
        const scores = documents.map(doc => ({
            document: doc,
            score: this.cosineSimilarity(embedding, doc.embedding)
        }));

        return scores
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(result => result.document);
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}