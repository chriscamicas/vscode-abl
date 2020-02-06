import * as vscode from "vscode";
import * as utils from '../misc/utils';
import { ABLDocumentController, getDocumentController } from "../parser/documentController";
import { ABL_MODE } from "../ablMode";
import { isNullOrUndefined } from "util";
import { SYMBOL_TYPE, ABLParameter } from "../misc/definition";

export class ABLDefinitionProvider implements vscode.DefinitionProvider {
	private _ablDocumentController: ABLDocumentController;

	constructor(context: vscode.ExtensionContext) {
		this._ablDocumentController = getDocumentController();
		context.subscriptions.push(vscode.languages.registerDefinitionProvider(ABL_MODE.language, this));
	}

	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
		// go-to definition
		let selection = utils.getText(document, position);
		let doc = this._ablDocumentController.getDocument(document);
		if (!doc)
			return;
		if (!doc.processed)
			return;
		let split = selection.statement.split(/[\.\:\s\t]/);
		if (split.length == 0)
			return;
		let words = utils.cleanArray(split);
		if (words.length > 0) {
			let symbol = doc.searchSymbol([selection.word], selection.word, position, true);
			if (!isNullOrUndefined(symbol) && !isNullOrUndefined(symbol.location)) {
				// for local temp-table parameter, go-to temp-table definition when already in then parameter line
				if ((symbol.location.range.start.line == position.line) && (symbol.type == SYMBOL_TYPE.LOCAL_PARAM) && (symbol.value instanceof ABLParameter)) {
					if (symbol.value.dataType == 'temp-table') {
						let ttSym = doc.searchSymbol([symbol.value.name], symbol.value.name, null, true);
						if (!isNullOrUndefined(ttSym) && !isNullOrUndefined(ttSym.location)) {
							return Promise.resolve(ttSym.location);
						}
					}
				}
				return Promise.resolve(symbol.location);
			}
			// find includes
			let inc = doc.includes.find(item => item.name.toLowerCase() == selection.statement);
			if (!isNullOrUndefined(inc)) {
				let extDoc = doc.externalDocument.find(item => item.uri.fsPath.toLowerCase() == inc.fsPath.toLowerCase());
				if (!isNullOrUndefined(extDoc)) {
					let location = new vscode.Location(extDoc.uri, new vscode.Position(0, 0));
					return Promise.resolve(location);
				}
			}
		}
		return;
	}
}
