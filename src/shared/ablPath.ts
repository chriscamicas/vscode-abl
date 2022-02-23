import * as path from 'path';
import { OpenEdgeProjectConfig } from './openEdgeConfigFile';

export interface ProArgsOptions {
    startupProcedure: string;
    param?: string;
    parameterFiles?: string[];
    databaseNames?: string[];
    batchMode?: boolean;
    debugPort?: number;
    temporaryDirectory?: string;
    workspaceRoot?: string;
}

export function createProArgs(options: ProArgsOptions): string[] {
    let pfArgs = [];
    if (options.parameterFiles) {
        // pfArgs = openEdgeConfig.parameterFiles.filter(pf => pf.trim().length > 0).map(pf => { return '-pf ' + pf; });
        pfArgs = options.parameterFiles
            .filter((pf) => pf.trim().length > 0)
            .reduce((r, a) => r.concat('-pf', a), []);
        for (let i = 0; i < pfArgs.length; i++) {
            pfArgs[i] = pfArgs[i].replace(
                '${workspaceRoot}',
                options.workspaceRoot
            );
        }
    }
    let args = [];
    let tempDir = options.temporaryDirectory;
    if (!tempDir) {
        tempDir = process.env.TEMP;
    }
    if (tempDir) {
        args.push('-T');
        args.push(tempDir);
    }
    args = args.concat(pfArgs);
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
        args.push('-debugReady', options.debugPort.toString());
    }

    return args;
}

export function setupEnvironmentVariables(
    env: any,
    openEdgeConfig: OpenEdgeProjectConfig,
    workspaceRoot: string
): any {
    env.VSABL_PROPATH = openEdgeConfig.propath.join(',')
    env.VSABL_PROPATH_MODE = openEdgeConfig.propathMode;
    env.VSABL_OE_STARTUP_PROCEDURE = '';
    env.VSABL_SRC = path.join(__dirname, '../abl-src');
    env.VSABL_WORKSPACE = openEdgeConfig.rootDir;
    // Enable debugger: https://docs.progress.com/bundle/openedge-developer-studio-olh-117/page/Enable-debugging.html
    env.ENABLE_OPENEDGE_DEBUGGER = 1;

    return env;
}
