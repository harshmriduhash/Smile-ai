/// <reference types="jest" />
// import * as vscode from 'vscode';

// VSCode API mock
const mockVSCode = {
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        createWebviewPanel: jest.fn(),
        activeTextEditor: {
            document: {
                getText: jest.fn(),
                fileName: 'test.ts',
                lineAt: jest.fn()
            },
            edit: jest.fn()
        },
        webviewPanels: new Set()
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn()
        })
    },
    commands: {
        registerCommand: jest.fn(),
        executeCommand: jest.fn(),
        getCommands: jest.fn().mockResolvedValue([
            'smile-ai.startChat',
            'smile-ai.startComposer',
            'smile-ai.analyzeCode',
            'smile-ai.generateTests',
            'smile-ai.refactorCode',
            'smile-ai.explainCode'
        ])
    },
    Uri: {
        parse: jest.fn(),
        joinPath: jest.fn()
    },
    Range: jest.fn(),
    Position: jest.fn(),
    Disposable: jest.fn(),
    EventEmitter: jest.fn(),
    ViewColumn: {
        One: 1,
        Two: 2
    }
};

// Global mock setup
jest.mock('vscode', () => mockVSCode, { virtual: true });

// Test ortamı hazırlığı
beforeAll(() => {
    // Test öncesi genel hazırlıklar
});

afterAll(() => {
    // Test sonrası temizlik
    jest.clearAllMocks();
});

beforeEach(() => {
    // Her test öncesi hazırlık
    jest.clearAllMocks();
    mockVSCode.window.webviewPanels.clear();
});

afterEach(() => {
    // Her test sonrası temizlik
}); 