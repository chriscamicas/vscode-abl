import * as vscode from "vscode";
import * as utils from '../misc/utils';
import * as fs from 'fs';
import { ABL_MODE } from "../ablMode";
import { SYMBOL_TYPE, ABLVariable, ABLMethod, ABLParameter, ABLInclude, ABLTempTable, ABL_PARAM_DIRECTION, TextSelection, ABLSymbol } from "../misc/definition";
import { getAllIncludes, getAllMethods, getAllVariables, getAllParameters, getAllTempTables, getAllBuffers } from "./processDocument";
import { SourceCode, SourceParser } from "./sourceParser";
import { isNullOrUndefined } from "util";
import { getTableCollection } from "../providers/ablCompletionProvider";

let thisInstance: ABLDocumentController;
export function getDocumentController(): ABLDocumentController {
	return thisInstance;
}
export function initDocumentController(context: vscode.ExtensionContext): ABLDocumentController {
	thisInstance = new ABLDocumentController(context);
	return thisInstance;
}

export class ABLDocument {
	private _document: vscode.TextDocument;
	private _symbols: vscode.SymbolInformation[];
	private _vars: ABLVariable[];
	private _methods: ABLMethod[];
	private _includes: ABLInclude[];
	private _temps: ABLTempTable[];

	private _processed: boolean;

	public disposables: vscode.Disposable[] = [];
	public debounceController;
	public externalDocument: vscode.TextDocument[] = [];

	constructor(document: vscode.TextDocument) {
		this._document = document;
		this._symbols = [];
		this._vars = [];
		this._methods = [];
		this._includes = [];
		this._temps = [];
		this._processed = false;
	}

	dispose() {
		vscode.Disposable.from(...this.disposables).dispose();
	}

	public get symbols(): vscode.SymbolInformation[] { return this._symbols }
	public get methods(): ABLMethod[] { return this._methods }
	public get includes(): ABLInclude[] { return this._includes }
	public get tempTables(): ABLTempTable[] { return this._temps }
	public get document(): vscode.TextDocument { return this._document }
	public get processed(): boolean { return this._processed }

	public getMap(): Object {
		if (this._processed) {
			// remove "completion" items from temp-table map
			let tt = this._temps.map(item => {
				return Object.assign({}, item, { completion: undefined, completionFields: undefined, completionIndexes: undefined, completionAdditional: undefined });
			});
			let inc = this._includes.map(item => {
				let r = Object.assign({}, item);
				let doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath == item.fsPath);
				if (doc) {
					let extDoc = getDocumentController().getDocument(doc);
					if (extDoc) {
						r = Object.assign(r, { map: extDoc.getMap() });
					}
				}
				return r;
			});

			return {
				methods: this._methods,
				variables: this._vars,
				tempTables: tt,
				includes: inc,
				external: this.externalDocument
			};
		}
		return;
	}

	public getCompletionTempTableFields(prefix: string, replacement?: string): vscode.CompletionItem[] {
		// Temp-tables
		let tt = this.tempTables.find(item => item.label.toLowerCase() == prefix);
		if (tt) {
			let result = tt.completion.items;
			if (!isNullOrUndefined(replacement))
				result = utils.replaceSnippetTableName(result, prefix, replacement);
			return result;
		}
		return [];
	}

	public getCompletionSymbols(position?: vscode.Position): vscode.CompletionItem[] {
		// Temp-tables
		let tt: vscode.CompletionItem[] = this._temps.map(item => {
			return new vscode.CompletionItem(item.label);
		});
		// Methods
		let md: vscode.CompletionItem[] = [];
		this._methods.forEach(m => {
			let _mi = new vscode.CompletionItem(m.name, vscode.CompletionItemKind.Method);
			if (m.params.length > 0) {
				let pf = true;
				let snip: vscode.SnippetString = new vscode.SnippetString();
				snip.appendText(m.name + '(');
				m.params.forEach(p => {
					if (!pf)
						snip.appendText(',\n\t');
					else
						pf = false;
					if (p.dataType == 'buffer') {
						snip.appendText('buffer ');
					}
					else {
						if (p.direction == ABL_PARAM_DIRECTION.IN)
							snip.appendText('input ');
						else if (p.direction == ABL_PARAM_DIRECTION.OUT)
							snip.appendText('output ');
						else
							snip.appendText('input-output ');
						if (p.dataType == 'temp-table')
							snip.appendText('table ');
					}
					snip.appendPlaceholder(p.name);
				});
				snip.appendText(')');
				_mi.insertText = snip;
			}
			md.push(_mi);
		});
		// buffers
		let gb = this._vars.filter(v => v.dataType == 'buffer').map(item => {
			return new vscode.CompletionItem(item.name);
		});
		// method buffers
		let lb = [];
		let lp = [];
		let m = this.getMethodInPosition(position);
		if (!isNullOrUndefined(m)) {
			lb = m.localVars.filter(v => v.dataType == 'buffer').map(item => {
				return new vscode.CompletionItem(item.name);
			});
			lp = m.params.filter(v => v.dataType == 'buffer').map(item => {
				return new vscode.CompletionItem(item.name);
			});
		}
		//
		return [...tt, ...md, ...gb, ...lb, ...lp];
	}

	public pushDocumentSignal(document: ABLDocument) {
		if (this.processed) {
			let extDoc = this.externalDocument.find(item => item == document.document);
			if (extDoc)
				this.refreshExternalReferences(extDoc);
		}
	}

	public refreshDocument(): Promise<ABLDocument> {
		this._processed = false;
		this.externalDocument = [];

		let refreshIncludes = this.refreshIncludes.bind(this);
		let refreshMethods = this.refreshMethods.bind(this);
		let refreshVariables = this.refreshVariables.bind(this);
		let refreshParameters = this.refreshParameters.bind(this);
		let refreshTempTables = this.refreshTempTables.bind(this);
		let refreshSymbols = this.refreshSymbols.bind(this);
		let self = this;

		let sourceCode = new SourceParser().getSourceCode(this._document);

		let result = new Promise<ABLDocument>(function (resolve, reject) {
			refreshIncludes(sourceCode);
			refreshMethods(sourceCode);
			refreshVariables(sourceCode);
			refreshParameters(sourceCode);
			refreshTempTables(sourceCode);
			refreshSymbols();
			resolve(self);
		});

		// refresh temp-table "like" from other temp-tables (check if external document has been processed)
		// create procedure snippets with parameters

		// finaliza processo
		let finish = () => {
			this._processed = true;
			this.refreshExternalReferences(this._document);
			getDocumentController().broadcastDocumentChange(this);
		};
		result.then(() => finish());
		return result;
	}

	public refreshExternalReferences(document: vscode.TextDocument) {
		// temp-tables
		this.tempTables.filter(item => item.referenceTable).forEach(item => {
			let fields = this.getDeclaredTempTableFields(item.referenceTable, document);
			if (fields) {
				item.referenceFields = fields;
				utils.updateTableCompletionList(item);
			}
		});
	}

	private insertExternalDocument(doc: vscode.TextDocument) {
		this.externalDocument.push(doc);
		this.refreshExternalReferences(doc);
	}

	public getDeclaredTempTableFields(filename: string, changedDocument?: vscode.TextDocument): ABLVariable[] {
		let name = filename.toLowerCase();
		let tt = this._temps.find(item => item.label.toLowerCase() == name);
		if (tt)
			return tt.fields;
		//
		let items;
		if ((changedDocument) && (this.externalDocument.find(item => item == changedDocument))) {
			let extDoc = getDocumentController().getDocument(changedDocument);
			if ((extDoc) && (extDoc.processed)) {
				items = extDoc.getDeclaredTempTableFields(filename);
			}
		}
		if (items)
			return items;
		return;
	}

	private refreshIncludes(sourceCode: SourceCode) {
		this._includes = getAllIncludes(sourceCode);
		this._includes.forEach(item => {
			vscode.workspace.workspaceFolders.forEach(folder => {
				let uri = folder.uri.with({ path: [folder.uri.path, item.name].join('/') });
				if (fs.existsSync(uri.fsPath)) {
					item.fsPath = uri.fsPath;
					if (!this.externalDocument.find(item => item.uri.fsPath == uri.fsPath)) {
						vscode.workspace.openTextDocument(uri).then(doc => this.insertExternalDocument(doc));
					}
				}
			})
		});
	}

	private refreshMethods(sourceCode: SourceCode) {
		this._methods = getAllMethods(sourceCode);
		this.resolveMethodConflicts();
	}

	private resolveMethodConflicts() {
		// adjust method start/end lines (missing "procedure" on "end [procedure]")
		let _prevMethod: ABLMethod;
		this._methods.forEach(method => {
			if (!isNullOrUndefined(_prevMethod)) {
				if (method.lineAt < _prevMethod.lineEnd) {
					_prevMethod.lineEnd = method.lineAt - 1;
				}
			}
			_prevMethod = method;
		});
	}

	private refreshSymbols() {
		this._symbols = [];
		// add methods
		this._methods.forEach(item => {
			let range: vscode.Range = new vscode.Range(new vscode.Position(item.lineAt, 0), new vscode.Position(item.lineEnd, 0));
			let sym = new vscode.SymbolInformation(item.name, vscode.SymbolKind.Function, range, this._document.uri, SYMBOL_TYPE.METHOD);
			this._symbols.push(sym);
		});
	}

	private refreshVariables(sourceCode: SourceCode) {
		this._vars = [];
		let _vars = [].concat(getAllVariables(sourceCode)).concat(getAllBuffers(sourceCode));

		if (!isNullOrUndefined(_vars) && !isNullOrUndefined(this._methods)) {
			_vars.forEach(item => {
				let method = this._methods.find(m => (m.lineAt <= item.line && m.lineEnd >= item.line));
				if (method)
					method.localVars.push(item);
				else
					this._vars.push(item);
			});
		}
	}

	private refreshParameters(sourceCode: SourceCode) {
		let _params = getAllParameters(sourceCode);
		_params.forEach(item => {
			let method = this._methods.find(m => (m.lineAt <= item.line && m.lineEnd >= item.line));
			if (method)
				method.params.push(item);
		});
	}

	private refreshTempTables(sourceCode: SourceCode) {
		this._temps = getAllTempTables(sourceCode);
		// reference to db tables
		this._temps.filter(item => !isNullOrUndefined(item.referenceTable)).forEach(item => {
			let tb = getTableCollection().items.find(tn => tn.label.toLowerCase() == item.referenceTable.toLowerCase());
			if ((!isNullOrUndefined(tb)) && (!isNullOrUndefined(tb['fields']))) {
				item.referenceFields = [...tb['fields']];
				utils.updateTableCompletionList(item);
			}
		});
	}

	public getMethodInPosition(position?: vscode.Position): ABLMethod {
		if (!isNullOrUndefined(position))
			return this._methods.find(item => {
				return (item.lineAt <= position.line) && (item.lineEnd >= position.line);
			});
		return;
	}

	public searchBuffer(name: string, position?: vscode.Position): string {
		// method buffers
		let m = this.getMethodInPosition(position);
		if (!isNullOrUndefined(m)) {
			let lb = m.localVars.filter(v => v.dataType == 'buffer').find(v => v.name.toLowerCase() == name.toLowerCase());
			if (!isNullOrUndefined(lb))
				return lb.additional.toLowerCase();
			let lp = m.params.filter(v => v.dataType == 'buffer').find(v => v.name.toLowerCase() == name.toLowerCase());
			if (!isNullOrUndefined(lp))
				return lp.additional.toLowerCase();
		}
		let res = this._vars.filter(v => v.dataType == 'buffer').find(v => v.name.toLowerCase() == name.toLowerCase());
		if (!isNullOrUndefined(res))
			return res.additional.toLowerCase();
		return;
	}

	public searchSymbol(words: string[], selectedWord?: string, position?: vscode.Position, deepSearch?: boolean): ABLSymbol {
		selectedWord = ('' || selectedWord).toLowerCase();
		let location: vscode.Location;
		if ((words.length == 1) || ((words.length > 0) && (words[0].toLowerCase() == selectedWord))) {
			let word = words[0].toLowerCase();

			// temp-table
			let tt = this._temps.find(item => item.label.toLowerCase() == word);
			if (!isNullOrUndefined(tt)) {
				location = new vscode.Location(this.document.uri, new vscode.Position(tt.line, 0));
				return { type: SYMBOL_TYPE.TEMPTABLE, value: tt, location: location };
			}

			// method
			let mt = this._methods.find(item => item.name.toLowerCase() == word);
			if (!isNullOrUndefined(mt)) {
				location = new vscode.Location(this.document.uri, new vscode.Position(mt.lineAt, 0));
				return { type: SYMBOL_TYPE.METHOD, value: mt, location: location };
			}

			// local parameters / variables
			mt = this.getMethodInPosition(position);
			if (mt) {
				let lp = mt.params.find(item => item.name.toLowerCase() == word);
				if (!isNullOrUndefined(lp)) {
					location = new vscode.Location(this.document.uri, new vscode.Position(lp.line, 0));
					return { type: SYMBOL_TYPE.LOCAL_PARAM, value: lp, origin: mt, location: location };
				}
				let lv = mt.localVars.find(item => item.name.toLowerCase() == word);
				if (!isNullOrUndefined(lv)) {
					location = new vscode.Location(this.document.uri, new vscode.Position(lv.line, 0));
					return { type: SYMBOL_TYPE.LOCAL_VAR, value: lv, origin: mt, location: location };
				}
			}

			// variables
			let gv = this._vars.find(item => item.name.toLowerCase() == word);
			if (!isNullOrUndefined(gv)) {
				location = new vscode.Location(this.document.uri, new vscode.Position(gv.line, 0));
				return { type: SYMBOL_TYPE.GLOBAL_VAR, value: gv, location: location };
			}
		}
		else if (words.length > 1) {
			let word0 = words[0].toLowerCase();
			let word1 = words[1].toLowerCase();
			// temp-table
			let tt = this._temps.find(item => item.label.toLowerCase() == word0);
			if (!isNullOrUndefined(tt)) {
				let fd = tt.fields.find(item => item.name.toLowerCase() == word1);
				if (fd) {
					location = new vscode.Location(this.document.uri, new vscode.Position(tt.line, 0));
					return { type: SYMBOL_TYPE.TEMPTABLE_FIELD, value: fd, origin: tt, location: location };
				}
				else {
					return;
				}
			}
		}

		// External documents
		if (deepSearch) {
			let extSym;
			this.externalDocument.forEach(external => {
				if (isNullOrUndefined(extSym)) {
					let extDoc = getDocumentController().getDocument(external);
					if ((extDoc) && (extDoc.processed)) {
						extSym = extDoc.searchSymbol(words, selectedWord, position, deepSearch);
					}
				}
			});
			if (!isNullOrUndefined(extSym))
				return extSym;
		}

		return;
	}

}

export class ABLDocumentController {

	private _documents: ABLDocument[] = [];

	constructor(context: vscode.ExtensionContext) {
		this.initialize(context);
	}

	dispose() {
		this._documents.forEach(d => d.dispose());
	}

	private initialize(context: vscode.ExtensionContext) {
		context.subscriptions.push(this);

		// Current documents
		vscode.workspace.textDocuments.forEach(document => {
			this.insertDocument(document);
		});

		// Document changes
		vscode.workspace.onDidSaveTextDocument(document => { this.updateDocument(document) }, null, context.subscriptions);
		vscode.workspace.onDidOpenTextDocument(document => { this.insertDocument(document) }, null, context.subscriptions);
		vscode.workspace.onDidCloseTextDocument(document => { this.removeDocument(document) }, null, context.subscriptions);
		vscode.workspace.onWillSaveTextDocument(event => { this.prepareToSaveDocument(event.document) }, null, context.subscriptions);
	}

	public insertDocument(document: vscode.TextDocument) {
		if (document.languageId === ABL_MODE.language) {
			if (!this._documents[document.uri.fsPath]) {
				let ablDoc = new ABLDocument(document);
				this._documents[document.uri.fsPath] = ablDoc;

				vscode.workspace.onDidChangeTextDocument(event => {
					if (event.document.uri.fsPath == document.uri.fsPath) {
						this.updateDocument(document, 5000);
					}
				}, this, ablDoc.disposables);
			}
			return this.updateDocument(document);
		}

	}

	public removeDocument(document: vscode.TextDocument) {
		let d: ABLDocument = this._documents[document.uri.fsPath];
		if (d) {
			if (d.debounceController) {
				clearTimeout(d.debounceController);
				d.debounceController = null;
			}
			vscode.Disposable.from(...d.disposables).dispose();
		}
		delete this._documents[document.uri.fsPath];
	}

	public updateDocument(document: vscode.TextDocument, debounceTime?: number): Thenable<any> {
		if (document.languageId === ABL_MODE.language) {
			let ablDoc: ABLDocument = this._documents[document.uri.fsPath];
			let invoke = this.invokeUpdateDocument;
			return new Promise(function (resolve, reject) {
				if (ablDoc) {
					// cancel any pending update request
					if (ablDoc.debounceController) {
						clearTimeout(ablDoc.debounceController);
					}
					// if debouce time is set, creates a timer
					if (debounceTime) {
						ablDoc.debounceController = setTimeout(() => invoke(ablDoc), debounceTime);
					}
					else {
						invoke(ablDoc);
					}
					// always resolve, even if debounce time is set...
					resolve();
				}
				else
					reject();
			});
		}
	}

	public prepareToSaveDocument(document: vscode.TextDocument) {
		//
	}

	public getDocument(document: vscode.TextDocument): ABLDocument {
		return this._documents[document.uri.fsPath];
	}

	private invokeUpdateDocument(ablDoc: ABLDocument) {
		ablDoc.refreshDocument();
	}

	public broadcastDocumentChange(ablDoc: ABLDocument) {
		for (let item in this._documents) {
			if (item != ablDoc.document.uri.fsPath)
				this._documents[item].pushDocumentSignal(ablDoc);
		}
	}

}
