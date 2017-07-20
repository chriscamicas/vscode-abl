import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');

import { getProwinBin, prepareProArguments } from './ablPath';

export function openDataDictionary() {
    let cwd = vscode.workspace.rootPath;
    let env = process.env;
    let cmd = getProwinBin();

    return prepareProArguments('_dict.p', '', false).then(args => {
        cp.spawn(cmd, args, { env: env, cwd: cwd, detached: true });
    });
}