import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { ABL_MODE } from '../ablMode';
import { ABLParameter, SYMBOL_TYPE } from '../misc/definition';
import * as utils from '../misc/utils';
import { ABLDocumentController, getDocumentController } from '../parser/documentController';

export class ABLDefinitionProvider implements vscode.DefinitionProvider {
    private _ablDocumentController: ABLDocumentController;

    constructor(context: vscode.ExtensionContext) {
        this._ablDocumentController = getDocumentController();
        context.subscriptions.push(vscode.languages.registerDefinitionProvider(ABL_MODE.language, this));
    }

    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
        // go-to definition
        const selection = utils.getText(document, position);
        const doc = this._ablDocumentController.getDocument(document);
        if (!doc) {
            return;
        }
        if (!doc.processed) {
            return;
        }
        const split = selection.statement.split(/[\.\:\s\t]/);
        if (split.length === 0) {
            return;
        }
        const words = utils.cleanArray(split);
        if (words.length > 0) {
            const symbol = doc.searchSymbol([selection.word], selection.word, position, true);
            if (!isNullOrUndefined(symbol) && !isNullOrUndefined(symbol.location)) {
                // for local temp-table parameter, go-to temp-table definition when already in then parameter line
                if ((symbol.location.range.start.line === position.line) && (symbol.type === SYMBOL_TYPE.LOCAL_PARAM) && (symbol.value instanceof ABLParameter)) {
                    if (symbol.value.dataType === 'temp-table') {
                        const ttSym = doc.searchSymbol([symbol.value.name], symbol.value.name, null, true);
                        if (!isNullOrUndefined(ttSym) && !isNullOrUndefined(ttSym.location)) {
                            return Promise.resolve(ttSym.location);
                        }
                    }
                }
                return Promise.resolve(symbol.location);
            }
            // find includes
            const inc = doc.includes.find((item) => item.name.toLowerCase() === selection.statement);
            if (!isNullOrUndefined(inc)) {
                const extDoc = doc.externalDocument.find((item) => item.uri.fsPath.toLowerCase() === inc.fsPath.toLowerCase());
                if (!isNullOrUndefined(extDoc)) {
                    const location = new vscode.Location(extDoc.uri, new vscode.Position(0, 0));
                    return Promise.resolve(location);
                }
            }
        }
        return;
    }
}
