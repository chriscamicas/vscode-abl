import path = require('path');
import * as vscode from 'vscode';
import { getOpenEdgeConfig } from './ablConfig';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';
import { createProArgs, getProBin, setupEnvironmentVariables } from './shared/ablPath';

export function run(filename: string, ablConfig: vscode.WorkspaceConfiguration): Promise<any> {
    outputChannel.clear();
    let cwd = path.dirname(filename);

    return getOpenEdgeConfig().then((oeConfig) => {
        const cmd = getProBin(oeConfig.dlc);
        const env = setupEnvironmentVariables(process.env, oeConfig, vscode.workspace.rootPath);
        const args = createProArgs({
            batchMode: true,
            param: filename,
            parameterFiles: oeConfig.parameterFiles,
            startupProcedure: path.join(__dirname, '../../abl-src/run.p'),
            workspaceRoot: vscode.workspace.rootPath,
        });
        if (oeConfig.workingDirectory) {
            cwd = oeConfig.workingDirectory.replace('${workspaceRoot}', vscode.workspace.rootPath)
                    .replace('${workspaceFolder}', vscode.workspace.rootPath);
        }
        return create(cmd, args, { env, cwd }, outputChannel);
    });
}
