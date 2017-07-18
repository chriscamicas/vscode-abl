import * as vscode from 'vscode';
import { checkSyntax, ICheckResult, removeTestStatus } from './ablCheckSyntax';
import { run } from './ablRun';

let errorDiagnosticCollection: vscode.DiagnosticCollection;
let warningDiagnosticCollection: vscode.DiagnosticCollection;

export function activate(ctx: vscode.ExtensionContext): void {
    /*
        let useLangServer = vscode.workspace.getConfiguration('go')['useLanguageServer'];
        let langServerFlags: string[] = vscode.workspace.getConfiguration('go')['languageServerFlags'] || [];
        let toolsGopath = vscode.workspace.getConfiguration('go')['toolsGopath'];
    */
	startBuildOnSaveWatcher(ctx.subscriptions);


	ctx.subscriptions.push(vscode.commands.registerCommand('abl.propath', () => {
		// let gopath = process.env['GOPATH'];
		// let wasInfered = vscode.workspace.getConfiguration('go')['inferGopath'];
		vscode.window.showInformationMessage('PROPATH : ...');
	}));
	ctx.subscriptions.push(vscode.commands.registerCommand('abl.checkSyntax', () => {
		let ablConfig = vscode.workspace.getConfiguration('abl');
		runBuilds(vscode.window.activeTextEditor.document, ablConfig);
	}));
	ctx.subscriptions.push(vscode.commands.registerCommand('abl.run.currentFile', () => {
		let ablConfig = vscode.workspace.getConfiguration('abl');
		run(vscode.window.activeTextEditor.document.uri.fsPath, ablConfig);
	}));

	errorDiagnosticCollection = vscode.languages.createDiagnosticCollection('abl-error');
	ctx.subscriptions.push(errorDiagnosticCollection);
	warningDiagnosticCollection = vscode.languages.createDiagnosticCollection('abl-warning');
	ctx.subscriptions.push(warningDiagnosticCollection);
}

function deactivate() {
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

	let uri = document.uri;
	checkSyntax(uri.fsPath, ablConfig).then(errors => {
		errorDiagnosticCollection.clear();
		warningDiagnosticCollection.clear();

		let diagnosticMap: Map<string, Map<vscode.DiagnosticSeverity, vscode.Diagnostic[]>> = new Map();

		errors.forEach(error => {
			let canonicalFile = vscode.Uri.file(error.file).toString();
			let startColumn = 0;
			let endColumn = 1;
			if (document && document.uri.toString() === canonicalFile) {
				let range = new vscode.Range(error.line - 1, error.column, error.line - 1, document.lineAt(error.line - 1).range.end.character + 1);
				let text = document.getText(range);
				let [_, leading, trailing] = /^(\s*).*(\s*)$/.exec(text);
				startColumn = leading.length;
				endColumn = text.length - trailing.length;
			}
			let range = new vscode.Range(error.line - 1, startColumn, error.line - 1, endColumn);
			// TODO voir si on gère le error.column
			// let range = new vscode.Range(error.line - 1, error.column, error.line - 1, error.column);
			let severity = mapSeverityToVSCodeSeverity(error.severity);
			let diagnostic = new vscode.Diagnostic(range, error.msg, severity);
			let diagnostics = diagnosticMap.get(canonicalFile);
			if (!diagnostics) {
				diagnostics = new Map<vscode.DiagnosticSeverity, vscode.Diagnostic[]>();
			}
			if (!diagnostics[severity]) {
				diagnostics[severity] = [];
			}
			diagnostics[severity].push(diagnostic);
			diagnosticMap.set(canonicalFile, diagnostics);
		});
		diagnosticMap.forEach((diagMap, file) => {
			errorDiagnosticCollection.set(vscode.Uri.parse(file), diagMap[vscode.DiagnosticSeverity.Error]);
			warningDiagnosticCollection.set(vscode.Uri.parse(file), diagMap[vscode.DiagnosticSeverity.Warning]);
		});
	}).catch(err => {
		vscode.window.showInformationMessage('Error: ' + err);
	});
}

function startBuildOnSaveWatcher(subscriptions: vscode.Disposable[]) {
	let ablConfig = vscode.workspace.getConfiguration('abl');
	if (ablConfig.get('checkSyntaxOnSave') === 'file') {
		vscode.workspace.onDidSaveTextDocument(document => {
			if (document.languageId !== 'abl') {
				return;
			}
			runBuilds(document, ablConfig);
		}, null, subscriptions);
	}
}
