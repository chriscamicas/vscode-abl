import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');

import { getProwinBin, createProArgs, getProBin, setupEnvironmentVariables } from './shared/ablPath';
import { getOpenEdgeConfig, genericWorkspaceFolder } from './ablConfig';
import { create } from './OutputChannelProcess';
import { outputChannel } from './ablStatus';

function genericPath(): string {
    if (vscode.window.activeTextEditor) {
        let folder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        if (folder)
            return folder.uri.fsPath;
    }
    if (genericWorkspaceFolder)
        return genericWorkspaceFolder.uri.fsPath;
    return vscode.workspace.rootPath;
}

export function openDataDictionary() {
    let cwd = genericPath();
    let env = process.env;

    return getOpenEdgeConfig().then((oeConfig) => {
        const cmd = getProwinBin(oeConfig.dlc);

        // TODO : reuse the openedgeconfig file and pf files defined
        const args = createProArgs({
            parameterFiles: oeConfig.parameterFiles,
            startupProcedure: '_dict.p',
        });
        cp.spawn(cmd, args, { env, cwd, detached: true });
    });
}

export function readDataDictionary(ablConfig: vscode.WorkspaceConfiguration) {
    return getOpenEdgeConfig().then((oeConfig) => {
        let cmd = getProBin(oeConfig.dlc);
        let env = setupEnvironmentVariables(process.env, oeConfig, genericPath());
        let dbs = (oeConfig.dbDictionary ? oeConfig.dbDictionary.join(',') : '');
        let args = createProArgs({
            parameterFiles: oeConfig.parameterFiles,
            batchMode: true,
            startupProcedure: path.join(__dirname, '../../abl-src/dict-dump.p'),
            param: dbs,
            workspaceRoot: genericPath()
        });
        let cwd = genericPath();
        cwd = oeConfig.workingDirectory ? oeConfig.workingDirectory.replace('${workspaceRoot}', genericPath()).replace('${workspaceFolder}', genericPath()) : cwd;
        vscode.window.showInformationMessage('Updating data dicionary...');
        create(cmd, args, { env: env, cwd: cwd }, outputChannel).then((res) => {
            vscode.window.showInformationMessage('Data dicionary ' + (res.success ? 'updated' : 'failed'));
        });
    });
}
