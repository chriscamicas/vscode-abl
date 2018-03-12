// Document Symbol Provider for Language Server

import * as vscode from 'vscode';

// instruction mode (default), comment mode. string mode
const PARSE_INSTRUCTION = 1;
const PARSE_COMMENT = 2;
const PARSE_STRING = 3;

export class AblDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument, token: vscode.CancellationToken):
        Thenable<vscode.SymbolInformation[]> {

            return new Promise((resolve, reject) => {
                var symbols = [];
    
                let parse_status = new ParseStatus();

                let parse_mode = PARSE_INSTRUCTION;
                let parse_depth = 0;

                let comment_depth = 0;

                for (var i = 0; i < document.lineCount; i++) {
                    let line = document.lineAt(i);
                    let comp = line.text.toLowerCase().trim();

                    parse_status.parse_string = comp;
                    parse_status.instruction_string = parse_status.instruction_string.trim();
                    if (parse_status.instruction_string.length == 0) {
                        parse_status.instruction_start_line = i;
                    }

                    // tilde bullshit (see abl documentation)
                    // need to evaluate all tildes before we do anything else

                    // already in comment mode
                    if (parse_status.parse_mode == PARSE_COMMENT) {
                        parse_status = parseForCommentEnd(parse_status);
                    }

                    // already in string mode
                    if (parse_status.parse_mode == PARSE_STRING) {
                        parse_status = parseForStringEnd(parse_status);
                    }

                    // check for mode_change
                    mcc: while (parse_status.parse_string.length > 0) {
                        let mode_change = parse_status.parse_string.search(/"|'|\/\/|\/\*/);
                        if (mode_change >= 0) {
                            let first_char = parse_status.parse_string.substr(mode_change, 1);
                            // remember parseable part
                            if (mode_change > 0) {
                                parse_status.instruction_string += parse_status.parse_string.substring(0, mode_change);
                            }
                            if (first_char == '"' || first_char == "'") {
                                // Enter String Mode
                                parse_status.parse_mode = PARSE_STRING;
                                parse_status.string_quote = first_char;
                                parse_status.parse_string = parse_status.parse_string.substr(mode_change + 1);
                                parse_status = parseForStringEnd(parse_status);
                            } else {
                                let second_char = parse_status.parse_string.substr(mode_change + 1, 1);
                                if (second_char == "/") {
                                    // Line Comment
                                    parse_status.parse_string = "";
                                } else {
                                    // Enter Comment mode
                                    parse_status.parse_mode = PARSE_COMMENT;
                                    parse_depth = 1;
                                    parse_status.parse_string = parse_status.parse_string.substr(mode_change + 2);
                                    parse_status = parseForCommentEnd(parse_status);
                                }
                            }
                        } else {
                            break mcc;
                        }
                    }
                    parse_status.instruction_string += parse_status.parse_string;

                    // check for colon (start block) and dot (end of command)
                    let i_end = parse_status.instruction_string.search(/:(?=\s|$)|\.(?=\s|$)/);
                    while (i_end >= 0) {
                        let end_char = parse_status.instruction_string.substr(i_end, 1);
                        comp = parse_status.instruction_string.substring(0, i_end).trim();
                        parse_status.instruction_string = parse_status.instruction_string.substr(i_end + 1);
                        
                        if (end_char == ':') {
                            // block parse

                        } else {
                            // command parse
                            let resultSymbol = parseInstruction(comp);
                            if (resultSymbol != null ) {
                                let pUri = document.uri;
                                let pLoc = new vscode.Location(document.uri, document.lineAt(parse_status.instruction_start_line).range);
                                let pSymbol = new vscode.SymbolInformation(resultSymbol.name, resultSymbol.kind, "", pLoc);
                                symbols.push(pSymbol);
                            }

                        }
                        // check again for colon (start block) and dot (end of command)
                        i_end = parse_status.instruction_string.search(/:(?=\s|$)|\.(?=\s|$)/);
                    }
                }
    
                resolve(symbols);
            });
    }

}

// store information about the parse state
class ParseStatus {
    public parse_mode: number;
    public parse_depth: number;
    public parse_string: string;

    public string_quote: string;

    public instruction_string: string;
    public instruction_start_line: number;

    constructor() {
        this.parse_mode = PARSE_INSTRUCTION;
        this.parse_depth = 0;
        this.parse_string = "";
        this.string_quote = "";
        this.instruction_string = "";
        this.instruction_start_line = 0;
    }
}

// Search for Comment End
function parseForCommentEnd (pStatus: ParseStatus) {
    // check start comment
    let comment_start = 0;
    comment: while (comment_start >= 0) {
        // check comment
        comment_start = pStatus.parse_string.search(/\/\*|\*\//);

        // line inside a comment, ignore
        if (comment_start == -1) {
            pStatus.parse_string = "";
            break comment;
        }

        // set new comment depth level
        let comment_type = pStatus.parse_string.substr(comment_start, 2);
        if (comment_type == "/*") {
            pStatus.parse_depth++;
        } else {
            pStatus.parse_depth--;
        }

        // adjust parse string
        pStatus.parse_string = pStatus.parse_string.substr(comment_start + 2);

        // comment is over, return
        if (pStatus.parse_depth <= 0) {
            pStatus.parse_mode = PARSE_INSTRUCTION;
            break comment;
        }
    }
    return pStatus;
}

// Search for String End
function parseForStringEnd (pStatus: ParseStatus) {

    let end_quote = -1;
    if (pStatus.string_quote == "'") {
        end_quote = pStatus.parse_string.search(/'/);
    } else {
        end_quote = pStatus.parse_string.search(/"/);
    }

    // End Quote found
    if (end_quote >= 0) {
        // DoubleQuote
        if (pStatus.parse_string.substr(end_quote + 1, 1) == pStatus.string_quote) {
            pStatus.parse_string = pStatus.parse_string.substr(end_quote + 2);
            return parseForStringEnd(pStatus);
        }
        pStatus.parse_string = pStatus.parse_string.substr(end_quote + 1);
        pStatus.string_quote = "";
        pStatus.parse_mode = PARSE_INSTRUCTION;
    } else {
        // line inside a string, ignore
        pStatus.parse_string = "";
    }

    return pStatus;
}

// create symbol for instruction
function parseInstruction (pInstruction) {
    if (pInstruction.startsWith("def")) {
        let words = pInstruction.split(/\s+/);

        /* 
         * Walk over all words of the instruction
         * certain keywords identify the type of definition (like parameter or variable)
         * this will be followed by the name
         */
        buffer: for (let i = 1; i < words.length; i++) {
            switch(words[i]) {
                // reserverd words that might show up in a definition
                case "new":
                case "global":
                case "shared":
                case "private":
                case "protected":
                case "public":
                case "static":
                case "abstract":
                case "override":
                case "serializable":
                case "non-serializable":
                case "input":
                case "output":
                case "input-output":
                case "return":
                    break;
                // mark these as objects unless something better comes along
                case "buffer":
                case "dataset":
                case "data-source":
                case "frame":
                case "image":
                case "menu":
                case "query":
                case "rectangle":
                case "sub-menu":
                case "temp-table":
                case "work-table":
                case "workfile":
                    i++;
                    if (words[i]) {
                        return {
                            name: words[i],
                            kind: vscode.SymbolKind.Object
                        };
                    }
                    break buffer;
                // Enumerations
                case "enum":
                    i++;
                    if (words[i]) {
                        return {
                            name: words[i],
                            kind: vscode.SymbolKind.EnumMember
                        };
                    }
                    break buffer;
                // Events
                case "event":
                    i++;
                    if (words[i]) {
                        return {
                            name: words[i],
                            kind: vscode.SymbolKind.Event
                        };
                    }
                    break buffer;
                // Parameter
                case "parameter":
                    i++;
                    if (words[i]) {
                        return {
                            name: words[i],
                            kind: vscode.SymbolKind.TypeParameter
                        };
                    }
                    break buffer;
                // Property
                case "property":
                    i++;
                    if (words[i]) {
                        return {
                            name: words[i],
                            kind: vscode.SymbolKind.Property
                        };
                    }
                    break buffer;
                // Stream
                case "stream":
                    i++;
                    if (words[i]) {
                        return {
                            name: words[i],
                            kind: vscode.SymbolKind.File
                        };
                    }
                    break buffer;
                // Variable
                case "var":
                case "vari":
                case "variab":
                case "variabl":
                case "variable":
                    i++;
                    if (words[i]) {
                        return {
                            name: words[i],
                            kind: vscode.SymbolKind.Variable
                        };
                    }
                    break buffer;
            }
        }
    }
    return null;
}