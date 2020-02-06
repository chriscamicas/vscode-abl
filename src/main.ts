import * as vscode from 'vscode';
import { CheckResult, checkSyntax, removeSyntaxStatus } from './ablCheckSyntax';
import { ABLCompletionItemProvider, getTableCollection, watchDictDumpFiles } from './providers/ablCompletionProvider';
import { openDataDictionary, readDataDictionary } from './ablDataDictionary';
import { ABLSymbolProvider } from './providers/ablSymbolProvider';
import { ABL_MODE } from './ablMode';
import { run } from './ablRun';
import { ablTest } from './ablTest';
import { checkOpenEdgeConfigFile, checkProgressBinary } from './checkExtensionConfig';
import { AblDebugConfigurationProvider } from './debugAdapter/ablDebugConfigurationProvider';
import { ABLDefinitionProvider } from './providers/ablDefinitionProvider';
import { ABLHoverProvider } from './providers/ablHoverProvider';
import { ABLFormattingProvider } from './providers/ablFormattingProvider';
import { initDocumentController } from './parser/documentController';

let errorDiagnosticCollection: vscode.DiagnosticCollection;
let warningDiagnosticCollection: vscode.DiagnosticCollection;

export function activate(ctx: vscode.ExtensionContext): void {
    /*
        let useLangServer = vscode.workspace.getConfiguration('go')['useLanguageServer'];
        let langServerFlags: string[] = vscode.workspace.getConfiguration('go')['languageServerFlags'] || [];
        let toolsGopath = vscode.workspace.getConfiguration('go')['toolsGopath'];
	*/
    ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('abl', new AblDebugConfigurationProvider()));

    startBuildOnSaveWatcher(ctx.subscriptions);
    startDictWatcher();
    startDocumentWatcher(ctx);

    initProviders(ctx);
    registerCommands(ctx);

}


function registerCommands(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.propath', () => {
        // let gopath = process.env['GOPATH'];
        // let wasInfered = vscode.workspace.getConfiguration('go')['inferGopath'];
        vscode.window.showInformationMessage('PROPATH : ...');
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.checkSyntax', () => {
        const ablConfig = vscode.workspace.getConfiguration('abl');
        runBuilds(vscode.window.activeTextEditor.document, ablConfig);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dataDictionary', () => {
        openDataDictionary();
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dictionary.dumpDefinition', () => {
        let ablConfig = vscode.workspace.getConfiguration(ABL_MODE.language);
        readDataDictionary(ablConfig);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.run.currentFile', () => {
        const ablConfig = vscode.workspace.getConfiguration('abl');
        run(vscode.window.activeTextEditor.document.uri.fsPath, ablConfig);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.test', () => {
        const ablConfig = vscode.workspace.getConfiguration('abl');
        ablTest(null, ablConfig);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.test.currentFile', () => {
        const ablConfig = vscode.workspace.getConfiguration('abl');
        ablTest(vscode.window.activeTextEditor.document.uri.fsPath, ablConfig);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.tables', () => {
        return getTableCollection().items.map(item => item.label);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.table', (tableName) => {
        return getTableCollection().items.find(item => item.label == tableName);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.debug.startSession', (config) => {
        if (!config.request) { // if 'request' is missing interpret this as a missing launch.json
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'abl') {
                return;
            }

            // tslint:disable: object-literal-sort-keys
            config = Object.assign(config, {
                name: 'Attach',
                type: 'abl',
                request: 'attach',
            });
        }
        vscode.commands.executeCommand('vscode.startDebug', config);
    }));

    errorDiagnosticCollection = vscode.languages.createDiagnosticCollection('abl-error');
    ctx.subscriptions.push(errorDiagnosticCollection);
    warningDiagnosticCollection = vscode.languages.createDiagnosticCollection('abl-warning');
    ctx.subscriptions.push(warningDiagnosticCollection);

    {
        const ablConfig = vscode.workspace.getConfiguration('abl');
        const options = ['Ignore', 'Don\'t show this message again', 'Read the docs'];
        if (ablConfig.get('warnConfigFile')) {
            checkOpenEdgeConfigFile().catch((_) => {
                vscode.window.showInformationMessage('No .openedge.json found, using the default configuration', ...options).then((item) => {
                    if (item === options[1]) {
                        ablConfig.update('warnConfigFile', false);
                    } else if (item === options[2]) {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/chriscamicas/vscode-abl/wiki/Config-file'));
                    }
                });
            });
        }
        if (ablConfig.get('checkProgressBinary')) {
            checkProgressBinary().catch((_) => {
                vscode.window.showErrorMessage('Progress binary not found. You should check your configuration', ...options).then((item) => {
                    if (item === options[1]) {
                        ablConfig.update('checkProgressBinary', false);
                    } else if (item === options[2]) {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/chriscamicas/vscode-abl/wiki/Progress-binary-not-found'));
                    }
                });
            });
        }
    }
}

function deactivate() {
    // no need for deactivation yet
}

function initProviders(context: vscode.ExtensionContext) {
    new ABLCompletionItemProvider(context);
    new ABLHoverProvider(context);
    new ABLDefinitionProvider(context);
    new ABLSymbolProvider(context);
    new ABLFormattingProvider(context);
}
function startDocumentWatcher(context: vscode.ExtensionContext) {
    initDocumentController(context);
}

function runBuilds(document: vscode.TextDocument, ablConfig: vscode.WorkspaceConfiguration) {

    function mapSeverityToVSCodeSeverity(sev: string) {
        switch (sev) {
            case 'error': return vscode.DiagnosticSeverity.Error;
            case 'warning': return vscode.DiagnosticSeverity.Warning;
            default: return vscode.DiagnosticSeverity.Error;
        }
    }

    if (document.languageId !== 'abl') {
        return;
    }

    const uri = document.uri;
    checkSyntax(uri.fsPath, ablConfig).then((errors) => {
        errorDiagnosticCollection.clear();
        warningDiagnosticCollection.clear();

        const diagnosticMap: Map<string, Map<vscode.DiagnosticSeverity, vscode.Diagnostic[]>> = new Map();

        errors.forEach((error) => {
            const canonicalFile = vscode.Uri.file(error.file).toString();
            let startColumn = 0;
            let endColumn = 1;
            if (error.line === 0) {
                vscode.window.showErrorMessage(error.msg);
            } else {
                let range;
                if (document && document.uri.toString() === canonicalFile) {
                    range = new vscode.Range(error.line - 1, startColumn, error.line - 1, document.lineAt(error.line - 1).range.end.character + 1);
                    const text = document.getText(range);
                    const [_, leading, trailing] = /^(\s*).*(\s*)$/.exec(text);
                    startColumn = startColumn + leading.length;
                    endColumn = text.length - trailing.length;
                }
                range = new vscode.Range(error.line - 1, startColumn, error.line - 1, endColumn);
                const severity = mapSeverityToVSCodeSeverity(error.severity);
                const diagnostic = new vscode.Diagnostic(range, error.msg, severity);
                let diagnostics = diagnosticMap.get(canonicalFile);
                if (!diagnostics) {
                    diagnostics = new Map<vscode.DiagnosticSeverity, vscode.Diagnostic[]>();
                }
                if (!diagnostics[severity]) {
                    diagnostics[severity] = [];
                }
                diagnostics[severity].push(diagnostic);
                diagnosticMap.set(canonicalFile, diagnostics);
            }
        });
        diagnosticMap.forEach((diagMap, file) => {
            errorDiagnosticCollection.set(vscode.Uri.parse(file), diagMap[vscode.DiagnosticSeverity.Error]);
            warningDiagnosticCollection.set(vscode.Uri.parse(file), diagMap[vscode.DiagnosticSeverity.Warning]);
        });
    }).catch((err) => {
        vscode.window.showInformationMessage('Error: ' + err);
    });
}

function startBuildOnSaveWatcher(subscriptions: vscode.Disposable[]) {
    const ablConfig = vscode.workspace.getConfiguration('abl');
    if (ablConfig.get('checkSyntaxOnSave') === 'file') {
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (document.languageId !== 'abl') {
                return;
            }
            runBuilds(document, ablConfig);
        }, null, subscriptions);
    }
    vscode.workspace.onDidOpenTextDocument((document) => {
        removeSyntaxStatus();
    }, null, subscriptions);
    vscode.window.onDidChangeActiveTextEditor((_) => {
        removeSyntaxStatus();
    }, null, subscriptions);
}

function startDictWatcher() {
    watchDictDumpFiles();
}
