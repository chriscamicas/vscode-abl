import { FileSystemWatcher, window, workspace } from 'vscode';
import * as jsonminify from 'jsonminify';
import { readFile } from 'fs';
import * as promisify from 'util.promisify';
import { OpenEdgeConfig, loadConfigFile, OPENEDGE_CONFIG_FILENAME } from './shared/openEdgeConfigFile';

const readFileAsync = promisify(readFile);

let openEdgeConfig: OpenEdgeConfig = {};
let watcher: FileSystemWatcher = null;

function findConfigFile() {
    return workspace.findFiles(OPENEDGE_CONFIG_FILENAME).then(uris => {
        if (uris.length > 0) {
            return uris[0].fsPath;
        }
        return null;
    });
}
function loadAndSetConfigFile(filename: string) {
    return loadConfigFile(filename).then((config) => {
        openEdgeConfig = config;
        return openEdgeConfig;
    });
}
export function getOpenEdgeConfig() {
    return new Promise<OpenEdgeConfig | null>((resolve, reject) => {
        if (openEdgeConfig === null) {
            watcher = workspace.createFileSystemWatcher('**/' + OPENEDGE_CONFIG_FILENAME);
            watcher.onDidChange(uri => loadAndSetConfigFile(uri.fsPath));
            watcher.onDidCreate(uri => loadAndSetConfigFile(uri.fsPath));
            watcher.onDidDelete(uri => loadAndSetConfigFile(uri.fsPath));

            findConfigFile().then(filename => loadAndSetConfigFile(filename)).then(config => resolve(config));
        } else {
            resolve(openEdgeConfig);
        }
    });
}