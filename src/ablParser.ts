import * as vscode from 'vscode';

// instruction mode (default), comment mode. string mode
const PARSE_INSTRUCTION = 1;
const PARSE_COMMENT = 2;
const PARSE_STRING = 3;

export function ParseDocument(document: vscode.TextDocument, token: vscode.CancellationToken): ParseItem[] {
    // this stores all the symbols we create
    const symbols: ParseItem[] = [];

    let parseStatus = new ParseStatus();

    // Parse the document, line by line
    for (let i = 0; i < document.lineCount; i++) {

        // Cancel this on Request
        if (token.isCancellationRequested) {
            throw new Error('Operation cancelllation');
        }

        /*
         * read a line, remove whitespaces
         * add a space at line-end so parser doesnt concat multiline stuff into one word
         * like ELSE<LINE-BREAK>DO -> ELSEDO
         */
        let comp = document.lineAt(i).text.trim() + ' ';

        // set parse status
        parseStatus.parseString = comp;
        // parse_status.instruction_string = parse_status.instruction_string.trim();
        if (parseStatus.instructionString.trim().length === 0) {
            parseStatus.instructionStartLine = i;
        }

        // tilde bullshit (see abl documentation)
        // we need to evaluate all tildes before we do anything else
        let tildePos = 0;

        // stuff escaped by tilde
        parseStatus.parseString = parseStatus.parseString.replace('~\'', '\'\'');
        parseStatus.parseString = parseStatus.parseString.replace('~"', '""');
        parseStatus.parseString = parseStatus.parseString.replace('~\\', '\\');
        parseStatus.parseString = parseStatus.parseString.replace('~{', '{');
        // replace special chars with blank, we dont evaluate them anyway
        parseStatus.parseString = parseStatus.parseString.replace('~t', ' ');
        parseStatus.parseString = parseStatus.parseString.replace('~r', ' ');
        parseStatus.parseString = parseStatus.parseString.replace('~n', ' ');
        parseStatus.parseString = parseStatus.parseString.replace('~E', ' ');
        parseStatus.parseString = parseStatus.parseString.replace('~b', ' ');
        parseStatus.parseString = parseStatus.parseString.replace('~f', ' ');

        // check octal char
        tildeCheck: while (true) {
            tildePos = parseStatus.parseString.search(/~[0-3][0-7][0-7]/);
            // no tilde found
            if (tildePos < 0) {
                break tildeCheck;
            }
            const replaceMe = parseStatus.parseString.substr(tildePos, 4);
            parseStatus.parseString = parseStatus.parseString.replace(replaceMe, ' ');
        }

        // remove single tilde
        parseStatus.parseString = parseStatus.parseString.replace(/~(?!~)/, ' ');

        // double tilde for tilde
        parseStatus.parseString = parseStatus.parseString.replace('~~', '~');

        // If we are in comment mode, check for comment end
        if (parseStatus.parseMode === PARSE_COMMENT) {
            parseStatus = parseForCommentEnd(parseStatus);
        }

        // If we are in string mode, check for string end
        if (parseStatus.parseMode === PARSE_STRING) {
            parseStatus = parseForStringEnd(parseStatus);
        }

        // check for mode_change
        mcc: while (parseStatus.parseString.length > 0) {
            const modeChange = parseStatus.parseString.search(/"|'|\/\/|\/\*/);
            if (modeChange >= 0) {
                const firstChar = parseStatus.parseString.substr(modeChange, 1);
                // remember parseable part
                if (modeChange > 0) {
                    parseStatus.instructionString += parseStatus.parseString.substring(0, modeChange);
                }
                if (firstChar === '"' || firstChar === '\'') {
                    // Enter String Mode
                    parseStatus.parseMode = PARSE_STRING;
                    parseStatus.stringQuote = firstChar;
                    parseStatus.parseString = parseStatus.parseString.substr(modeChange + 1);
                    parseStatus = parseForStringEnd(parseStatus);
                } else {
                    const secondChar = parseStatus.parseString.substr(modeChange + 1, 1);
                    if (secondChar === '/') {
                        // Line Comment
                        parseStatus.parseString = '';
                    } else {
                        // Enter Comment mode
                        parseStatus.parseMode = PARSE_COMMENT;
                        parseStatus.parseString = parseStatus.parseString.substr(modeChange + 2);
                        parseStatus = parseForCommentEnd(parseStatus);
                    }
                }
            } else {
                break mcc;
            }
        }
        parseStatus.instructionString += parseStatus.parseString;

        /*
         * check for colon (start block) and dot (end of command)
         * must be followed by white-space or line-end otherwise its something else
         */
        let iEnd = parseStatus.instructionString.search(/:(?=\s|$)|\.(?=\s|$)/);
        while (iEnd >= 0) {
            const endChar = parseStatus.instructionString.substr(iEnd, 1);
            comp = parseStatus.instructionString.substring(0, iEnd).trim();
            parseStatus.instructionString = parseStatus.instructionString.substr(iEnd + 1);

            let resultSymbol: ParseItem;
            if (endChar === ':') {
                // block parse
                resultSymbol = parseBlock(comp);
            } else {
                // command parse
                resultSymbol = parseInstruction(comp);
            }

            // found something, add the line number
            if (resultSymbol != null ) {
                resultSymbol.line = parseStatus.instructionStartLine;
                symbols.push(resultSymbol);
            }

            // check again for colon (start block) and dot (end of command)
            iEnd = parseStatus.instructionString.search(/:(?=\s|$)|\.(?=\s|$)/);
        }
    }

    return symbols;
}

// store information about the parse state
class ParseStatus {
    public parseMode: number;
    public parseDepth: number;
    public parseString: string;

    public stringQuote: string;

    public instructionString: string;
    public instructionStartLine: number;

    constructor() {
        this.parseMode = PARSE_INSTRUCTION;
        this.parseDepth = 0;
        this.parseString = '';
        this.stringQuote = '';
        this.instructionString = '';
        this.instructionStartLine = 0;
    }
}

// Store Information about the Parsed Object
// tslint:disable-next-line: max-classes-per-file
export class ParseItem {
    public name: string;
    public line: number;
    public type: vscode.SymbolKind;

    constructor(pName: string, pType?: vscode.SymbolKind) {
        if (typeof pType === 'undefined' ) {
            this.type = vscode.SymbolKind.Object;
        } else {
            this.type = pType;
        }
        this.name = pName;
        this.line = null;
    }
}

// Search for Comment End
function parseForCommentEnd(pStatus: ParseStatus): ParseStatus {
    // check start comment
    let commentStart = 0;
    comment: while (commentStart >= 0) {
        // check comment
        commentStart = pStatus.parseString.search(/\/\*|\*\//);

        // line inside a comment, ignore
        if (commentStart === -1) {
            pStatus.parseString = '';
            break comment;
        }

        // set new comment depth level
        const commentType = pStatus.parseString.substr(commentStart, 2);
        if (commentType === '/*') {
            pStatus.parseDepth++;
        } else {
            pStatus.parseDepth--;
        }

        // adjust parse string
        pStatus.parseString = pStatus.parseString.substr(commentStart + 2);

        // comment is over, return
        if (pStatus.parseDepth <= 0) {
            pStatus.parseMode = PARSE_INSTRUCTION;
            break comment;
        }
    }
    return pStatus;
}

// Search for String End
function parseForStringEnd(pStatus: ParseStatus): ParseStatus {

    let endQuote = -1;
    if (pStatus.stringQuote === '\'') {
        endQuote = pStatus.parseString.search(/'/);
    } else {
        endQuote = pStatus.parseString.search(/"/);
    }

    // End Quote found
    if (endQuote >= 0) {
        // DoubleQuote
        if (pStatus.parseString.substr(endQuote + 1, 1) === pStatus.stringQuote) {
            pStatus.parseString = pStatus.parseString.substr(endQuote + 2);
            return parseForStringEnd(pStatus);
        }
        pStatus.parseString = pStatus.parseString.substr(endQuote + 1);
        pStatus.stringQuote = '';
        pStatus.parseMode = PARSE_INSTRUCTION;
    } else {
        // line inside a string, ignore
        pStatus.parseString = '';
    }

    return pStatus;
}

// create symbol for Block
function parseBlock(pBlock: string): ParseItem {
    // empty string, nothing to do
    if (pBlock.length === 0) {
        return null;
    }
    // last char is colon, we wont need that
    if (pBlock.substr(pBlock.length - 1, 1) === ':' ) {
        pBlock = pBlock.substr(0, pBlock.length - 1);
    }
    // split into words
    const words = pBlock.split(/\s+/);
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
            const wC = words[1].toLowerCase();
            if (wC === 'private' || wC === 'public' || wC === 'protected' || wC === 'static') {
                iC++;
            }
            return new ParseItem(RemoveBracketFromName(words[iC]), vscode.SymbolKind.Constructor);
        case 'destructor':
            // check for keywords that may precede the name
            let iD = 1;
            const wD = words[1].toLowerCase();
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
                const wM = words[iM].toLowerCase();
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
function parseInstruction(pInstruction: string): ParseItem {
    // ABL is case-insensitive, TS is not; make our life easier by coverting string to lowercase
    if (pInstruction.substr(0, 3).toLowerCase().startsWith('def')) {
        const words = pInstruction.split(/\s+/);

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
    const rName = pName.split('(', 1);
    return rName[0];
}
