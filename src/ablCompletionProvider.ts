import * as vscode from 'vscode';
import { ParseDocument, ParseItem } from './ablParser';

export class AblCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(
        document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        Thenable<vscode.CompletionItem[]> {

        return new Promise((resolve, reject) => {
            try {
                // console.log('my Message: ' + position.line + ', ' + position.character );
                let isAProperty: boolean = false;
                const completionItemResult: vscode.CompletionItem[] = [];

                // Are we supposed to complete Object related stuff?
                const completeLine = document.lineAt(position.line);
                if (position.character > 0) { // ensure that we dont end up with a negative number
                    if (completeLine.text.substr(position.character - 1, 1) === '.') {
                        isAProperty = true;
                    }
                }

                // Parse the Document for possible values
                const symbols: ParseItem[] = ParseDocument(document, token);
                for (const symbol of symbols) {
                    let addToResult = true;
                    if (isAProperty) {
                        addToResult = symbol.type === vscode.SymbolKind.Constructor ||
                                        symbol.type === vscode.SymbolKind.Interface ||
                                        symbol.type === vscode.SymbolKind.Method ||
                                        symbol.type === vscode.SymbolKind.Namespace ||
                                        symbol.type === vscode.SymbolKind.Object ||
                                        symbol.type === vscode.SymbolKind.Property;
                    }
                    if (addToResult) {
                        completionItemResult.push(
                            new vscode.CompletionItem(symbol.name, ParseType2ItemKind(symbol.type)),
                        );
                    }
                }
                resolve(completionItemResult);
            } catch {
                reject();
            }
        });
    }
}

// Helper Function, convert ParseItem.Type to vscode.CompletionKind
function ParseType2ItemKind(pType: vscode.SymbolKind): vscode.CompletionItemKind {
    switch (pType) {
        case vscode.SymbolKind.Class:
            return vscode.CompletionItemKind.Class;
        case vscode.SymbolKind.Constructor:
            return vscode.CompletionItemKind.Constructor;
        case vscode.SymbolKind.Method:
            return vscode.CompletionItemKind.Method;
        case vscode.SymbolKind.Enum:
            return vscode.CompletionItemKind.Enum;
        case vscode.SymbolKind.Function:
            return vscode.CompletionItemKind.Function;
        case vscode.SymbolKind.Interface:
            return vscode.CompletionItemKind.Interface;
        // case vscode.SymbolKind.Key:
        case vscode.SymbolKind.Object:
            return vscode.CompletionItemKind.Variable;
        case vscode.SymbolKind.EnumMember:
            return vscode.CompletionItemKind.EnumMember;
        case vscode.SymbolKind.Event:
            return vscode.CompletionItemKind.Event;
        case vscode.SymbolKind.TypeParameter:
            return vscode.CompletionItemKind.TypeParameter;
        case vscode.SymbolKind.Property:
            return vscode.CompletionItemKind.Property;
        case vscode.SymbolKind.File:
            return vscode.CompletionItemKind.File;
        case vscode.SymbolKind.Variable:
            return vscode.CompletionItemKind.Variable;
        default:
            return vscode.CompletionItemKind.Text;
    }
}
