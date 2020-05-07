import cp = require('child_process');
import path = require('path');
import * as vscode from 'vscode';

import { genericWorkspaceFolder, getOpenEdgeConfig } from './ablConfig';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';
import { createProArgs, getProBin, getProwinBin, setupEnvironmentVariables } from './shared/ablPath';

function genericPath(): string {
    if (vscode.window.activeTextEditor) {
        const folder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        if (folder) {
            return folder.uri.fsPath;
        }
    }
    if (genericWorkspaceFolder) {
        return genericWorkspaceFolder.uri.fsPath;
    }
    return vscode.workspace.rootPath;
}

export function openDataDictionary() {
    const cwd = genericPath();
    const env = process.env;

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
        const cmd = getProBin(oeConfig.dlc);
        const env = setupEnvironmentVariables(process.env, oeConfig, genericPath());
        const dbs = (oeConfig.dbDictionary ? oeConfig.dbDictionary.join(',') : '');
        const args = createProArgs({
            batchMode: true,
            param: dbs,
            parameterFiles: oeConfig.parameterFiles,
            startupProcedure: path.join(__dirname, '../../abl-src/dict-dump.p'),
            workspaceRoot: genericPath(),
        });
        let cwd = genericPath();
        cwd = oeConfig.workingDirectory ? oeConfig.workingDirectory.replace('${workspaceRoot}', genericPath()).replace('${workspaceFolder}', genericPath()) : cwd;
        vscode.window.showInformationMessage('Updating data dictionary...');
        create(cmd, args, { env: env, cwd: cwd }, outputChannel).then((res) => {
            vscode.window.showInformationMessage('Data dictionary ' + (res.success ? 'updated' : 'failed'));
        });
    });
}
