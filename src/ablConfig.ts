import { FileSystemWatcher, window, workspace } from 'vscode';
import { loadConfigFile, OPENEDGE_CONFIG_FILENAME, OpenEdgeConfig } from './shared/openEdgeConfigFile';

let openEdgeConfig: OpenEdgeConfig = null;
let watcher: FileSystemWatcher = null;

export function findConfigFile() {
    return workspace.findFiles(OPENEDGE_CONFIG_FILENAME).then((uris) => {
        if (uris.length > 0) {
            return uris[0].fsPath;
        }
        return null;
    });
}
function loadAndSetConfigFile(filename: string) {
    if (filename === null) {
        return Promise.resolve({});
    }
    return loadConfigFile(filename).then((config) => {
        openEdgeConfig = config;
        return openEdgeConfig;
    });
}
export function getOpenEdgeConfig() {
    return new Promise<OpenEdgeConfig | null>((resolve, reject) => {
        if (openEdgeConfig === null) {
            watcher = workspace.createFileSystemWatcher('**/' + OPENEDGE_CONFIG_FILENAME);
            watcher.onDidChange((uri) => loadAndSetConfigFile(uri.fsPath));
            watcher.onDidCreate((uri) => loadAndSetConfigFile(uri.fsPath));
            watcher.onDidDelete((uri) => loadAndSetConfigFile(uri.fsPath));

            findConfigFile().then((filename) => loadAndSetConfigFile(filename)).then((config) => resolve(config));
        } else {
            resolve(openEdgeConfig);
        }
    });
}
