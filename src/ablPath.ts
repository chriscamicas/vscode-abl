import * as path from 'path';

export function getBinPath(toolName: string) {
    // TODO configuration DLC dans les pref
    return path.join(process.env['DLC'], 'bin', toolName);
}

export function getProBin() {
    return getBinPath('_progres');
}

export function prepareProArguments(startupProcedure: string, param?: string): string[] {
    // TODO pf file etc...
    let args = [
        '-b', // Batch mode
        '-T', // Redirect temp
        process.env['TEMP'],
        '-p',
        startupProcedure
    ];
    if (param) {
        args.push('-param', param);
    }
    return args;
}