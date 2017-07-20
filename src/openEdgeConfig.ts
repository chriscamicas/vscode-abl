import { FileSystemWatcher, window, workspace } from 'vscode';
import * as jsonminify from 'jsonminify';
import { readFile } from 'fs';
import * as promisify from 'util.promisify';

const readFileAsync = promisify(readFile);

let openEdgeConfig: IOpenEdgeConfig = null;
let watcher: FileSystemWatcher = null;

export interface IOpenEdgeConfig {
    proPath?: string[];
    proPathMode?: 'append' | 'overwrite' | 'prepend';
    startupProcedure?: string;
    startupProcedureParam?: string;
    parameterFiles?: string[];
    ablUnit?: {};
}
function findConfigFile() {
    return workspace.findFiles('.openedge.json').then(uris => {
        if (uris.length > 0) {
            return uris[0].fsPath;
        }
        return null;
    });
}
function loadConfigFile(filename: string): Thenable<IOpenEdgeConfig> {
    if (!filename)
        return Promise.resolve({});
    return readFileAsync(filename, { encoding: 'utf8' }).then(text => {
        try {
            return JSON.parse(jsonminify(text));
        } catch (error) {
            window.showErrorMessage(`Error parsing filename}: ${error}`);
        }
        return {};
    });
}
function loadAndSetConfigFile(filename: string) {
    return loadConfigFile(filename).then((config) => {
        openEdgeConfig = config;
        return openEdgeConfig;
    });
}
export function getOpenEdgeConfig() {
    return new Promise<IOpenEdgeConfig | null>((resolve, reject) => {
        if (openEdgeConfig === null) {
            watcher = workspace.createFileSystemWatcher('**/.openedge.json');
            watcher.onDidChange(uri => loadAndSetConfigFile(uri.fsPath));
            watcher.onDidCreate(uri => loadAndSetConfigFile(uri.fsPath));
            watcher.onDidDelete(uri => loadAndSetConfigFile(uri.fsPath));

            findConfigFile().then(filename => loadAndSetConfigFile(filename)).then(config => resolve(config));
        } else {
            resolve(openEdgeConfig);
        }
    });
}
/*
{
    "proPath": [
        "",
        ""
    ],
    "proPathMode": "append", // overwrite, prepend
    "startupProcedure": "startup.p",
    "startupProcedureParam": "file.ini", // -param
    "parameterFiles": [ // -pf
        "default.pf"
    ],
    "ablUnit": {
        "options": {
            "output": {
                "location": "tests",
                "format": "xml"
            },
            "quitOnEnd": true,
            "writeLog": true,
            "showErrorMessage": true,
            "throwError": true
        },
        "tests": [
            {
                "test": "tests"
            }
        ]
    }
}
*/