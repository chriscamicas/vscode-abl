import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { Readable } from 'stream';
import { OutputChannel, window } from 'vscode';

export interface Success {
    success: true;
    code: number;
    stdout: string;
    stderr: string;
}

export interface Error {
    success: false;
}

export interface Options {
    /**
     * The flag indicating whether data from stdout should be captured. By default, the data is
     * not captured. If the data is captured, then it will be given when the process ends
     */
    captureStdout?: boolean;

    /**
     * The flag indicating whether data from stderr should be captured. By default, the data is
     * not captured. If the data is captured, then it will be given when the process ends
     */
    captureStderr?: boolean;

    displayExit?: boolean;
    displayClose?: boolean;
}

export async function create(spawnCommand: string, spawnArgs: string[] | undefined,
                             spawnOptions: SpawnOptions | undefined,
                             outputChannel: OutputChannel): Promise<Success | Error> {
    if (spawnOptions === undefined) {
        spawnOptions = {};
    }
    spawnOptions.stdio = 'pipe';
    const spawnedProcess = spawn(spawnCommand, spawnArgs, spawnOptions);
    outputChannel.show();
    const result = await process(spawnedProcess, outputChannel, { displayClose: false, displayExit: false });
    if (result.success && result.code === 0) {
        // outputChannel.hide();
        // outputChannel.dispose();
    }
    return result;
}

/**
 * Writes data from the process to the output channel. The function also can accept options
 * @param childProcess The process to write data from. The process should be creates with
 * options.stdio = "pipe"
 * @param outputChannel The output channel to write data to
 * @return The result of processing the process
 */
export function process(childProcess: ChildProcess, outputChannel: OutputChannel, options?: Options,
): Promise<Success | Error> {
    const stdout = '';
    const captureStdout = getOption(options, (o) => o.captureStdout, false);
    subscribeToDataEvent(childProcess.stdout, outputChannel, captureStdout, stdout);
    const stderr = '';
    const captureStderr = getOption(options, (o) => o.captureStderr, false);
    subscribeToDataEvent(childProcess.stderr, outputChannel, captureStderr, stderr);
    return new Promise<Success | Error>((resolve) => {
        const processProcessEnding = (code: number) => {
            resolve({
                code,
                stderr,
                stdout,
                success: true,
            });
        };
        // If some error happens, then the "error" and "close" events happen.
        // If the process ends, then the "exit" and "close" events happen.
        // It is known that the order of events is not determined.
        let processExited = false;
        let processClosed = false;
        childProcess.on('error', (error: any) => {
            outputChannel.appendLine(`error: error=${error}`);
            resolve({ success: false });
        });
        childProcess.on('close', (code, signal) => {
            if (getOption(options, (o) => o.displayClose, false)) {
                outputChannel.appendLine(`\nclose: code=${code}, signal=${signal}`);
            }
            processClosed = true;
            if (processExited) {
                processProcessEnding(code);
            }
        });
        childProcess.on('exit', (code, signal) => {
            if (getOption(options, (o) => o.displayExit, true)) {
                outputChannel.appendLine(`\nexit: code=${code}, signal=${signal}`);
            }
            processExited = true;
            if (processClosed) {
                processProcessEnding(code);
            }
        });
    });
}

function getOption(options: Options | undefined, evaluateOption: (options: Options) => boolean | undefined,
                   defaultValue: boolean): boolean {
    if (options === undefined) {
        return defaultValue;
    }
    const option = evaluateOption(options);
    if (option === undefined) {
        return defaultValue;
    }
    return option;
}

function subscribeToDataEvent(readable: Readable, outputChannel: OutputChannel, saveData: boolean,
                              dataStorage: string): void {
    readable.on('data', (chunk) => {
        const chunkAsString = typeof chunk === 'string' ? chunk : chunk.toString();
        outputChannel.append(chunkAsString);
        if (saveData) {
            dataStorage += chunkAsString;
        }
    });
}
