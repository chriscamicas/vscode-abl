// Document Symbol Provider for Language Server

import * as vscode from 'vscode';
import { ParseDocument, ParseItem } from './ablParser';

export class AblDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument, token: vscode.CancellationToken):
        Thenable<vscode.SymbolInformation[]> {

        return new Promise((resolve, reject) => {
            try {
                let SResult: Array<vscode.SymbolInformation> = [];

                // Parse the Document for possible values
                let Symbols: Array<ParseItem> = ParseDocument(document, token);
                for (let i = 0; i < Symbols.length; i++) {
                    let pLoc = new vscode.Location(document.uri, document.lineAt(Symbols[i].Line).range);
                    SResult.push( new vscode.SymbolInformation(Symbols[i].Name, Symbols[i].Type, '', pLoc) );
                }
                resolve(SResult);
            } catch {
                reject();
            }
        });
    }

}
