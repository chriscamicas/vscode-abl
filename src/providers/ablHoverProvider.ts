import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { CancellationToken, Hover, HoverProvider, Position, ProviderResult, TextDocument } from 'vscode';
import { ABL_MODE } from '../ablMode';
import { ABLFieldDefinition, ABLMethod, ABLParameter, ABLTableDefinition, ABLTempTable, ABLVariable, SYMBOL_TYPE } from '../misc/definition';
import * as utils from '../misc/utils';
import { ABLDocumentController, getDocumentController } from '../parser/documentController';
import { getTableCollection } from './ablCompletionProvider';

export class ABLHoverProvider implements HoverProvider {
    private _ablDocumentController: ABLDocumentController;

    constructor(context: vscode.ExtensionContext) {
        this._ablDocumentController = getDocumentController();
        context.subscriptions.push(vscode.languages.registerHoverProvider(ABL_MODE.language, this));
    }

    public provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover> {
        const doc = this._ablDocumentController.getDocument(document);
        const selection = utils.getText(document, position);
        if (!selection) {
            return;
        }
        const split = selection.statement.split(/[.:\s\t]/);
        if (split.length === 0) {
            return;
        }
        const words = utils.cleanArray(split);
        if (words.length > 0) {
            if ((words.length === 1) ||
                ((words.length > 1) && (selection.word === words[0]))) {
                // check for table collection
                const tb = getTableCollection().items.find((item) => item.label.toString().toLocaleLowerCase() === selection.word);
                if (tb) {
                    const tbd = tb as ABLTableDefinition;
                    return new Hover([selection.word, '*' + tb.detail + '*', 'PK: ' + tbd.pkList], selection.wordRange);
                }
            } else {
                // translate buffer var/param
                words[0] = (doc.searchBuffer(words[0], position) || words[0]);
                // check for table.field collection
                const tb = getTableCollection().items.find((item) => item.label === words[0]);
                if (tb) {
                    // tslint:disable-next-line:no-string-literal
                    const fdLst = tb['fields'] as ABLFieldDefinition[];
                    const fd = fdLst.find((item) => item.label === words[1]);
                    if (fd) {
                        return new Hover([selection.statement, '*' + fd.detail + '*', 'Type: ' + fd.dataType, 'Format: ' + fd.format], selection.statementRange);
                    } else {
                        return;
                    }
                }
            }
        }

        const symbol = doc.searchSymbol(words, selection.word, position, true);
        if (!isNullOrUndefined(symbol)) {
            if (symbol.type === SYMBOL_TYPE.TEMPTABLE) {
                const tt = (symbol.value) as ABLTempTable;
                return new Hover([selection.word, 'Temp-table *' + tt.label + '*'], selection.wordRange);
            }
            if (symbol.type === SYMBOL_TYPE.TEMPTABLE_FIELD) {
                const tt = (symbol.origin) as ABLTempTable;
                const tf = (symbol.value) as ABLVariable;
                return new Hover([selection.word, 'Field *' + tf.name + '*', 'from temp-table *' + tt.label + '*'], selection.wordRange);
            }
            if (symbol.type === SYMBOL_TYPE.METHOD) {
                const mt = (symbol.value) as ABLMethod;
                return new Hover([selection.word, 'Method *' + mt.name + '*'], selection.wordRange);
            }
            if (symbol.type === SYMBOL_TYPE.GLOBAL_VAR) {
                const gv = (symbol.value) as ABLVariable;
                if (gv.dataType === 'buffer') {
                    return new Hover([selection.word, 'Global buffer *' + gv.name + '*', 'for table *' + gv.additional + '*'], selection.wordRange);
                } else {
                    return new Hover([selection.word, 'Global variable *' + gv.name + '*'], selection.wordRange);
                }
            }
            if (symbol.type === SYMBOL_TYPE.LOCAL_PARAM) {
                const mt = (symbol.origin) as ABLMethod;
                const lp = (symbol.value) as ABLParameter;
                if (lp.dataType === 'temp-table') {
                    return new Hover([selection.word, 'Local temp-table parameter *' + lp.name + '*', 'from method *' + mt.name + '*'], selection.wordRange);
                } else if (lp.dataType === 'buffer') {
                    return new Hover([selection.word, 'Local buffer parameter *' + lp.name + '*', 'for table *' + lp.additional + '*', 'from method *' + mt.name + '*'], selection.wordRange);
 } else {
                    return new Hover([selection.word, 'Local parameter *' + lp.name + '*', 'from method *' + mt.name + '*'], selection.wordRange);
 }
            }
            if (symbol.type === SYMBOL_TYPE.LOCAL_VAR) {
                const mt = (symbol.origin) as ABLMethod;
                const lv = (symbol.value) as ABLVariable;
                if (lv.dataType === 'buffer') {
                    return new Hover([selection.word, 'Local buffer *' + lv.name + '*', 'for table *' + lv.additional + '*', 'from method *' + mt.name + '*'], selection.wordRange);
                } else {
                    return new Hover([selection.word, 'Local variable *' + lv.name + '*', 'from method *' + mt.name + '*'], selection.wordRange);
                }
            }
        }

        return;
    }
}
