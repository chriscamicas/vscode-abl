import * as vscode from 'vscode';

// instruction mode (default), comment mode. string mode
const PARSE_INSTRUCTION = 1;
const PARSE_COMMENT = 2;
const PARSE_STRING = 3;

export function ParseDocument (document: vscode.TextDocument, token: vscode.CancellationToken): Array<ParseItem> {
    // this stores all the symbols we create
    let symbols: Array<ParseItem> = [];

    let parse_status = new ParseStatus();

    // Parse the document, line by line
    for (let i = 0; i < document.lineCount; i++) {

        // Cancel this on Request
        if (token.isCancellationRequested) {
            throw 'Operation cancelllation';
        }

        // read a line, remove whitespaces
        let comp = document.lineAt(i).text.trim();

        // set parse status
        parse_status.parse_string = comp;
        parse_status.instruction_string = parse_status.instruction_string.trim();
        if (parse_status.instruction_string.length === 0) {
            parse_status.instruction_start_line = i;
        }

        // tilde bullshit (see abl documentation)
        // we need to evaluate all tildes before we do anything else
        let tildePos = 0;

        // stuff escaped by tilde
        parse_status.parse_string = parse_status.parse_string.replace('~\'', '\'\'');
        parse_status.parse_string = parse_status.parse_string.replace('~"', '""');
        parse_status.parse_string = parse_status.parse_string.replace('~\\', '\\');
        parse_status.parse_string = parse_status.parse_string.replace('~{', '{');
        // replace special chars with blank, we dont evaluate them anyway
        parse_status.parse_string = parse_status.parse_string.replace('~t', ' ');
        parse_status.parse_string = parse_status.parse_string.replace('~r', ' ');
        parse_status.parse_string = parse_status.parse_string.replace('~n', ' ');
        parse_status.parse_string = parse_status.parse_string.replace('~E', ' ');
        parse_status.parse_string = parse_status.parse_string.replace('~b', ' ');
        parse_status.parse_string = parse_status.parse_string.replace('~f', ' ');

        // check octal char
        tildeCheck: while (true) {
            tildePos = parse_status.parse_string.search(/~[0-3][0-7][0-7]/);
            // no tilde found
            if (tildePos < 0) {
                break tildeCheck;
            }
            let replaceMe = parse_status.parse_string.substr(tildePos, 4);
            parse_status.parse_string = parse_status.parse_string.replace(replaceMe, ' ');
        }

        // remove single tilde
        parse_status.parse_string = parse_status.parse_string.replace(/~(?!~)/, ' ');

        // double tilde for tilde
        parse_status.parse_string = parse_status.parse_string.replace('~~', '~');

        // If we are in comment mode, check for comment end
        if (parse_status.parse_mode === PARSE_COMMENT) {
            parse_status = parseForCommentEnd(parse_status);
        }

        // If we are in string mode, check for string end
        if (parse_status.parse_mode === PARSE_STRING) {
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
                if (first_char === '"' || first_char === '\'') {
                    // Enter String Mode
                    parse_status.parse_mode = PARSE_STRING;
                    parse_status.string_quote = first_char;
                    parse_status.parse_string = parse_status.parse_string.substr(mode_change + 1);
                    parse_status = parseForStringEnd(parse_status);
                } else {
                    let second_char = parse_status.parse_string.substr(mode_change + 1, 1);
                    if (second_char === '/') {
                        // Line Comment
                        parse_status.parse_string = '';
                    } else {
                        // Enter Comment mode
                        parse_status.parse_mode = PARSE_COMMENT;
                        parse_status.parse_string = parse_status.parse_string.substr(mode_change + 2);
                        parse_status = parseForCommentEnd(parse_status);
                    }
                }
            } else {
                break mcc;
            }
        }
        parse_status.instruction_string += parse_status.parse_string;

        /*
         * check for colon (start block) and dot (end of command)
         * must be followed by white-space or line-end otherwise its something else
         */
        let i_end = parse_status.instruction_string.search(/:(?=\s|$)|\.(?=\s|$)/);
        while (i_end >= 0) {
            let end_char = parse_status.instruction_string.substr(i_end, 1);
            comp = parse_status.instruction_string.substring(0, i_end).trim();
            parse_status.instruction_string = parse_status.instruction_string.substr(i_end + 1);

            let resultSymbol: ParseItem;
            if (end_char === ':') {
                // block parse
                resultSymbol = parseBlock(comp);
            } else {
                // command parse
                resultSymbol = parseInstruction(comp);
            }

            // found something, add the line number
            if (resultSymbol != null ) {
                resultSymbol.Line = parse_status.instruction_start_line;
                symbols.push(resultSymbol);
            }

            // check again for colon (start block) and dot (end of command)
            i_end = parse_status.instruction_string.search(/:(?=\s|$)|\.(?=\s|$)/);
        }
    }

    return symbols;
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
        this.parse_string = '';
        this.string_quote = '';
        this.instruction_string = '';
        this.instruction_start_line = 0;
    }
}

// Store Information about the Parsed Object
export class ParseItem {
    public Name: string;
    public Line: number;
    public Type: vscode.SymbolKind;

    constructor(pName: string, pType?: vscode.SymbolKind) {
        if (typeof pType === undefined ) {
            this.Type = vscode.SymbolKind.Object;
        } else {
            this.Type = pType;
        }
        this.Name = pName;
        this.Line = null;
    }
}

// Search for Comment End
function parseForCommentEnd (pStatus: ParseStatus): ParseStatus {
    // check start comment
    let comment_start = 0;
    comment: while (comment_start >= 0) {
        // check comment
        comment_start = pStatus.parse_string.search(/\/\*|\*\//);

        // line inside a comment, ignore
        if (comment_start === -1) {
            pStatus.parse_string = '';
            break comment;
        }

        // set new comment depth level
        let comment_type = pStatus.parse_string.substr(comment_start, 2);
        if (comment_type === '/*') {
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
function parseForStringEnd (pStatus: ParseStatus): ParseStatus {

    let end_quote = -1;
    if (pStatus.string_quote === '\'') {
        end_quote = pStatus.parse_string.search(/'/);
    } else {
        end_quote = pStatus.parse_string.search(/"/);
    }

    // End Quote found
    if (end_quote >= 0) {
        // DoubleQuote
        if (pStatus.parse_string.substr(end_quote + 1, 1) === pStatus.string_quote) {
            pStatus.parse_string = pStatus.parse_string.substr(end_quote + 2);
            return parseForStringEnd(pStatus);
        }
        pStatus.parse_string = pStatus.parse_string.substr(end_quote + 1);
        pStatus.string_quote = '';
        pStatus.parse_mode = PARSE_INSTRUCTION;
    } else {
        // line inside a string, ignore
        pStatus.parse_string = '';
    }

    return pStatus;
}

// create symbol for Block
function parseBlock (pBlock: string): ParseItem {
    // empty string, nothing to do
    if (pBlock.length === 0) {
        return null;
    }
    // last char is colon, we wont need that
    if (pBlock.substr(pBlock.length - 1, 1) === ':' ) {
        pBlock = pBlock.substr(0, pBlock.length - 1);
    }
    // split into words
    let words = pBlock.split(/\s+/);
    // no words, no work
    if (words.length === 0) {
        return null;
    }
    // is this a label or a block
    // ABL is case-insensitive, TS is not; make our life easier by coverting string to lowercase
    switch (words[0].toLowerCase()) {
        case 'case':
        case 'catch':
        case 'def':
        case 'define':
        case 'do':
        case 'else': // may precede a block
        case 'finally':
        case 'for':
        case 'get':
        case 'if': // if statements may precede a block
        case 'on': // on statements may precede a block
        case 'otherwise': // may precede a block
        case 'private':
        case 'protected':
        case 'public':
        case 'repeat':
        case 'set':
        case 'triggers':
        case 'when': // may precede a block
            // ignore those blocks
            return null;
        case 'class':
            return new ParseItem(words[1], vscode.SymbolKind.Class);
        case 'constructor':
            // check for keywords that may precede the name
            let iC = 1;
            let wC = words[1].toLowerCase();
            if (wC === 'private' || wC === 'public' || wC === 'protected' || wC === 'static') {
                iC++;
            }
            return new ParseItem(RemoveBracketFromName(words[iC]), vscode.SymbolKind.Constructor);
        case 'destructor':
            // check for keywords that may precede the name
            let iD = 1;
            let wD = words[1].toLowerCase();
            if (wD === 'public') {
                iD++;
            }
            // No Destructor Type in SymbolKind, return Method
            return new ParseItem(RemoveBracketFromName(words[iD]), vscode.SymbolKind.Method);
        case 'enum':
            return new ParseItem(words[1], vscode.SymbolKind.Enum);
        case 'function':
        case 'procedure':
            // No Procedure Type in SymbolKind, return Function
            return new ParseItem(words[1], vscode.SymbolKind.Function);
        case 'interface':
            return new ParseItem(words[1], vscode.SymbolKind.Interface);
        case 'method':
            // We want the Name of the Method, so check for various keywords
            let iM = 1;
            while (words[iM]) {
                let wM = words[iM].toLowerCase();
                if (wM === 'private' || wM === 'public' || wM === 'protected' || wM === 'static'
                    || wM === 'abstract' || wM === 'override' || wM === 'final') {
                    iM++;
                } else {
                    // iM should now be the return type, increase by one to get the name
                    iM++;
                    break;
                }
            }
            if (words[iM]) {
                return new ParseItem(RemoveBracketFromName(words[iM]), vscode.SymbolKind.Method);
            }
            return null;
        // must be a label
        default:
            return new ParseItem(words[0], vscode.SymbolKind.Key);

    }
}

// create symbol for instruction
function parseInstruction (pInstruction: string): ParseItem {
    // ABL is case-insensitive, TS is not; make our life easier by coverting string to lowercase
    if (pInstruction.substr(0, 3).toLowerCase().startsWith('def')) {
        let words = pInstruction.split(/\s+/);

        /*
         * Walk over all words of the instruction
         * certain keywords identify the type of definition (like parameter or variable)
         * this will be followed by the name
         */
        buffer: for (let i = 1; i < words.length; i++) {
            // ABL is case-insensitive, TS is not; make our life easier by coverting string to lowercase
            switch ( words[i].toLowerCase() ) {
                // reserverd words that might show up in a definition
                case 'new':
                case 'global':
                case 'shared':
                case 'private':
                case 'protected':
                case 'public':
                case 'static':
                case 'abstract':
                case 'override':
                case 'serializable':
                case 'non-serializable':
                case 'input':
                case 'output':
                case 'input-output':
                case 'return':
                    break;
                // mark these as objects unless something better comes along
                case 'buffer':
                case 'dataset':
                case 'data-source':
                case 'frame':
                case 'image':
                case 'menu':
                case 'query':
                case 'rectangle':
                case 'sub-menu':
                case 'temp-table':
                case 'work-table':
                case 'workfile':
                    i++;
                    if (words[i]) {
                        return new ParseItem(words[i], vscode.SymbolKind.Object);
                    }
                    break buffer;
                // Enumerations
                case 'enum':
                    i++;
                    if (words[i]) {
                        return new ParseItem(words[i], vscode.SymbolKind.EnumMember);
                    }
                    break buffer;
                // Events
                case 'event':
                    i++;
                    if (words[i]) {
                        return new ParseItem(words[i], vscode.SymbolKind.Event);
                    }
                    break buffer;
                // Parameter
                case 'parameter':
                    i++;
                    if (words[i]) {
                        return new ParseItem(words[i], vscode.SymbolKind.TypeParameter);
                    }
                    break buffer;
                // Property
                case 'property':
                    i++;
                    if (words[i]) {
                        return new ParseItem(words[i], vscode.SymbolKind.Property);
                    }
                    break buffer;
                // Stream
                case 'stream':
                    i++;
                    if (words[i]) {
                        return new ParseItem(words[i], vscode.SymbolKind.File);
                    }
                    break buffer;
                // Variable
                case 'var':
                case 'vari':
                case 'variab':
                case 'variabl':
                case 'variable':
                    i++;
                    if (words[i]) {
                        return new ParseItem(words[i], vscode.SymbolKind.Variable);
                    }
                    break buffer;
            }
        }
    }
    return null;
}

// Helper Function to Remove Brackets from names, Example: "Func(input)" -> "Func"
function RemoveBracketFromName(pName: string): string {
    let rName = pName.split('(', 1);
    return rName[0];
}