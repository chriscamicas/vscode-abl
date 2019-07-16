import { access } from 'fs';
import * as promisify from 'util.promisify';
import * as vscode from 'vscode';
import { findConfigFile, getOpenEdgeConfig } from './ablConfig';
import { getBinPath } from './shared/ablPath';

const accessAsync = promisify(access);

export async function checkOpenEdgeConfigFile() {

    // Do we have a .openedge.json config file
    const oeConfig = await findConfigFile();
    if (!oeConfig) {
        throw new Error('.openedge.json file is missing using default value');
    }
}

export async function checkProgressBinary() {
    // Do we have a .openedge.json config file
    const oeConfig = await getOpenEdgeConfig();
    // Can we find the progres binary
    let cmd = getBinPath('_progres.exe', oeConfig.dlc);
    // try to access the file (throw an Error)
    try {
        await accessAsync(cmd);
    } catch (e) {
        cmd = getBinPath('_progres', oeConfig.dlc);
        await accessAsync(cmd);
    }
}
