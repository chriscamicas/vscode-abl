import * as fs from 'fs';
import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { ABL_MODE } from '../ablMode';
import { ABL_PARAM_DIRECTION, ABLInclude, ABLMethod, ABLParameter, ABLSymbol, ABLTempTable, ABLVariable, SYMBOL_TYPE, TextSelection } from '../misc/definition';
import * as utils from '../misc/utils';
import { getTableCollection } from '../providers/ablCompletionProvider';
import { getAllBuffers, getAllIncludes, getAllMethods, getAllParameters, getAllTempTables, getAllVariables } from './processDocument';
import { SourceCode, SourceParser } from './sourceParser';

let thisInstance: ABLDocumentController;
export function getDocumentController(): ABLDocumentController {
    return thisInstance;
}
export function initDocumentController(context: vscode.ExtensionContext): ABLDocumentController {
    thisInstance = new ABLDocumentController(context);
    return thisInstance;
}

export class ABLDocument {

    public get symbols(): vscode.SymbolInformation[] { return this._symbols; }
    public get methods(): ABLMethod[] { return this._methods; }
    public get includes(): ABLInclude[] { return this._includes; }
    public get tempTables(): ABLTempTable[] { return this._temps; }
    public get document(): vscode.TextDocument { return this._document; }
    public get processed(): boolean { return this._processed; }

    public disposables: vscode.Disposable[] = [];
    public debounceController;
    public externalDocument: vscode.TextDocument[] = [];
    private _document: vscode.TextDocument;
    private _symbols: vscode.SymbolInformation[];
    private _vars: ABLVariable[];
    private _methods: ABLMethod[];
    private _includes: ABLInclude[];
    private _temps: ABLTempTable[];

    private _processed: boolean;

    constructor(document: vscode.TextDocument) {
        this._document = document;
        this._symbols = [];
        this._vars = [];
        this._methods = [];
        this._includes = [];
        this._temps = [];
        this._processed = false;
    }

    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose();
    }

    // tslint:disable-next-line:ban-types
    public getMap(): Object {
        if (this._processed) {
            // remove "completion" items from temp-table map
            const tt = this._temps.map((item) => {
                return Object.assign({}, item, { completion: undefined, completionFields: undefined, completionIndexes: undefined, completionAdditional: undefined });
            });
            const inc = this._includes.map((item) => {
                let r = Object.assign({}, item);
                const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === item.fsPath);
                if (doc) {
                    const extDoc = getDocumentController().getDocument(doc);
                    if (extDoc) {
                        r = Object.assign(r, { map: extDoc.getMap() });
                    }
                }
                return r;
            });

            return {
                external: this.externalDocument,
                includes: inc,
                methods: this._methods,
                tempTables: tt,
                variables: this._vars,
            };
        }
        return;
    }

    public getCompletionTempTableFields(prefix: string, replacement?: string): vscode.CompletionItem[] {
        // Temp-tables
        const tt = this.tempTables.find((item) => item.label.toLowerCase() === prefix);
        if (tt) {
            let result = tt.completion.items;
            if (!isNullOrUndefined(replacement)) {
                result = utils.replaceSnippetTableName(result, prefix, replacement);
            }
            return result;
        }
        return [];
    }

    public getCompletionSymbols(position?: vscode.Position): vscode.CompletionItem[] {
        // Temp-tables
        const tt: vscode.CompletionItem[] = this._temps.map((item) => {
            return new vscode.CompletionItem(item.label);
        });
        // Methods
        const md: vscode.CompletionItem[] = [];
        this._methods.forEach((m) => {
            const _mi = new vscode.CompletionItem(m.name, vscode.CompletionItemKind.Method);
            if (m.params.length > 0) {
                let pf = true;
                const snip: vscode.SnippetString = new vscode.SnippetString();
                snip.appendText(m.name + '(');
                m.params.forEach((p) => {
                    if (!pf) {
                        snip.appendText(',\n\t');
                    } else {
                        pf = false;
                    }
                    if (p.dataType === 'buffer') {
                        snip.appendText('buffer ');
                    } else {
                        if (p.direction === ABL_PARAM_DIRECTION.IN) {
                            snip.appendText('input ');
                        } else if (p.direction === ABL_PARAM_DIRECTION.OUT) {
                            snip.appendText('output ');
                        } else {
                            snip.appendText('input-output ');
                        }
                        if (p.dataType === 'temp-table') {
                            snip.appendText('table ');
                        }
                    }
                    snip.appendPlaceholder(p.name);
                });
                snip.appendText(')');
                _mi.insertText = snip;
            }
            md.push(_mi);
        });
        // buffers
        const gb = this._vars.filter((v) => v.dataType === 'buffer').map((item) => {
            return new vscode.CompletionItem(item.name);
        });
        // method buffers
        let lb = [];
        let lp = [];
        const mp = this.getMethodInPosition(position);
        if (!isNullOrUndefined(mp)) {
            lb = mp.localVars.filter((v) => v.dataType === 'buffer').map((item) => {
                return new vscode.CompletionItem(item.name);
            });
            lp = mp.params.filter((v) => v.dataType === 'buffer').map((item) => {
                return new vscode.CompletionItem(item.name);
            });
        }
        //
        return [...tt, ...md, ...gb, ...lb, ...lp];
    }

    public pushDocumentSignal(document: ABLDocument) {
        if (this.processed) {
            const extDoc = this.externalDocument.find((item) => item === document.document);
            if (extDoc) {
                this.refreshExternalReferences(extDoc);
            }
        }
    }

    public refreshDocument(): Promise<ABLDocument> {
        this._processed = false;
        this.externalDocument = [];

        const refreshIncludes = this.refreshIncludes.bind(this);
        const refreshMethods = this.refreshMethods.bind(this);
        const refreshVariables = this.refreshVariables.bind(this);
        const refreshParameters = this.refreshParameters.bind(this);
        const refreshTempTables = this.refreshTempTables.bind(this);
        const refreshSymbols = this.refreshSymbols.bind(this);
        const self = this;

        const sourceCode = new SourceParser().getSourceCode(this._document);

        const result = new Promise<ABLDocument>((resolve, reject) => {
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
        const finish = () => {
            this._processed = true;
            this.refreshExternalReferences(this._document);
            getDocumentController().broadcastDocumentChange(this);
        };
        result.then(() => finish());
        return result;
    }

    public refreshExternalReferences(document: vscode.TextDocument) {
        // temp-tables
        this.tempTables.filter((item) => item.referenceTable).forEach((item) => {
            const fields = this.getDeclaredTempTableFields(item.referenceTable, document);
            if (fields) {
                item.referenceFields = fields;
                utils.updateTableCompletionList(item);
            }
        });
    }

    public getDeclaredTempTableFields(filename: string, changedDocument?: vscode.TextDocument): ABLVariable[] {
        const name = filename.toLowerCase();
        const tt = this._temps.find((item) => item.label.toLowerCase() === name);
        if (tt) {
            return tt.fields;
        }
        //
        let items;
        if ((changedDocument) && (this.externalDocument.find((item) => item === changedDocument))) {
            const extDoc = getDocumentController().getDocument(changedDocument);
            if ((extDoc) && (extDoc.processed)) {
                items = extDoc.getDeclaredTempTableFields(filename);
            }
        }
        if (items) {
            return items;
        }
        return;
    }

    public getMethodInPosition(position?: vscode.Position): ABLMethod {
        if (!isNullOrUndefined(position)) {
            return this._methods.find((item) => {
                return (item.lineAt <= position.line) && (item.lineEnd >= position.line);
            });
        }
        return;
    }

    public searchBuffer(name: string, position?: vscode.Position): string {
        // method buffers
        const m = this.getMethodInPosition(position);
        if (!isNullOrUndefined(m)) {
            const lb = m.localVars.filter((v) => v.dataType === 'buffer').find((v) => v.name.toLowerCase() === name.toLowerCase());
            if (!isNullOrUndefined(lb)) {
                return lb.additional.toLowerCase();
            }
            const lp = m.params.filter((v) => v.dataType === 'buffer').find((v) => v.name.toLowerCase() === name.toLowerCase());
            if (!isNullOrUndefined(lp)) {
                return lp.additional.toLowerCase();
            }
        }
        const res = this._vars.filter((v) => v.dataType === 'buffer').find((v) => v.name.toLowerCase() === name.toLowerCase());
        if (!isNullOrUndefined(res)) {
            return res.additional.toLowerCase();
        }
        return;
    }

    public searchSymbol(words: string[], selectedWord?: string, position?: vscode.Position, deepSearch?: boolean): ABLSymbol {
        selectedWord = ('' || selectedWord).toLowerCase();
        let location: vscode.Location;
        if ((words.length === 1) || ((words.length > 0) && (words[0].toLowerCase() === selectedWord))) {
            const word = words[0].toLowerCase();

            // temp-table
            const tt = this._temps.find((item) => item.label.toLowerCase() === word);
            if (!isNullOrUndefined(tt)) {
                location = new vscode.Location(this.document.uri, new vscode.Position(tt.line, 0));
                return { type: SYMBOL_TYPE.TEMPTABLE, value: tt, location };
            }

            // method
            let mt = this._methods.find((item) => item.name.toLowerCase() === word);
            if (!isNullOrUndefined(mt)) {
                location = new vscode.Location(this.document.uri, new vscode.Position(mt.lineAt, 0));
                return { type: SYMBOL_TYPE.METHOD, value: mt, location };
            }

            // local parameters / variables
            mt = this.getMethodInPosition(position);
            if (mt) {
                const lp = mt.params.find((item) => item.name.toLowerCase() === word);
                if (!isNullOrUndefined(lp)) {
                    location = new vscode.Location(this.document.uri, new vscode.Position(lp.line, 0));
                    return { type: SYMBOL_TYPE.LOCAL_PARAM, value: lp, origin: mt, location };
                }
                const lv = mt.localVars.find((item) => item.name.toLowerCase() === word);
                if (!isNullOrUndefined(lv)) {
                    location = new vscode.Location(this.document.uri, new vscode.Position(lv.line, 0));
                    return { type: SYMBOL_TYPE.LOCAL_VAR, value: lv, origin: mt, location };
                }
            }

            // variables
            const gv = this._vars.find((item) => item.name.toLowerCase() === word);
            if (!isNullOrUndefined(gv)) {
                location = new vscode.Location(this.document.uri, new vscode.Position(gv.line, 0));
                return { type: SYMBOL_TYPE.GLOBAL_VAR, value: gv, location };
            }
        } else if (words.length > 1) {
            const word0 = words[0].toLowerCase();
            const word1 = words[1].toLowerCase();
            // temp-table
            const tt = this._temps.find((item) => item.label.toLowerCase() === word0);
            if (!isNullOrUndefined(tt)) {
                const fd = tt.fields.find((item) => item.name.toLowerCase() === word1);
                if (fd) {
                    location = new vscode.Location(this.document.uri, new vscode.Position(tt.line, 0));
                    return { type: SYMBOL_TYPE.TEMPTABLE_FIELD, value: fd, origin: tt, location };
                } else {
                    return;
                }
            }
        }

        // External documents
        if (deepSearch) {
            let extSym;
            this.externalDocument.forEach((external) => {
                if (isNullOrUndefined(extSym)) {
                    const extDoc = getDocumentController().getDocument(external);
                    if ((extDoc) && (extDoc.processed)) {
                        extSym = extDoc.searchSymbol(words, selectedWord, position, deepSearch);
                    }
                }
            });
            if (!isNullOrUndefined(extSym)) {
                return extSym;
            }
        }

        return;
    }

    private insertExternalDocument(doc: vscode.TextDocument) {
        this.externalDocument.push(doc);
        this.refreshExternalReferences(doc);
    }

    private refreshIncludes(sourceCode: SourceCode) {
        this._includes = getAllIncludes(sourceCode);
        this._includes.forEach((item) => {
            vscode.workspace.workspaceFolders.forEach((folder) => {
                const uri = folder.uri.with({ path: [folder.uri.path, item.name].join('/') });
                if (fs.existsSync(uri.fsPath)) {
                    item.fsPath = uri.fsPath;
                    if (!this.externalDocument.find((i) => i.uri.fsPath === uri.fsPath)) {
                        vscode.workspace.openTextDocument(uri).then((doc) => this.insertExternalDocument(doc));
                    }
                }
            });
        });
    }

    private refreshMethods(sourceCode: SourceCode) {
        this._methods = getAllMethods(sourceCode);
        this.resolveMethodConflicts();
    }

    private resolveMethodConflicts() {
        // adjust method start/end lines (missing "procedure" on "end [procedure]")
        let _prevMethod: ABLMethod;
        this._methods.forEach((method) => {
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
        this._methods.forEach((item) => {
            const range: vscode.Range = new vscode.Range(new vscode.Position(item.lineAt, 0), new vscode.Position(item.lineEnd, 0));
            const sym = new vscode.SymbolInformation(item.name, vscode.SymbolKind.Function, range, this._document.uri, SYMBOL_TYPE.METHOD);
            this._symbols.push(sym);
        });
    }

    private refreshVariables(sourceCode: SourceCode) {
        this._vars = [];
        const _vars = [].concat(getAllVariables(sourceCode)).concat(getAllBuffers(sourceCode));

        if (!isNullOrUndefined(_vars) && !isNullOrUndefined(this._methods)) {
            _vars.forEach((item) => {
                const method = this._methods.find((m) => (m.lineAt <= item.line && m.lineEnd >= item.line));
                if (method) {
                    method.localVars.push(item);
                } else {
                    this._vars.push(item);
                }
            });
        }
    }

    private refreshParameters(sourceCode: SourceCode) {
        const _params = getAllParameters(sourceCode);
        _params.forEach((item) => {
            const method = this._methods.find((m) => (m.lineAt <= item.line && m.lineEnd >= item.line));
            if (method) {
                method.params.push(item);
            }
        });
    }

    private refreshTempTables(sourceCode: SourceCode) {
        this._temps = getAllTempTables(sourceCode);
        // reference to db tables
        this._temps.filter((item) => !isNullOrUndefined(item.referenceTable)).forEach((item) => {
            const tb = getTableCollection().items.find((tn) => tn.label.toString().toLowerCase() === item.referenceTable.toLowerCase());
            // tslint:disable-next-line:no-string-literal
            if ((!isNullOrUndefined(tb)) && (!isNullOrUndefined(tb['fields']))) {
                // tslint:disable-next-line:no-string-literal
                item.referenceFields = [...tb['fields']];
                utils.updateTableCompletionList(item);
            }
        });
    }

}

export class ABLDocumentController {

    private _documents: ABLDocument[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.initialize(context);
    }

    public dispose() {
        this._documents.forEach((d) => d.dispose());
    }

    public insertDocument(document: vscode.TextDocument) {
        if (document.languageId === ABL_MODE.language) {
            if (!this._documents[document.uri.fsPath]) {
                const ablDoc = new ABLDocument(document);
                this._documents[document.uri.fsPath] = ablDoc;

                vscode.workspace.onDidChangeTextDocument((event) => {
                    if (event.document.uri.fsPath === document.uri.fsPath) {
                        this.updateDocument(document, 5000);
                    }
                }, this, ablDoc.disposables);
            }
            return this.updateDocument(document);
        }

    }

    public removeDocument(document: vscode.TextDocument) {
        const d: ABLDocument = this._documents[document.uri.fsPath];
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
            const ablDoc: ABLDocument = this._documents[document.uri.fsPath];
            const invoke = this.invokeUpdateDocument;
            return new Promise<void>((resolve, reject) => {
                if (ablDoc) {
                    // cancel any pending update request
                    if (ablDoc.debounceController) {
                        clearTimeout(ablDoc.debounceController);
                    }
                    // if debouce time is set, creates a timer
                    if (debounceTime) {
                        ablDoc.debounceController = setTimeout(() => invoke(ablDoc), debounceTime);
                    } else {
                        invoke(ablDoc);
                    }
                    // always resolve, even if debounce time is set...
                    resolve();
                } else {
                    reject();
                }
            });
        }
    }

    public prepareToSaveDocument(document: vscode.TextDocument) {
        //
    }

    public getDocument(document: vscode.TextDocument): ABLDocument {
        return this._documents[document.uri.fsPath];
    }

    public broadcastDocumentChange(ablDoc: ABLDocument) {
        for (const item in this._documents) {
            if (item !== ablDoc.document.uri.fsPath) {
                this._documents[item].pushDocumentSignal(ablDoc);
            }
        }
    }

    private initialize(context: vscode.ExtensionContext) {
        context.subscriptions.push(this);

        // Current documents
        vscode.workspace.textDocuments.forEach((document) => {
            this.insertDocument(document);
        });

        // Document changes
        vscode.workspace.onDidSaveTextDocument((document) => { this.updateDocument(document); }, null, context.subscriptions);
        vscode.workspace.onDidOpenTextDocument((document) => { this.insertDocument(document); }, null, context.subscriptions);
        vscode.workspace.onDidCloseTextDocument((document) => { this.removeDocument(document); }, null, context.subscriptions);
        vscode.workspace.onWillSaveTextDocument((event) => { this.prepareToSaveDocument(event.document); }, null, context.subscriptions);
    }

    private invokeUpdateDocument(ablDoc: ABLDocument) {
        ablDoc.refreshDocument();
    }

}
