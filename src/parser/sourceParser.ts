import * as vscode from "vscode";

enum CommentType { SingleLine, MultiLine }

export interface SourceCode {
    document: vscode.TextDocument;
    fullSource?: string;
    sourceWithoutComments?: string;
    sourceWithoutStrings?: string;
}

export class SourceParser {

    public getSourceCode(document: vscode.TextDocument): SourceCode {
        let source = document.getText();

        let code: SourceCode = { document: document, fullSource: source, sourceWithoutComments: '', sourceWithoutStrings: '' };

        let prevChar: string = '';
        let nextChar: string = '';
        let thisChar: string = '';

        let inString: boolean = false;
        let inComment: boolean = false;
        let commentType: CommentType = null;
        let stringChar: string = null;
        let charWOComments;
        let charWOStrings;
		
        for (let i = 0; i < source.length; i++) {
			
            thisChar = source[i];
            nextChar = source[i + 1];
			prevChar = source[i - 1];
            charWOComments = thisChar;
            charWOStrings = thisChar;
			
			switch (thisChar) {
                case '/':
                    if (!inString) {
                        // If we are not in a comment
                        if (!inComment && nextChar == '/' || prevChar == '/') {
                            inComment = true;
                            commentType = CommentType.SingleLine;
                            charWOComments = ' ';
                            charWOStrings = ' ';
                        } else if (!inComment && nextChar == '*') {
                            inComment = true;
                            commentType = CommentType.MultiLine;
                            charWOComments = ' ';
                            charWOStrings = ' ';
                        }
                        // If we are in a comment and it is multiline
                        else if (inComment && commentType == CommentType.MultiLine && prevChar == '*') {
                            inComment = false;
                            commentType = null;
                            charWOComments = ' ';
                            charWOStrings = ' ';
                        }
                        else if (inComment) {
                            charWOComments = ' ';
                            charWOStrings = ' ';
                        }
                    }
                    else {
                        charWOStrings = ' ';
                    }
					break;
                case '\n':
                    if (inComment && commentType == CommentType.SingleLine) {
                        inComment = false;
                        commentType = null;
                    }
					break;
                case '"':
                case '\'':
                    if (!inComment) {
                        charWOStrings = ' ';
                        if (stringChar == thisChar && inString && prevChar != '~') {
                            inString = false;
                            stringChar = null;
                        } else if (stringChar === null && !inString && !inComment) {
                            inString = true;
                            stringChar = thisChar;
                        }
                    }
                    else {
                        charWOComments = ' ';
                        charWOStrings = ' ';
                    }
					break;
                default:
                    if (inComment) {
                        charWOComments = ' ';
                        charWOStrings = ' ';
                    }
                    else if(inString) {
                        charWOStrings = ' ';
                    }
                    break;
            }
            code.sourceWithoutComments += charWOComments;
            code.sourceWithoutStrings += charWOStrings;
		}
		
		return code;
    }

}
