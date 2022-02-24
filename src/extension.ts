import path = require('path');
import * as vscode from 'vscode';
import { openDataDictionary, readDataDictionary } from './ablDataDictionary';
import { run } from './ablRun';
import { ablTest } from './ablTest';
import { AblDebugConfigurationProvider } from './debugAdapter/ablDebugConfigurationProvider';
import { initDocumentController } from './parser/documentController';
import { ABLCompletionItemProvider, getTableCollection, watchDictDumpFiles } from './providers/ablCompletionProvider';
import { ABLDefinitionProvider } from './providers/ablDefinitionProvider';
import { ABLFormattingProvider } from './providers/ablFormattingProvider';
import { ABLHoverProvider } from './providers/ablHoverProvider';
import { loadConfigFile, OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { LanguageClient, LanguageClientOptions, ServerOptions, Executable } from 'vscode-languageclient/node';

let errorDiagnosticCollection: vscode.DiagnosticCollection;
let warningDiagnosticCollection: vscode.DiagnosticCollection;
let client: LanguageClient;

let oeRuntimes: Array<any>;
let defaultRuntime;
let langServDebug: boolean;
let projects: Array<OpenEdgeProjectConfig> = new Array();
let defaultProject: OpenEdgeProjectConfig;
let oeStatusBarItem: vscode.StatusBarItem;

export function activate(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('abl', new AblDebugConfigurationProvider()));

    // startBuildOnSaveWatcher(ctx.subscriptions);
    startDictWatcher();
    startDocumentWatcher(ctx);

    initProviders(ctx);
    registerCommands(ctx);

    const serverExec: Executable = {
        command: 'java',
        args: [
            '--add-opens=java.base/java.lang=ALL-UNNAMED',
            '--add-opens=java.base/java.math=ALL-UNNAMED',
            '--add-opens=java.base/java.util=ALL-UNNAMED',
            '--add-opens=java.base/java.util.concurrent=ALL-UNNAMED',
            '--add-opens=java.base/java.net=ALL-UNNAMED',
            '--add-opens=java.base/java.text=ALL-UNNAMED',
            '--add-opens=java.sql/java.sql=ALL-UNNAMED',
            '--add-opens=java.base/sun.nio.fs=ALL-UNNAMED',
            '-Dorg.slf4j.simpleLogger.defaultLogLevel=' + (langServDebug ? 'DEBUG' : 'INFO'),
            '-jar',
            path.join(__dirname, '/../abl-lsp.jar')
            // 'C:\\Users\\gquer\\projets\\abl-language-server\\bootstrap\\target\\abl-lsp-bootstrap-1.0.0-SNAPSHOT.jar'
            // '-classpath', 'C:\\Users\\gquer\\Projets\\abl-language-server\\langserv\\target\\classes;C:\\Users\\gquer\\Projets\\abl-language-server\\shade\\target\\abl-lsp-shaded-1.0.0-SNAPSHOT-shaded.jar', 'eu.rssw.openedge.ls.proparse.Main'
        ] };
    const serverOptions: ServerOptions = serverExec;

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'abl' }],
        synchronize: {
            configurationSection: 'abl',
            fileEvents: vscode.workspace.createFileSystemWatcher('**/openedge-project.properties')
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient('ablLanguageServer', 'ABL Language Server', serverOptions, clientOptions);

    // Start the client. This will also launch the server
    client.start();

	oeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    oeStatusBarItem.text = 'Click to refresh';
    oeStatusBarItem.command = 'abl.showProcesses';
    oeStatusBarItem.show();
	ctx.subscriptions.push(oeStatusBarItem);
}

function updateStatusBarItem(): void {
    client.sendRequest("proparse/pendingProcesses").then (data => {
        oeStatusBarItem.text = `$(megaphone) ${data} processes`;
        oeStatusBarItem.show();
    });
}

function registerCommands(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.showProcesses', () => {
        updateStatusBarItem();
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
    vscode.workspace.findFiles('**/openedge-project.json').then( list => {
        list.forEach ( uri => {
            console.log("OpenEdge project config file found: " + uri.fsPath);
            loadConfigFile(uri.fsPath).then(config => {
                // FIXME Way too verbose, there's probably a much better way to do that
                var prjConfig = new OpenEdgeProjectConfig();
                prjConfig.dlc = getDlcDirectory(config.version);
                prjConfig.rootDir = vscode.Uri.parse(path.dirname(uri.path)).fsPath
                prjConfig.version = config.version;
                prjConfig.gui = config.graphicalMode;
                prjConfig.propath = []
                prjConfig.propathMode = 'append';
                prjConfig.startupProc = ''
                prjConfig.parameterFiles = []
                prjConfig.dbDictionary = []
                // prjConfig.test = config.test
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
    langServDebug = vscode.workspace.getConfiguration('abl').get('langServerDebug');
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
        defaultProject.propath = [];
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
    new ABLFormattingProvider(context);
}

function startDocumentWatcher(context: vscode.ExtensionContext) {
    initDocumentController(context);
}

function startDictWatcher() {
    watchDictDumpFiles();
}
