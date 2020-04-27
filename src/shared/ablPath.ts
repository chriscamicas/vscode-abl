import * as fs from "fs";
import * as path from "path";
import { OpenEdgeConfig } from "./openEdgeConfigFile";

export function getBinPath(toolName: string, dlcPath?: string | string[]) {
    let dlc;
    // Use first available folder in array of possible locations
    // This enables support for multiple versions
    if (dlcPath instanceof Array) {
        dlcPath.some((p) => {
            if (fs.existsSync(p)) {
                dlc = p;
                return true;
            }
        });
        if (!dlc) {
            dlc = process.env.DLC;
        }
    } else {
        dlc = dlcPath || process.env.DLC;
    }
    if (dlc) {
        return path.join(dlc, "bin", toolName);
    }
    // dlc not set, assume the binary is in the PATH
    return toolName;
}

export function getProBin(dlcPath?: string) {
    return getBinPath("_progres", dlcPath);
}

export function getProwinBin(dlcPath?: string) {
    let prowin = getBinPath("prowin.exe", dlcPath);
    if (!fs.existsSync(prowin)) {
        prowin = getBinPath("prowin32.exe", dlcPath);
    }
    return prowin;
}
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
            .reduce((r, a) => r.concat("-pf", a), []);
        for (let i = 0; i < pfArgs.length; i++) {
            pfArgs[i] = pfArgs[i].replace(
                "${workspaceRoot}",
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
        args.push("-T");
        args.push(tempDir);
    }
    args = args.concat(pfArgs);
    if (options.batchMode) {
        args.push("-b");
    }
    if (options.startupProcedure) {
        args.push("-p", options.startupProcedure);
    }
    if (options.param) {
        args.push("-param", options.param);
    }
    if (options.debugPort) {
        args.push("-debugReady", options.debugPort.toString());
    }

    return args;
}

export function setupEnvironmentVariables(
    env: any,
    openEdgeConfig: OpenEdgeConfig,
    workspaceRoot: string
): any {
    if (openEdgeConfig) {
        if (
            !openEdgeConfig.proPath ||
            !(openEdgeConfig.proPath instanceof Array) ||
            openEdgeConfig.proPath.length === 0
        ) {
            openEdgeConfig.proPath = ["${workspaceRoot}"];
        }
        openEdgeConfig.proPath.push(path.join(__dirname, "../../../abl-src"));
        const paths = openEdgeConfig.proPath.map((p) => {
            p = p.replace("${workspaceRoot}", workspaceRoot);
            p = p.replace("${workspaceFolder}", workspaceRoot);
            p = path.posix.normalize(p);
            return p;
        });
        // let paths = openEdgeConfig.proPath || [];
        env.VSABL_PROPATH = paths.join(",");

        if (openEdgeConfig.proPathMode) {
            env.VSABL_PROPATH_MODE = openEdgeConfig.proPathMode;
        } else {
            env.VSABL_PROPATH_MODE = "append";
        }

        if (openEdgeConfig.startupProcedure) {
            env.VSABL_OE_STARTUP_PROCEDURE = openEdgeConfig.startupProcedure
                .replace("${workspaceRoot}", workspaceRoot)
                .replace("${workspaceFolder}", workspaceRoot);
        } else {
            // unset var; required in case user changes config
            env.VSABL_OE_STARTUP_PROCEDURE = "";
        }
    }
    env.VSABL_SRC = path.join(__dirname, "../../abl-src");
    env.VSABL_WORKSPACE = workspaceRoot;
    // enable the debugger
    // cf https://documentation.progress.com/output/ua/OpenEdge_latest/index.html#page/pdsoe/enabling-debugging.html
    env.ENABLE_OPENEDGE_DEBUGGER = 1;

    return env;
}

export function expandPathVariables(
    pathToExpand: string,
    env: any,
    variables: { [key: string]: string }
): string {
    // format VSCode ${env:VAR}
    // path = path.replace(/\${env:([^}]+)}/g, (_, n) => {
    //     return env[n];
    // });

    // format DOS %VAR%
    let expandedPath = pathToExpand;
    expandedPath = expandedPath.replace(/%([^%]+)%/g, (_, n) => {
        return env[n];
    });

    // VSCode specific var ${workspaceFolder}
    expandedPath = expandedPath.replace(/\${([^}]+)}/g, (_, n) => {
        return variables[n];
    });
    return expandedPath;
}
