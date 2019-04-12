import * as vscode from 'vscode';
import { ParseDocument, ParseItem } from './ablParser';

export class AblCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(
        document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        Thenable<vscode.CompletionItem[]> {

        return new Promise((resolve, reject) => {
            try {
                // console.log('my Message: ' + position.line + ', ' + position.character );
                let IsProp: boolean = false;
                let CIResult: Array<vscode.CompletionItem> = [];

                // Are we supposed to complete Object related stuff?
                let CompleteLine = document.lineAt( position.line );
                if (position.character > 0) { // ensure that we dont end up with a negative number
                    if (CompleteLine.text.substr(position.character - 1, 1) === '.') {
                        IsProp = true;
                    }
                }

                // Parse the Document for possible values
                let Symbols: Array<ParseItem> = ParseDocument(document, token);
                SymbolLoop: for (let i = 0; i < Symbols.length; i++) {
                    if (IsProp) {
                        switch (Symbols[i].Type) {
                            case vscode.SymbolKind.Constructor:
                            case vscode.SymbolKind.Interface:
                            case vscode.SymbolKind.Method:
                            case vscode.SymbolKind.Namespace:
                            case vscode.SymbolKind.Object:
                            case vscode.SymbolKind.Property:
                                break;
                            default:
                                continue SymbolLoop;
                        }
                    }
                    CIResult.push( new vscode.CompletionItem(Symbols[i].Name, ParseType2ItemKind(Symbols[i].Type)) );
                }
                resolve(CIResult);
            } catch {
                reject();
            }
        });
    }
}

// Helper Function, convert ParseItem.Type to vscode.CompletionKind
function ParseType2ItemKind (pType: vscode.SymbolKind): vscode.CompletionItemKind {
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
        // case vscode.SymbolKind.Object:
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