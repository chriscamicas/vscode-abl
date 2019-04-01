/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { join, isAbsolute, dirname } from 'path';
import * as fs from 'fs';

export class AblDebugConfigurationProvider implements vscode.DebugConfigurationProvider {

    /**
	 * Returns an initial debug configuration based on contextual information, e.g. package.json or folder.
	 */
    provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration[]> {

        return [
            {
                'name': 'Attach',
                'type': 'abl',
                'request': 'attach',
                'port': 3099,
                'address': '127.0.0.1',
                'localRoot': '${workspaceFolder}'
            }
        ];
    }


    public resolveDebugConfiguration?(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.DebugConfiguration {
        if (!debugConfiguration || !debugConfiguration.request) { // if 'request' is missing interpret this as a missing launch.json
            let activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'abl') {
                return;
            }

            return {
                'name': 'Attach',
                'type': 'abl',
                'request': 'attach',
                'port': 3099,
                'address': '127.0.0.1',
                'localRoot': '${workspaceFolder}'
            };
        }
        return debugConfiguration;
    }
}