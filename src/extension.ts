import path = require('path');
import * as vscode from 'vscode';
import { checkSyntax, removeSyntaxStatus } from './ablCheckSyntax';
import { openDataDictionary, readDataDictionary } from './ablDataDictionary';
import { run } from './ablRun';
import { ablTest } from './ablTest';
import { AblDebugConfigurationProvider } from './debugAdapter/ablDebugConfigurationProvider';
import { initDocumentController } from './parser/documentController';
import { ABLCompletionItemProvider, getTableCollection, watchDictDumpFiles } from './providers/ablCompletionProvider';
import { ABLDefinitionProvider } from './providers/ablDefinitionProvider';
import { ABLFormattingProvider } from './providers/ablFormattingProvider';
import { ABLHoverProvider } from './providers/ablHoverProvider';
import { ABLSymbolProvider } from './providers/ablSymbolProvider';
import { loadConfigFile, OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';

let errorDiagnosticCollection: vscode.DiagnosticCollection;
let warningDiagnosticCollection: vscode.DiagnosticCollection;

let oeRuntimes: Array<any>;
let defaultRuntime;
let projects: Array<OpenEdgeProjectConfig> = new Array();
let defaultProject: OpenEdgeProjectConfig;

export function activate(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('abl', new AblDebugConfigurationProvider()));

    startBuildOnSaveWatcher(ctx.subscriptions);
    startDictWatcher();
    startDocumentWatcher(ctx);

    initProviders(ctx);
    registerCommands(ctx);
}

function registerCommands(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.checkSyntax', () => {
        runBuilds(vscode.window.activeTextEditor.document);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dataDictionary', () => {
        openDataDictionary(getProject(vscode.window.activeTextEditor.document.uri.fsPath));
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dictionary.dumpDefinition', () => {
        readDataDictionary(getProject(vscode.window.activeTextEditor.document.uri.fsPath));
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.run.currentFile', () => {
        let cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
        run(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
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
        return getTableCollection().items.map((item) => item.label);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.table', (tableName) => {
        return getTableCollection().items.find((item) => item.label === tableName);
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

    readGlobalOpenEdgeRuntimes();
    // FIXME Check if it's possible to reload only when a specific section is changed
    vscode.workspace.onDidChangeConfiguration(event =>  { readGlobalOpenEdgeRuntimes() });

    readWorkspaceOEConfigFiles();
    let watcher = vscode.workspace.createFileSystemWatcher('**/.openedge.json');
    watcher.onDidChange(uri => readWorkspaceOEConfigFiles());
    watcher.onDidCreate(uri => readWorkspaceOEConfigFiles());
    watcher.onDidDelete(uri => readWorkspaceOEConfigFiles());
}

function readWorkspaceOEConfigFiles() {
    vscode.workspace.findFiles('**/.openedge.json').then( list => {
        list.forEach ( uri => {
            console.log("OpenEdge project config file found: " + uri.fsPath);
            loadConfigFile(uri.fsPath).then(config => {
                // FIXME Way too verbose, there's probably a much better way to do that
                var prjConfig = new OpenEdgeProjectConfig();
                prjConfig.dlc = getDlcDirectory(config.OpenEdgeVersion);
                prjConfig.rootDir = vscode.Uri.parse(path.dirname(uri.path)).fsPath // path.dirname(uri.path);
                prjConfig.version = config.OpenEdgeVersion;
                prjConfig.gui = config.gui;
                // Make sure propath is always initialized
                if (!config.proPath || !(config.proPath instanceof Array) || config.proPath.length === 0) 
                    prjConfig.propath = [path.posix.normalize(prjConfig.rootDir)]
                else
                    prjConfig.propath = config.proPath
                if (!config.proPathMode)
                    prjConfig.propathMode = 'append';
                else
                    prjConfig.propathMode = config.proPathMode
                if (!config.startupProcedure)
                    prjConfig.startupProc = ''
                else
                    prjConfig.startupProc = config.startupProcedure
                if (!config.parameterFiles || !(config.parameterFiles instanceof Array) || config.parameterFiles.length === 0) 
                    prjConfig.parameterFiles = []
                else
                    prjConfig.parameterFiles = config.parameterFiles
                if (!config.dbDictionary || !(config.dbDictionary instanceof Array) || config.dbDictionary.length === 0) 
                    prjConfig.dbDictionary = []
                else
                    prjConfig.dbDictionary = config.dbDictionary
                prjConfig.test = config.test
                prjConfig.format = config.format

                if (prjConfig.dlc != "") {
                    console.log("OpenEdge project configured in " + prjConfig.rootDir + " -- DLC: " + prjConfig.dlc);
                    projects.push(prjConfig);
                }
            });
        });
    });
}

function readGlobalOpenEdgeRuntimes() {
    oeRuntimes = vscode.workspace.getConfiguration('abl.configuration').get<Array<any>>('runtimes');
    if (oeRuntimes.length == 0) {
        vscode.window.showWarningMessage('No OpenEdge runtime configured on this machine');
    }
    defaultRuntime = oeRuntimes.find(runtime => runtime.default);
    if (defaultRuntime != null) {
        defaultProject = new OpenEdgeProjectConfig();
        defaultProject.dlc = defaultRuntime.path;
        defaultProject.rootDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
        defaultProject.version = defaultRuntime.name;
        defaultProject.gui = false;
    }
}

function getDlcDirectory(version: string): string {
  let dlc: string = "";
  oeRuntimes.forEach( runtime => {
      if (runtime.name === version)
        dlc = runtime.path
    });
  return dlc;
}

export function getProject(path: string): OpenEdgeProjectConfig {
    let retVal = projects.find(config => path.startsWith(config.rootDir));
    return (retVal != null) ? retVal : defaultProject;
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

function runBuilds(document: vscode.TextDocument) {

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

    checkSyntax(document.uri.fsPath, getProject(document.uri.fsPath)).then((errors) => {
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
            runBuilds(document);
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
