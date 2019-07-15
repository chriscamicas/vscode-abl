export enum AblDebugKind {
    Invalid = 0,
    Variable,
    Buffer,
    TempTable,
    DataSet,
    Parameter,
    BaseClass,
    Class,
    Array,
}

export interface DebugVariable {
    name: string;
    type: string;
    kind: AblDebugKind;
    value: string;
    children: DebugVariable[];
    parentReference?: number;
    // unreadable: string;
}

const primitiveTypes = [
    'BLOB',
    'CHARACTER',
    'CLOB',
    'COM-HANDLE',
    'DATE',
    'DATETIME',
    'DATETIME-TZ',
    'DECIMAL',
    'HANDLE',
    'INT64',
    'INTEGER',
    'LOGICAL',
    'LONGCHAR',
    'MEMPTR',
    'RAW',
    'RECID',
    'ROWID',
    'WIDGET-HANDLE',
];

export function isPrimitiveType(type: string) {
    return primitiveTypes.indexOf(type) !== -1;
}
