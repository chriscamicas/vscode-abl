import * as fs from 'fs';
import * as util from 'util';
import * as vscode from 'vscode';
import { ABL_MODE } from '../ablMode';
import { ABLTableDefinition } from '../misc/definition';
import { getText, replaceSnippetTableName, updateTableCompletionList } from '../misc/utils';
import { ABLDocumentController, getDocumentController } from '../parser/documentController';

let watcher: vscode.FileSystemWatcher = null;
const _tableCollection: vscode.CompletionList = new vscode.CompletionList();
const readFileAsync = util.promisify(fs.readFile);

export class ABLCompletionItemProvider implements vscode.CompletionItemProvider {
    private _ablDocumentController: ABLDocumentController;

    constructor(context: vscode.ExtensionContext) {
        this._ablDocumentController = getDocumentController();
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider(ABL_MODE.language, this, '.'));
    }

    public provideCompletionItems(
        document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        Thenable<vscode.CompletionItem[]> {

        return new Promise((resolve, reject) => {
            try {
                const completionItemResult: vscode.CompletionItem[] = [];

                const doc = this._ablDocumentController.getDocument(document);
                const p = new vscode.Position(position.line, position.character - 1); // get the previous char to compare previous statement
                const textSelection = getText(document, p, true);
                const tsParts = textSelection.statement.split('.');

                if (tsParts.length === 2) {
                    // translate buffer var/param
                    let originalName = tsParts[0];
                    tsParts[0] = (doc.searchBuffer(tsParts[0], position) || tsParts[0]);
                    if (originalName === tsParts[0]) {
                        originalName = null;
                    }
                    //
                    let result = this.getCompletionFields(tsParts[0], originalName);
                    if ((result) && (result.length > 0)) {
                        resolve(result);
                        return;
                    }
                    result = doc.getCompletionTempTableFields(tsParts[0], originalName);
                    if ((result) && (result.length > 0)) {
                        resolve(result);
                        return;
                    }

                    // External Temp-tables
                    doc.externalDocument.forEach((external) => {
                        if ((!result) || (result.length === 0)) {
                            const extDoc = this._ablDocumentController.getDocument(external);
                            if ((extDoc) && (extDoc.processed)) {
                                result = extDoc.getCompletionTempTableFields(tsParts[0], originalName);
                            }
                        }
                    });
                    if ((result) && (result.length > 0)) {
                        resolve(result);
                        return;
                    }
                } else if (tsParts.length === 1) {
                    // Tables
                    const tb = _tableCollection.items;
                    // Symbols
                    const docSym = doc.getCompletionSymbols(position);
                    // External Symbols
                    let extSym: vscode.CompletionItem[] = [];
                    doc.externalDocument.forEach((external) => {
                        const extDoc = this._ablDocumentController.getDocument(external);
                        if ((extDoc) && (extDoc.processed)) {
                            extSym = [...extSym, ...extDoc.getCompletionSymbols(position)];
                        }
                    });
                    resolve([...tb, ...docSym, ...extSym]);
                    return;
                }
                resolve(completionItemResult);
            } catch {
                reject();
            }
        });
    }

    private getCompletionFields(prefix: string, replacement?: string): vscode.CompletionItem[] {
        // Tables
        const tb = _tableCollection.items.find((item) => item.label.toString().toLowerCase() === prefix);
        if (tb) {
            // tslint:disable-next-line:no-string-literal
            let result = tb['completion'].items;
            if (!util.isNullOrUndefined(replacement)) {
                result = replaceSnippetTableName(result, prefix, replacement);
            }
            return result;
        }
        return [];
    }
}

export function loadDumpFile(filename: string): Thenable<any> {
    if (!filename) {
        return Promise.resolve({});
    }
    return readFileAsync(filename, { encoding: 'utf8' }).then((text) => {
        return JSON.parse(text);
    });
}

export function getTableCollection() {
    return _tableCollection;
}

function findDumpFiles() {
    return vscode.workspace.findFiles('**/.openedge.db.*');
}

function loadAndSetDumpFile(filename: string) {
    unloadDumpFile(filename);
    return readFileAsync(filename, { encoding: 'utf8' }).then((text) => {
        const fileDataResult: ABLTableDefinition[] = JSON.parse(text);
        if (fileDataResult) {
            fileDataResult
                .map((tb) => {
                    const obj: ABLTableDefinition = new ABLTableDefinition();
                    Object.assign(obj, tb);
                    obj.filename = filename;
                    // tslint:disable-next-line:no-string-literal
                    obj.fields.map((fd) => fd.name = fd['label']);
                    updateTableCompletionList(obj);
                    return obj;
                })
                .forEach((tb) => {
                    _tableCollection.items.push(tb);
                });
        }
    });
}

function unloadDumpFile(filename: string) {
    // tslint:disable-next-line:no-string-literal
    _tableCollection.items = _tableCollection.items.filter((item) => item['filename'] !== filename);
}

export function watchDictDumpFiles() {
    return new Promise<void>((resolve, reject) => {
        watcher = vscode.workspace.createFileSystemWatcher('**/.openedge.db.*');
        watcher.onDidChange((uri) => loadAndSetDumpFile(uri.fsPath));
        watcher.onDidDelete((uri) => unloadDumpFile(uri.fsPath));
        findDumpFiles().then((filename) => { filename.forEach((f) => { loadAndSetDumpFile(f.fsPath); }); });
        resolve();
    });
}
