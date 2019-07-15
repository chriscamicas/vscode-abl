import cp = require('child_process');
import path = require('path');
import * as vscode from 'vscode';

import { getOpenEdgeConfig } from './ablConfig';
import { createProArgs, getProwinBin } from './shared/ablPath';

export function openDataDictionary() {
    const cwd = vscode.workspace.rootPath;
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
