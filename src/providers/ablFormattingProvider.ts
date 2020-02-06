import * as vscode from 'vscode';
import { workspace, WorkspaceConfiguration, FormattingOptions, DocumentFormattingEditProvider, TextDocument, CancellationToken, TextEdit, Range, Position, OnTypeFormattingEditProvider } from 'vscode';
import { ABL_MODE } from '../ablMode';
import { getOpenEdgeConfig } from '../ablConfig';

export class ABLFormattingProvider implements DocumentFormattingEditProvider, OnTypeFormattingEditProvider {

    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(ABL_MODE.language, this));
    }

    public provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): Thenable<TextEdit[]> {
        if (document.languageId !== ABL_MODE.language) { return; }
        return format(document, null, options);
    }

    public provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): Thenable<TextEdit[]> {
        //if (!onType) { return; }
        if (document.languageId !== ABL_MODE.language) { return; }
        return format(document, null, options);
    }
}

function format(document: TextDocument, range: Range, options: FormattingOptions): Thenable<TextEdit[]> {
    return new Promise(resolve => {
        // Create an empty list of changes
        let result: TextEdit[] = [];
        // Create a full document range
        if (range === null) {
            var start = new Position(0, 0);
            var end = new Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
            range = new Range(start, end);
        }
        // Format the document with the user specified settings
        //var newText: string = PatternFormat.document(document.getText(), options, document.languageId);
        SpacingFormat.document(document.getText(), options, document.languageId).then((newText) => {
            // Push the edit into the result array
            result.push(new TextEdit(range, newText));
            // Return the result of the change
            return resolve(result);
        });
    });
}

class PatternFormat {
    protected static spacePlaceholderStr = '__VSCODE__SPACE__PLACEHOLDER__';
    protected static depth: number = 0;
    protected static options: FormattingOptions;
    protected static source: string;
    protected static langId: string;
    protected static offset: number = 0;
    protected static prev: string = '';
    protected static next: string = '';
    protected static space;
    protected static newLine;
    protected static char;
    protected static last;
    protected static words: string[];

    // identifica os then/else que quebram a linha (comando nao está ao lado)
    // a linha de baixo deve ser agregada junto a linha atual
    private static regexThenWithBreak: RegExp = new RegExp(/(?:then|else){1}[\s\t]+(?![\w])/gi);

    public static document(source: string, formattingOptions: FormattingOptions, languageId: string): string {
        var config: WorkspaceConfiguration = workspace.getConfiguration('ablFormat');
        this.options = formattingOptions;
        this.source = source;
        this.langId = languageId;

        // Config base
        var space = config.get<any>('space');
        var newLine = config.get<any>('newLine');

        this.space = space;
        this.newLine = newLine;

        var spaceOther = space.language[languageId];

        var braceSpaceOpenBefore = space.brace.open.before;
        var braceNewLine = newLine.brace;

        var parenSpaceOpenBefore = space.parenthesis.open.before;
        var parenSpaceOpenAfter = space.parenthesis.open.after;
        var parenSpaceCloseBefore = space.parenthesis.close.before;

        var s: string = '';

        var ignoreSpace = false;
        var lastKeyword = '';

        var inString: boolean = false;
        var inComment: boolean = false;
        var commentType: CommentType = null;

        var stringChar = null;
        //var textWords = '';

        var line = '';
        var depthLineDiff = 0;

        console.log('antes', new Date());

        for (var i = 0; i < source.length; i++) {

            this.offset = i;
            this.char = source[i];
            this.next = source[i + 1];
            this.prev = source[i - 1];
            this.words = this.cleanArray(line.split(/[\s\(\)\[\];|'"\{\}\.\t\n]/));
            //this.words = this.cleanArray(s.split(/[\s\(\)\[\];|'"\{\}\.\t\n]/));
            //this.words = this.cleanArray(textWords.split(/[\s\(\)\[\];|'"\{\}\.\t\n]/));
            this.last = this.words[this.words.length - 1];

            let _char = this.char;
            // considera blocos do progress

            var spaces = this.getSpaces(_char);

            switch (this.char) {
                case '/':
                    // If we are not in a comment
                    if (!inComment && this.next == '/' || this.prev == '/') {
                        inComment = true;
                        commentType = CommentType.SingleLine;
                    } else if (!inComment && this.next == '*') {
                        inComment = true;
                        commentType = CommentType.MultiLine;
                    }
                    // If we are in a comment and it is multiline
                    else if (inComment && commentType == CommentType.MultiLine) {
                        inComment = false;
                        commentType = null;
                    }
                    //s += this.char;
                    line += this.char;
                    break;
                case '\n':
                    if (inComment && commentType == CommentType.SingleLine) {
                        inComment = false;
                        commentType = null;
                    }
                    //s += this.char;
                    s += this.indent(this.depth + depthLineDiff) + line.trim() + this.char;
                    line = '';
                    depthLineDiff = 0;
                    break;
                case '"':
                case '\'':
                    if (stringChar == this.char && inString) {
                        inString = false;
                        stringChar = null;
                    } else if (stringChar === null && !inString) {
                        inString = true;
                        stringChar = this.char;
                    }
                    //s += this.char;
                    line += this.char;
                    break;
                case ':':
                case '{':
                    if (inString || inComment) {
                        //s += this.char;
                        line += this.char;
                        break;
                    }
                    ignoreSpace = true;
                    if (!braceNewLine) {
                        let c = 0;
                        for (let j in braceSpaceOpenBefore) {
                            if (lastKeyword == j) {
                                //s = s.trim();
                                //s += this.spacePlaceholder(braceSpaceOpenBefore[j]);
                                //s = s.trim();
                                line = line.trim();
                                line += this.spacePlaceholder(braceSpaceOpenBefore[j]);
                                line = line.trim();
                                c++;
                                break;
                            }
                        }
                        if (c == 0) {
                            //s = s.trim();
                            //s += this.spacePlaceholder(braceSpaceOpenBefore.other);
                            //s = s.trim();
                            line = line.trim();
                            line += this.spacePlaceholder(braceSpaceOpenBefore.other);
                            line = line.trim();
                        }
                    } else {
                        //var lineStr: string = this.lineAtIndex(s, s.length).trim();
                        //if (lineStr != '') {
                        //	s += '\n' + this.indent(this.depth - 1);
                        //}
                        if (line.trim() != '') {
                            //s += '\n' + this.indent(this.depth - 1);
                            //line += '\n' + this.indent(this.depth - 1);
                            s += this.indent(this.depth + depthLineDiff) + line.trim() + '\n';
                            line = '';
                        }

                    }
                    this.depth++;
                    depthLineDiff = -1;
                    //s += this.char;
                    line += this.char;
                    break;
                case '}':
                    if (inString || inComment) {
                        //s += this.char;
                        line += this.char;
                        break;
                    }
                    ignoreSpace = true;
                    this.depth--;
                    //s += this.char;
                    line += this.char;
                    break;
                case '(':
                    if (inString || inComment) {
                        //s += this.char;
                        line += this.char;
                        break;
                    }
                    ignoreSpace = true;
                    for (let j in parenSpaceOpenBefore) {
                        if (this.last == j) {
                            //s = s.trim();
                            //s += this.spacePlaceholder(parenSpaceOpenBefore[j]);
                            //s = s.trim();
                            line = line.trim();
                            line += this.spacePlaceholder(parenSpaceOpenBefore[j]);
                            line = line.trim();
                            lastKeyword = this.last;
                            break;
                        }
                    }
                    //s += this.char;
                    line += this.char;
                    for (let j in parenSpaceOpenAfter) {
                        if (this.last == j) {
                            //s = s.trim();
                            //s += this.spacePlaceholder(parenSpaceOpenAfter[j]);
                            //s = s.trim();
                            line = line.trim();
                            line += this.spacePlaceholder(parenSpaceOpenAfter[j]);
                            line = line.trim();
                            break;
                        }
                    }
                    break;
                case ')':
                    if (inString || inComment) {
                        //s += this.char;
                        line += this.char;
                        break;
                    }
                    ignoreSpace = true;
                    for (let j in parenSpaceCloseBefore) {
                        if (lastKeyword == j) {
                            //s = s.trim();
                            //s += this.spacePlaceholder(parenSpaceCloseBefore[j]);
                            //s = s.trim();
                            line = line.trim();
                            line += this.spacePlaceholder(parenSpaceCloseBefore[j]);
                            line = line.trim();
                            break;
                        }
                    }
                    //s += this.char;
                    line += this.char;
                    break;
                case ',':
                case ':':
                    if (inString || inComment) {
                        //s += this.char;
                        line += this.char;
                        break;
                    }
                    ignoreSpace = true;
                    //s = this.formatItem(this.char, s, spaces);
                    line = this.formatItem(this.char, line, spaces);
                    break;
                case ';':
                    if (inString || inComment) {
                        //s += this.char;
                        line += this.char;
                        break;
                    }
                    ignoreSpace = true;
                    //s = this.formatItem(this.char, s, spaces);
                    line = this.formatItem(this.char, line, spaces);
                    break;
                case '?':
                case '>':
                case '<':
                case '=':
                case '!':
                case '&':
                case '|':
                case '+':
                case '-':
                case '*':
                case '/':
                case '%':
                    if (inString || inComment) {
                        //s += this.char;
                        line += this.char;
                        break;
                    }
                    ignoreSpace = true;
                    //s = this.formatOperator(this.char, s, spaces);
                    line = this.formatOperator(this.char, line, spaces);
                    break;
                default:
                    if (spaceOther && this.char in spaceOther) {
                        if (inString || inComment) {
                            //s += this.char;
                            line += this.char;
                            break;
                        }
                        ignoreSpace = true;
                        //s = this.formatItem(this.char, s, new Spaces((spaceOther[this.char].before || 0), (spaceOther[this.char].after || 0)));
                        line = this.formatItem(this.char, line, new Spaces((spaceOther[this.char].before || 0), (spaceOther[this.char].after || 0)));
                    } else {
                        if (inString || inComment) {
                            //s += this.char;
                            line += this.char;
                            break;
                        }
                        if (ignoreSpace && this.char == ' ') {
                            // Skip
                        } else {
                            //s += this.char;
                            line += this.char;
                            ignoreSpace = false;
                        }
                    }
                    break;
            }

            // ver se funciona...
			/*if (this.words.length > 1) {
				textWords = this.words[this.words.length-1] + s;
			}*/
        }

        console.log('depois', new Date());

        s += this.indent(this.depth) + line.trim();
        s = s.replace(new RegExp(PatternFormat.spacePlaceholderStr, 'g'), ' ');

        return s;
    }

    protected static languageOverride(char: string): Spaces {
        if (this.space.language[this.langId] && this.space.language[this.langId][char]) {
            return this.space.language[this.langId][char]
        }
        return null;
    }

    protected static getSpaces(char: string): Spaces {
        var spaces: Spaces = new Spaces();
        var config: WorkspaceConfiguration = workspace.getConfiguration('format');
        switch (char) {
            case '&':
                spaces.before = config.get<number>('space.and.before', 1);
                spaces.after = config.get<number>('space.and.after', 1);
                break;
            case '|':
                spaces.before = config.get<number>('space.or.before', 1);
                spaces.after = config.get<number>('space.or.after', 1);
                break;
            case ',':
                spaces.before = config.get<number>('space.comma.before', 1);
                spaces.after = config.get<number>('space.comma.after', 1);
                break;
            case '>':
                spaces.before = config.get<number>('space.greaterThan.before', 1);
                spaces.after = config.get<number>('space.greaterThan.after', 1);
                break;
            case '<':
                spaces.before = config.get<number>('space.lessThan.before', 1);
                spaces.after = config.get<number>('space.lessThan.after', 1);
                break;
            case '=':
                spaces.before = config.get<number>('space.equal.before', 1);
                spaces.after = config.get<number>('space.equal.after', 1);
                break;
            case '!':
                spaces.before = config.get<number>('space.not.before', 1);
                spaces.after = config.get<number>('space.not.after', 1);
                break;
            case '=':
                spaces.before = config.get<number>('space.question.before', 1);
                spaces.after = config.get<number>('space.question.after', 1);
                break;
            case '=':
                spaces.before = config.get<number>('space.colon.before', 1);
                spaces.after = config.get<number>('space.colon.after', 1);
                break;
            case '-':
                if (this.next == '-' || this.prev == '-' || this.next.match(/\d/)) {
                    spaces.before = config.get<number>('space.decrement.before', 0);
                    spaces.after = config.get<number>('space.decrement.after', 0);
                } else {
                    spaces.before = config.get<number>('space.subtract.before', 1);
                    spaces.after = config.get<number>('space.subtract.after', 1);
                }
                break;
            case '+':
                if (this.next == '+' || this.prev == '+') {
                    spaces.before = config.get<number>('space.increment.before', 0);
                    spaces.after = config.get<number>('space.increment.after', 0);
                } else {
                    spaces.before = config.get<number>('space.add.before', 1);
                    spaces.after = config.get<number>('space.add.after', 1);
                }
                break;
            case ';':
                spaces.before = config.get<number>('space.semicolon.before', 1);
                spaces.after = config.get<number>('space.semicolon.after', 1);
                break;
            case '*':
                spaces.before = config.get<number>('space.multiply.before', 1);
                spaces.after = config.get<number>('space.multiply.after', 1);
                break;
            case '/':
                spaces.before = config.get<number>('space.divide.before', 1);
                spaces.after = config.get<number>('space.divide.after', 1);
                break;
            case '%':
                spaces.before = config.get<number>('space.modulo.before', 1);
                spaces.after = config.get<number>('space.modulo.after', 1);
                break;
        }
        return spaces;
    }

    protected static formatItem(char: string, s: string, spaces: Spaces): string {
        var override = this.languageOverride(char);
        if (override) {
            spaces = override;
        }
        s = s.trim();
        s += PatternFormat.spacePlaceholderStr.repeat(spaces.before);
        s += char;
        s += PatternFormat.spacePlaceholderStr.repeat(spaces.after);
        return s.trim();
    }

    protected static formatOperator(char: string, s: string, spaces: Spaces): string {
        var override = this.languageOverride(char);
        if (override) {
            spaces = override;
        }
        s = s.trim();
        if (this.prev && this.notBefore(this.prev, '=', '!', '>', '<', '?', '%', '&', '|', '/')) {
            s += PatternFormat.spacePlaceholderStr.repeat(spaces.before);
        }
        s = s.trim();
        s += char;
        s = s.trim();
        if (this.next && this.notAfter(this.next, '=', '>', '<', '?', '%', '&', '|', '/')) {
            if (char != '?' || this.source.substr(this.offset, 4) != '?php') {
                s += PatternFormat.spacePlaceholderStr.repeat(spaces.after);
            }
        }
        return s.trim();
    }

    protected static notBefore(prev: string, ...char: string[]): boolean {
        for (var c in char) {
            if (char[c] == prev) {
                return false;
            }
        }
        return true;
    }

    protected static notAfter(next: string, ...char: string[]): boolean {
        for (var c in char) {
            if (char[c] == next) {
                return false;
            }
        }
        return true;
    }

    protected static cleanArray(arr: string[]): string[] {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] == '') {
                arr.splice(i, 1);
                i--;
            }
        }
        return arr;
    }

    protected static spacePlaceholder(length: number): string {
        return PatternFormat.spacePlaceholderStr.repeat(length);
    }

    protected static lineAtIndex(str: string, idx: number): string {
        var first = str.substring(0, idx);
        var last = str.substring(idx);

        var firstNewLine = first.lastIndexOf("\n");
        var secondNewLine = last.indexOf("\n");

        if (secondNewLine == -1) {
            secondNewLine = last.length;
        }

        return str.substring(firstNewLine + 1, idx + secondNewLine);
    }

    protected static indent(amount: number) {
        amount = amount < 0 ? 0 : amount;
        return PatternFormat.spacePlaceholderStr.repeat(amount * 4);
    }
}

class SpacingFormat {
    public static document(source: string, formattingOptions: FormattingOptions, languageId: string): Promise<string> {
        return getOpenEdgeConfig().then((oeConfig) => {
            // trim right
            if (oeConfig.format && oeConfig.format.trim == 'right') {
                let lines = source.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    lines[i] = lines[i].trimRight();
                }
                source = lines.join('\n');
            }

            return source;
        });
    }
}

enum CommentType { SingleLine, MultiLine }

class Spaces {
    public before: number = 0;
    public after: number = 0;

    public constructor(before: number = 0, after: number = 0) {
        this.before = before;
        this.after = after;
    }
}
