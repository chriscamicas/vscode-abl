// tslint:disable: object-literal-sort-keys
import { execSync } from 'child_process';
import * as fs from 'fs';
import { dirname, isAbsolute, join } from 'path';
import * as vscode from 'vscode';

export class AblDebugConfigurationProvider implements vscode.DebugConfigurationProvider {

    /**
     * Returns an initial debug configuration based on contextual information, e.g. package.json or folder.
     * @param folder
     * @param token
     */
    public provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration[]> {

        return [
            {
                name: 'Launch',
                type: 'abl',
                request: 'launch',
                program: '${file}',
            }, {
                name: 'Attach',
                type: 'abl',
                request: 'attach',
                port: 3099,
                address: '127.0.0.1',
                localRoot: '${workspaceFolder}',
            },
        ];
    }

    public resolveDebugConfiguration?(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.DebugConfiguration {
        if (!debugConfiguration || !debugConfiguration.request) { // if 'request' is missing interpret this as a missing launch.json
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'abl') {
                return;
            }

            return {
                name: 'Launch',
                type: 'abl',
                request: 'launch',
                program: '${file}',
            };
        }
        return debugConfiguration;
    }
}
