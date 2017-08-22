import * as path from 'path';
import * as vscode from 'vscode';
import { getOpenEdgeConfig, IOpenEdgeConfig } from './openEdgeConfig';
import * as fs from 'fs';

export function getBinPath(toolName: string) {
    // TODO configuration DLC dans les pref
    return path.join(process.env['DLC'], 'bin', toolName);
}

export function getProBin() {
    return getBinPath('_progres');
}

export function getProwinBin() {
    let prowin = getBinPath('prowin');
    if (!fs.existsSync(prowin))
        prowin = getBinPath('prowin32');
    return prowin;
}

export function prepareProArguments(startupProcedure: string, param = '', batchMode = true): Promise<string[]> {
    return getOpenEdgeConfig().then(openEdgeConfig => {
        let pfArgs = [];
        if (openEdgeConfig && openEdgeConfig.parameterFiles) {
            // pfArgs = openEdgeConfig.parameterFiles.filter(pf => pf.trim().length > 0).map(pf => { return '-pf ' + pf; });
            pfArgs = openEdgeConfig.parameterFiles.filter(pf => pf.trim().length > 0).reduce((r, a) => r.concat('-pf', a), []);
        }
        let args = [
            '-T', // Redirect temp
            process.env['TEMP'],
            ...pfArgs
        ];
        if (batchMode) {
            args.push('-b');
        }
        if (startupProcedure) {
            args.push('-p', startupProcedure);
        }
        if (param) {
            args.push('-param', param);
        }
        return args;
    });
}

export function setupEnvironmentVariables(env: any): Promise<any> {
    return getOpenEdgeConfig().then(openEdgeConfig => {
        if (openEdgeConfig) {
            if (!openEdgeConfig.proPath || !(openEdgeConfig.proPath instanceof Array) || openEdgeConfig.proPath.length === 0) {
                openEdgeConfig.proPath = ['${workspaceRoot}'];
            }
            let paths = openEdgeConfig.proPath.map(p => {
                p = p.replace('${workspaceRoot}', vscode.workspace.rootPath);
                p = path.posix.normalize(p);
                return p;
            });
            env.VSABL_PROPATH = paths.join(',');

            if (openEdgeConfig.proPathMode) {
                env.VSABL_PROPATH_MODE = openEdgeConfig.proPathMode;
            }
        }
        env.VSABL_SRC = path.join(__dirname, '../abl-src');

        return env;
    });
}