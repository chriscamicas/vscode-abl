// Document Symbol Provider for Language Server

import * as vscode from 'vscode';
import { ParseDocument, ParseItem } from './ablParser';

export class AblDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument, token: vscode.CancellationToken):
        Thenable<vscode.SymbolInformation[]> {

        return new Promise((resolve, reject) => {
            try {
                const symbolInformationResult: vscode.SymbolInformation[] = [];

                // Parse the Document for possible values
                const symbols: ParseItem[] = ParseDocument(document, token);
                for (let i = 0; i < symbols.length; i++) {
                    const pLoc = new vscode.Location(document.uri, document.lineAt(symbols[i].line).range);
                    const symbolInformation = new vscode.SymbolInformation(symbols[i].name, symbols[i].type, '', pLoc);
                    symbolInformationResult.push(symbolInformation);
                }
                resolve(symbolInformationResult);
            } catch {
                reject();
            }
        });
    }

}
