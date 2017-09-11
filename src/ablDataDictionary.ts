import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');

import { getProwinBin, createProArgs } from './shared/ablPath';

export function openDataDictionary() {
    let cwd = vscode.workspace.rootPath;
    let env = process.env;
    let cmd = getProwinBin();

    // let args = createProArgs({
    //     startupProcedure: path.join(__dirname, '../abl-src/run.p'),
    //     param: '_dict.p'
    // });

    // TODO : reuse the openedgeconfig file and pf files defined
    let args = createProArgs({
        startupProcedure: '_dict.p'
    });
    cp.spawn(cmd, args, { env: env, cwd: cwd, detached: true });
}