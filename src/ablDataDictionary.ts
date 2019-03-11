import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');

import { getOpenEdgeConfig } from './ablConfig';
import { getProwinBin, createProArgs } from './shared/ablPath';

export function openDataDictionary() {
    let cwd = vscode.workspace.rootPath;
    let env = process.env;

    return getOpenEdgeConfig().then(oeConfig => {
        let cmd = getProwinBin(oeConfig.dlc);

        // TODO : reuse the openedgeconfig file and pf files defined
        let args = createProArgs({
            startupProcedure: '_dict.p',
            parameterFiles: oeConfig.parameterFiles
        });
        cp.spawn(cmd, args, { env: env, cwd: cwd, detached: true });
    });
}