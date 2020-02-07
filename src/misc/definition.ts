import * as vscode from 'vscode';

export interface ICheckResult {
    file: string;
    line: number;
    column: number;
    msg: string;
    severity: string;
}

export class TextSelection {
    public word: string;
    public wordRange: vscode.Range;
    public statement: string;
    public statementRange: vscode.Range;
}

export enum SYMBOL_TYPE {
    METHOD = 'Method',
    INCLUDE = 'Include File',
    LOCAL_VAR = 'Local Variable',
    GLOBAL_VAR = 'Global Variable',
    LOCAL_PARAM = 'Local Parameter',
    GLOBAL_PARAM = 'Global Parameter',
    TEMPTABLE = 'Temp-table',
    TEMPTABLE_FIELD = 'Temp-table field',
}

export enum ABL_ASLIKE {
    AS = 'as',
    LIKE = 'like',
}

export enum ABL_PARAM_DIRECTION {
    IN = 'input',
    OUT = 'output',
    INOUT = 'input-output',
}

export interface ABLFieldDefinition {
    label: string;
    kind: vscode.CompletionItemKind;
    detail: string;
    dataType: string;
    mandatory: boolean;
    format: string;
}
export interface ABLIndexDefinition {
    label: string;
    kind: vscode.CompletionItemKind;
    detail: string;
    fields: ABLFieldDefinition[];
    unique: boolean;
    primary: boolean;
}
export class ABLTableDefinition {
    public filename: string;
    public label: string;
    public kind: vscode.CompletionItemKind;
    public detail: string;
    public pkList: string;
    public fields: ABLVariable[];
    public indexes: ABLIndexDefinition[];
    public completionFields: vscode.CompletionList;
    public completionIndexes: vscode.CompletionList;
    public completionAdditional: vscode.CompletionList;
    public completion: vscode.CompletionList;

    get allFields(): ABLVariable[] {
        return this.fields;
    }
}

export class ABLVariable {
    public name: string;
    public asLike: ABL_ASLIKE;
    public dataType: string;
    public line: number;
    public additional?: string;
}

export class ABLMethod {
    public name: string;
    public lineAt: number;
    public lineEnd: number;
    public params: ABLParameter[];
    public localVars: ABLVariable[];
    constructor() {
        this.params = [];
        this.localVars = [];
    }
}

export class ABLParameter extends ABLVariable {
    public direction: ABL_PARAM_DIRECTION;
}

export class ABLInclude {
    public name: string;
    public fsPath: string;
}

export class ABLTempTable extends ABLTableDefinition {
    public line: number;
    public referenceTable: string;
    public referenceFields: ABLVariable[];

    get allFields(): ABLVariable[] {
        if (this.referenceFields) {
            return [...this.referenceFields, ...this.fields];
        }
        return this.fields;
    }
}

export interface ABLSymbol {
    type: SYMBOL_TYPE;
    value: ABLTempTable | ABLVariable | ABLMethod | ABLParameter | ABLInclude;
    origin?: ABLTempTable | ABLMethod;
    location?: vscode.Location;
}
