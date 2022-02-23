import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';
import { createProArgs, setupEnvironmentVariables } from './shared/ablPath';

function genericPath(): string {
    if (vscode.window.activeTextEditor) {
        const folder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        if (folder) {
            return folder.uri.fsPath;
        }
    }
    /* if (genericWorkspaceFolder) {
        return genericWorkspaceFolder.uri.fsPath;
    } */
    return vscode.workspace.rootPath;
}

export function openDataDictionary(project: OpenEdgeProjectConfig) {
    const cwd = genericPath();
    const env = process.env;

    const cmd = project.getExecutable(true)
    // TODO : reuse the openedgeconfig file and pf files defined
    const args = createProArgs({
        parameterFiles: project.parameterFiles,
        startupProcedure: '_dict.p',
    });
    cp.spawn(cmd, args, { env, cwd, detached: true });
}

export function readDataDictionary(oeConfig: OpenEdgeProjectConfig) {
    const cmd = oeConfig.getExecutable()
    const env = setupEnvironmentVariables(process.env, oeConfig, genericPath());
    const dbs = oeConfig.dbDictionary.join(',');
    const args = createProArgs({
        batchMode: true,
        param: dbs,
        parameterFiles: oeConfig.parameterFiles,
        startupProcedure: path.join(__dirname, '../abl-src/dict-dump.p'),
        workspaceRoot: genericPath(),
    });
    let cwd = oeConfig.rootDir
    vscode.window.showInformationMessage('Updating data dictionary...');
    create(cmd, args, { env: env, cwd: cwd }, outputChannel).then((res) => {
        vscode.window.showInformationMessage('Data dictionary ' + (res.success ? 'updated' : 'failed'));
    });
}
