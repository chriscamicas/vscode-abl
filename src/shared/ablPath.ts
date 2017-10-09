import * as path from 'path';
import { OpenEdgeConfig } from './openEdgeConfigFile';

import * as fs from 'fs';

export function getBinPath(toolName: string) {
    return path.join(process.env['DLC'], 'bin', toolName);
}

export function getProBin() {
    return getBinPath('_progres');
}

export function getProwinBin() {
    let prowin = getBinPath('prowin.exe');
    if (!fs.existsSync(prowin))
        prowin = getBinPath('prowin32.exe');
    return prowin;
}
export interface ProArgsOptions {
    startupProcedure: string;
    param?: string;
    oeConfig?: OpenEdgeConfig;
    batchMode?: boolean;
    debugPort?: number;
}
export function createProArgs(options: ProArgsOptions): string[] {
    let pfArgs = [];
    let openEdgeConfig = options.oeConfig;
    if (openEdgeConfig && openEdgeConfig.parameterFiles) {
        // pfArgs = openEdgeConfig.parameterFiles.filter(pf => pf.trim().length > 0).map(pf => { return '-pf ' + pf; });
        pfArgs = openEdgeConfig.parameterFiles.filter(pf => pf.trim().length > 0).reduce((r, a) => r.concat('-pf', a), []);
    }
    let args = [
        '-T', // Redirect temp
        process.env['TEMP'],
        ...pfArgs
    ];
    if (options.batchMode) {
        args.push('-b');
    }
    if (options.startupProcedure) {
        args.push('-p', options.startupProcedure);
    }
    if (options.param) {
        args.push('-param', options.param);
    }
    if (options.debugPort) {
        args.push('-debugReady', options.debugPort);
    }

    return args;
}

export function setupEnvironmentVariables(env: any, openEdgeConfig: OpenEdgeConfig, workspaceRoot: string): any {
    if (openEdgeConfig) {
        if (!openEdgeConfig.proPath || !(openEdgeConfig.proPath instanceof Array) || openEdgeConfig.proPath.length === 0) {
            openEdgeConfig.proPath = ['${workspaceRoot}'];
        }
        openEdgeConfig.proPath.push(path.join(__dirname, '../../../abl-src'));
        let paths = openEdgeConfig.proPath.map(p => {
            p = p.replace('${workspaceRoot}', workspaceRoot);
            p = path.posix.normalize(p);
            return p;
        });
        // let paths = openEdgeConfig.proPath || [];
        env.VSABL_PROPATH = paths.join(',');

        if (openEdgeConfig.proPathMode) {
            env.VSABL_PROPATH_MODE = openEdgeConfig.proPathMode;
        } else  {
            env.VSABL_PROPATH_MODE = 'append';
        }
    }
    env.VSABL_SRC = path.join(__dirname, '../../abl-src');
    // enable the debugger
    // cf https://documentation.progress.com/output/ua/OpenEdge_latest/index.html#page/pdsoe/enabling-debugging.html
    env.ENABLE_OPENEDGE_DEBUGGER = 1;

    return env;
}