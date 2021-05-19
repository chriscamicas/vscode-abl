import { isNumber } from 'util';
import * as vscode from 'vscode';
import { ABL_ASLIKE, ABL_PARAM_DIRECTION, ABLFieldDefinition, ABLInclude, ABLIndexDefinition, ABLMethod, ABLParameter, ABLTableDefinition, ABLTempTable, ABLVariable } from '../misc/definition';
import { removeInvalidRightChar, updateTableCompletionList } from '../misc/utils';
import { SourceCode } from './sourceParser';

export function getAllIncludes(sourceCode: SourceCode): ABLInclude[] {
    const result: ABLInclude[] = [];
    // let regexInclude: RegExp = new RegExp(/\{{1}([\w\d\-\\\/\.]+)(?:.|\n)*?\}{1}/gim);
    // 1 = include name
    const regexStart: RegExp = new RegExp(/\{{1}([\w\d\-\\\/\.]+)/gim);
    // 1 = include name
    const regexEnd: RegExp = new RegExp(/\}{1}/gim);
    //
    const text = sourceCode.sourceWithoutStrings;
    let resStart = regexStart.exec(text);
    let resEnd;
    while (resStart) {
        regexEnd.lastIndex = regexStart.lastIndex;
        resEnd = regexEnd.exec(text);
        if (resEnd) {
            const nm = resStart[1].trim().toLowerCase();
            // ignores {1} (include parameter) and {&ANYTHING} (global/scoped definition)
            if ((Number.isNaN(Number.parseInt(nm, 10))) && (!nm.startsWith('&')) && (!result.find((item) => item.name === nm))) {
                const v = new ABLInclude();
                v.name = nm;
                result.push(v);
            }
            resStart = regexStart.exec(text);
        } else {
            break;
        }
    }
    return result;
}

export function getAllVariables(sourceCode: SourceCode): ABLVariable[] {
    const result: ABLVariable[] = [];
    // let regexDefineVar: RegExp = new RegExp(/(?:def|define){1}(?:[\s\t\n]|new|shared)+(?:var|variable){1}(?:[\s\t\n]+)([\w\d\-]+)[\s\t\n]+(as|like){1}[\s\t\n]+([\w\d\-\.]+)/gim);
    const regexDefineVar: RegExp = new RegExp(/(?:def|define){1}(?:[\s\t\n]|new|shared)+(?:var|variable){1}(?:[\s\t\n]+)([\w\d\-]+)[\s\t\n]+(as|like){1}[\s\t\n]+([\w\d\-\.]+)([\n\s\t\w\d\-\'\"]*)\./gim);
    // 1 = var name
    // 2 = as | like
    // 3 = type | field like
    // 4 = details (extent, no-undo, initial, etc)
    const text = sourceCode.sourceWithoutStrings;
    let res = regexDefineVar.exec(text);
    while (res) {
        const v = new ABLVariable();
        try {
            v.name = res[1].trim();
            v.asLike = res[2].trim() as ABL_ASLIKE;
            v.dataType = removeInvalidRightChar(res[3].trim()); // removeInvalidRightChar to remove special chars because is accepted in this capture group
            v.line = sourceCode.document.positionAt(res.index).line;
            v.additional = (res[4] || '').trim();
            result.push(v);
        // tslint:disable-next-line:no-empty
        } catch { } // suppress errors
        res = regexDefineVar.exec(text);
    }
    return result;
}

export function getAllBuffers(sourceCode: SourceCode): ABLVariable[] {
    const result: ABLVariable[] = [];
    const regexDefineBuffer: RegExp = new RegExp(/(?:def|define){1}(?:[\s\t\n]|new|shared)+(?:buffer){1}[\s\t\n]+([\w\d\-]+){1}[\s\t\n]+(?:for){1}[\s\t\n]+(temp-table[\s\t\n]+)*([\w\d\-\+]*)(?:\.[^\w\d\-\+])+/gim);
    // 1 = buffer name
    // 2 = undefined | temp-table
    // 3 = buffer value
    const text = sourceCode.sourceWithoutStrings;
    let res = regexDefineBuffer.exec(text);
    while (res) {
        const v = new ABLVariable();
        try {
            v.name = res[1].trim();
            v.asLike = ABL_ASLIKE.AS;
            v.dataType = 'buffer';
            v.line = sourceCode.document.positionAt(res.index).line;
            v.additional = res[3];
            result.push(v);
        // tslint:disable-next-line:no-empty
        } catch { } // suppress errors
        res = regexDefineBuffer.exec(text);
    }
    return result;
}

export function getAllMethods(sourceCode: SourceCode): ABLMethod[] {
    const result: ABLMethod[] = [];
    // let regexMethod = new RegExp(/\b(proc|procedure|func|function){1}[\s\t\n]+([\w\d\-]+)(.*?)[\.\:]{1}(.|[\n\s])*?(?:end\s(proc|procedure|func|function)){1}\b/gim);
    // 1 = function | procedure
    // 2 = name
    // 3 = aditional details (returns xxx...)
    // 4 = code block (incomplete)

    const regexStart = new RegExp(/\b(proc|procedure|func|function|method|constructor){1}[\s\t\n]+([\w\d\-]+)((?:.|\n)*?)(?:[\.\:][^\w\d\-\+])/gim);
    // 1 = function | procedure
    // 2 = name
    // 3 = aditional details (returns xxx...)
    const regexEnd = new RegExp(/\b(?:end[\s\t]+(proc|procedure|func|function|method|constructor)){1}\b/gim);
    //
    const text = sourceCode.sourceWithoutStrings;
    let resStart = regexStart.exec(text);
    let resEnd;
    while (resStart) {
        regexEnd.lastIndex = regexStart.lastIndex;
        resEnd = regexEnd.exec(text);
        if (resEnd) {
            const m = new ABLMethod();
            try {
                m.name = resStart[2];
                if(resStart[1].toLowerCase() == 'method' || resStart[1].toLowerCase() == 'constructor')
                    m.name = resStart[3];
                m.lineAt = sourceCode.document.positionAt(resStart.index).line;
                m.lineEnd = sourceCode.document.positionAt(regexEnd.lastIndex).line;
                m.params = [];
                result.push(m);
            // tslint:disable-next-line:no-empty
            } catch { } // suppress errors
            resStart = regexStart.exec(text);
        } else {
            break;
        }
    }
    return result;
}

export function getAllParameters(sourceCode: SourceCode): ABLParameter[] {
    const result: ABLParameter[] = [];
    /* Primitive types */
    // let regexParams: RegExp = new RegExp(/\b(?:def|define){1}[\s\t\n]+([inputo\-]*){1}[\s\t\n]+(?:param|parameter){1}[\s\t\n]+([\w\d\-\.]*){1}[\s\t\n]+(as|like){1}[\s\t\n]+([\w\d\-\.]+)/gim);
    let regexParams: RegExp = new RegExp(/\b(?:def|define){1}[\s\t\n]+([inputo\-]*){1}[\s\t\n]+(?:param|parameter){1}[\s\t\n]+([\w\d\-\.]*){1}[\s\t\n]+(as|like){1}[\s\t\n]+([\w\d\-\.]+)([\n\s\t\w\d\-\'\"]*)\./gim);
    // 1 = input | output | input-output
    // 2 = name
    // 3 = as | like
    // 4 = type | field like
    // 5 = details
    const text = sourceCode.sourceWithoutStrings;
    let res = regexParams.exec(text);
    while (res) {
        const v = new ABLParameter();
        try {
            v.name = res[2].trim();
            v.asLike = res[3].trim() as ABL_ASLIKE;
            v.dataType = removeInvalidRightChar(res[4].trim()); // removeInvalidRightChar to remove special chars because is accepted in this capture group
            v.line = sourceCode.document.positionAt(res.index).line;
            if (res[1].toLowerCase() === 'input') {
                v.direction = ABL_PARAM_DIRECTION.IN;
            } else if (res[1].toLowerCase() === 'output') {
                v.direction = ABL_PARAM_DIRECTION.OUT;
 } else {
                v.direction = ABL_PARAM_DIRECTION.INOUT;
 }
            v.additional = (res[5] || '').trim();
            result.push(v);
        // tslint:disable-next-line:no-empty
        } catch { } // suppress errors
        res = regexParams.exec(text);
    }
    /* Temp-table */
    regexParams = new RegExp(/\b(?:def|define){1}[\s\t\n]+([inputo\-]*){1}[\s\t\n]+(?:param|parameter){1}[\s\t\n]+(?:table){1}[\s\t\n]+(?:for){1}[\s\t\n]+([\w\d\-\+]*)(?:\.[^\w\d\-\+]){1}/gim);
    // 1 = input | output | input-output
    // 2 = name
    res = regexParams.exec(text);
    while (res) {
        const v = new ABLParameter();
        try {
            v.name = res[2].trim();
            v.asLike = ABL_ASLIKE.AS;
            v.dataType = 'temp-table';
            v.line = sourceCode.document.positionAt(res.index).line;
            if (res[1].toLowerCase() === 'input') {
                v.direction = ABL_PARAM_DIRECTION.IN;
            } else if (res[1].toLowerCase() === 'output') {
                v.direction = ABL_PARAM_DIRECTION.OUT;
 } else {
                v.direction = ABL_PARAM_DIRECTION.INOUT;
 }
            result.push(v);
        } catch { } // suppress errors
        res = regexParams.exec(text);
    }
    /* Buffer */
    regexParams = new RegExp(/\b(?:def|define){1}[\s\t\n]+(?:param|parameter){1}[\s\t\n]+(?:buffer){1}[\s\t\n]+([\w\d\-]+){1}[\s\t\n]+(?:for){1}[\s\t\n]+(temp-table[\s\t\n]+)*([\w\d\-\+]*)(?:\.[^\w\d\-\+])+/gim);
    // 1 = name
    // 2 = undefined | temp-table
    // 3 = buffer reference
    res = regexParams.exec(text);
    while (res) {
        const v = new ABLParameter();
        try {
            v.name = res[1].trim();
            v.asLike = ABL_ASLIKE.AS;
            v.dataType = 'buffer';
            v.line = sourceCode.document.positionAt(res.index).line;
            v.direction = ABL_PARAM_DIRECTION.IN;
            v.additional = res[3];
            result.push(v);
        } catch { } // suppress errors
        res = regexParams.exec(text);
    }
    //
    return result.sort((v1, v2) => {
        return v1.line - v2.line;
    });
}

export function getAllTempTables(sourceCode: SourceCode): ABLTempTable[] {
    const result: ABLTempTable[] = [];
    // let regexTT: RegExp = new RegExp(/(?:def|define){1}(?:[\s\t\n]|new|global|shared)+(?:temp-table){1}[\s\t\n\r]+([\w\d\-]*)[\s\t\n\r]+([\w\W]*?)(?:\.(?!\w))/gim);
    const regexStart: RegExp = new RegExp(/\b(?:def|define){1}(?:[\s\t\n]|new|global|shared)+(?:temp-table){1}[\s\t\n\r]+([\w\d\-\+]*)[^\w\d\-\+]/gim);
    // 1 = name
    const regexEnd: RegExp = new RegExp(/\.[^\w\d\-\+]/gim);
    //
    const regexLike: RegExp = new RegExp(/\b(?:like){1}[\s\t\n]+([\w\d\-\+]+)[\s\t\n]*(?:\.[^\w\d\-\+]+|field|index|[\s\t\n\r])(?!field|index)/gim);
    // 1 = temp-table like
    const text = sourceCode.sourceWithoutStrings;
    let innerText;
    let resStart = regexStart.exec(text);
    let resEnd;
    let resLike;
    while (resStart) {
        regexEnd.lastIndex = regexStart.lastIndex;
        resEnd = regexEnd.exec(text);
        if (resEnd) {
            innerText = text.substring(regexStart.lastIndex, resEnd.index);
            const v = new ABLTempTable();
            try {
                regexLike.lastIndex = regexStart.lastIndex;
                resLike = regexLike.exec(text);
                if ((resLike) && (resLike.index <= regexEnd.lastIndex) && (resLike.index >= regexStart.lastIndex)) {
                    v.referenceTable = resLike[1];
                }

                v.label = resStart[1];
                v.kind = vscode.CompletionItemKind.Struct;
                v.detail = '';
                v.fields = getTempTableFields(innerText, sourceCode);
                v.indexes = getTempTableIndexes(innerText);
                v.line = sourceCode.document.positionAt(resStart.index).line;
                updateTableCompletionList(v);
                result.push(v);
            } catch { } // suppress errors
            resStart = regexStart.exec(text);
        } else {
            break;
        }
    }
    return result;
}

function getTempTableFields(text: string, sourceCode: SourceCode): ABLVariable[] {
    const result: ABLVariable[] = [];
    const regexDefineField: RegExp = new RegExp(/(?:field){1}(?:[\s\t\n]+)([\w\d\-]+)[\s\t\n]+(as|like){1}[\s\t\n]+([\w\d\-\.]+)/gim);
    // 1 = var name
    // 2 = as | like
    // 3 = type | field like
    let res = regexDefineField.exec(text);
    while (res) {
        const v: ABLVariable = new ABLVariable();
        try {
            v.name = res[1].trim();
            v.asLike = res[2].trim() as ABL_ASLIKE;
            v.dataType = removeInvalidRightChar(res[3].trim()); // removeInvalidRightChar to remove special chars because is accepted in this capture group
            v.line = sourceCode.document.positionAt(res.index).line;
            result.push(v);
        } catch { } // suppress errors
        res = regexDefineField.exec(text);
    }
    return result;
}

function getTempTableIndexes(text: string): ABLIndexDefinition[] {
    return [];
}
