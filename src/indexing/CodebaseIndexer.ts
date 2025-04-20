import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodebaseIndex } from './CodebaseIndex';
import ignore from 'ignore';
import { AIEngine } from '../ai-engine/AIEngine';

export interface IndexedFile {
    uri: vscode.Uri;
    content: string;
    embedding: number[];
    path: string;
}

export class CodebaseIndexer {
    private static instance: CodebaseIndexer;
    private readonly aiEngine: AIEngine;
    private index: CodebaseIndex;
    private isIndexing: boolean = false;
    private ignoreFilter: any;
    private attachedFiles: Set<string> = new Set();
    private attachedFolders: Set<string> = new Set();

    private constructor(aiEngine: AIEngine) {
        this.aiEngine = aiEngine;
        this.index = new CodebaseIndex();
        this.loadIgnorePatterns();
    }

    public static getInstance(aiEngine: AIEngine): CodebaseIndexer {
        if (!CodebaseIndexer.instance) {
            CodebaseIndexer.instance = new CodebaseIndexer(aiEngine);
        }
        return CodebaseIndexer.instance;
    }

    private loadIgnorePatterns(): void {
        this.ignoreFilter = ignore();
        
        // Default patterns
        const defaultPatterns = [
            'node_modules',
            'dist',
            'out',
            '.git',
            '*.log'
        ];
        this.ignoreFilter.add(defaultPatterns);

        // Load .smileignore if exists
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const smileIgnorePath = path.join(workspaceFolders[0].uri.fsPath, '.smileignore');
            if (fs.existsSync(smileIgnorePath)) {
                const ignoreContent = fs.readFileSync(smileIgnorePath, 'utf8');
                this.ignoreFilter.add(ignoreContent);
            }
        }
    }

    public async indexWorkspace(progressCallback?: (message: string) => void): Promise<void> {
        console.log("Starting workspace indexing");
        if (this.isIndexing) {
            console.log("Indexing already in progress, skipping");
            return;
        }

        this.isIndexing = true;
        console.log("Setting isIndexing to true");

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                console.error("No workspace folder is open");
                throw new Error('No workspace folder is open');
            }

            console.log(`Found ${workspaceFolders.length} workspace folders to index`);
            for (const folder of workspaceFolders) {
                console.log(`Indexing folder: ${folder.uri.fsPath}`);
                await this.indexFolder(folder.uri.fsPath, progressCallback);
            }
            console.log("Workspace indexing completed successfully");
        } catch (error) {
            console.error("Error during workspace indexing:", error);
            throw error;
        } finally {
            this.isIndexing = false;
            console.log("Setting isIndexing to false");
        }
    }

    private async indexFolder(folderPath: string, progressCallback?: (message: string) => void): Promise<void> {
        console.log(`Starting to index folder: ${folderPath}`);
        try {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folderPath, '**/*'),
                '**/node_modules/**'
            );

            console.log(`Found ${files.length} files to index in ${folderPath}`);
            let indexedCount = 0;
            for (const file of files) {
                try {
                    if (progressCallback) {
                        progressCallback(`Indexing ${vscode.workspace.asRelativePath(file)} (${indexedCount + 1}/${files.length})`);
                    }
                    
                    // Ignore binary files
                    const filePath = file.fsPath;
                    if (this.isBinaryPath(filePath)) {
                        console.log(`Skipping binary file: ${filePath}`);
                        continue;
                    }
                    
                    await this.attachFile(file.fsPath);
                    indexedCount++;
                    
                    if (indexedCount % 10 === 0) {
                        console.log(`Indexed ${indexedCount}/${files.length} files`);
                    }
                } catch (fileError) {
                    console.error(`Error indexing file ${file.fsPath}:`, fileError);
                }
            }
            console.log(`Folder indexing completed: ${folderPath}. Indexed ${indexedCount}/${files.length} files`);
        } catch (error) {
            console.error(`Error finding files in folder ${folderPath}:`, error);
            throw error;
        }
    }

    private isBinaryPath(filePath: string): boolean {
        const binaryExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp',
            '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mov', '.wmv',
            '.zip', '.rar', '.7z', '.gz', '.tar', '.pdf', '.doc', '.docx',
            '.xls', '.xlsx', '.ppt', '.pptx', '.exe', '.dll', '.so', '.dylib'
        ];
        const ext = path.extname(filePath).toLowerCase();
        return binaryExtensions.includes(ext);
    }

    public async attachFile(filePath: string): Promise<void> {
        try {
            console.log(`Attaching file to index: ${filePath}`);
            const fileUri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(fileUri);
            const content = document.getText();
            
            console.log(`Generating embedding for file: ${filePath}`);
            const embedding = await this.aiEngine.generateEmbeddings(content);
            
            console.log(`Adding document to index: ${filePath}`);
            this.attachedFiles.add(filePath);
            await this.index.addDocument({
                uri: fileUri,
                content,
                embedding,
                path: filePath
            });
            console.log(`Successfully indexed file: ${filePath}`);
        } catch (error) {
            console.error(`Error attaching file ${filePath}:`, error);
        }
    }

    public async attachFolder(folderPath: string): Promise<void> {
        await this.indexFolder(folderPath);
    }

    public getAttachedFiles(): string[] {
        return Array.from(this.attachedFiles);
    }

    public getAttachedFolders(): string[] {
        return Array.from(this.attachedFolders);
    }

    public getIndex(): CodebaseIndex {
        return this.index;
    }

    public clearIndex(): void {
        this.index = new CodebaseIndex();
    }

    public async findSymbolAtPosition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.SymbolInformation | undefined> {
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        if (!symbols) return undefined;

        return symbols.find(symbol => {
            const range = symbol.location.range;
            return range.contains(position);
        });
    }

    public async findReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            uri,
            position
        );

        return references || [];
    }
}