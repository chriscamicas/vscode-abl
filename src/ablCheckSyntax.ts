import cp = require('child_process');
import path = require('path');
import * as vscode from 'vscode';
import { getOpenEdgeConfig } from './ablConfig';
import { outputChannel } from './ablStatus';
import { createProArgs, getProBin, setupEnvironmentVariables } from './shared/ablPath';

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
// statusBarItem.command = 'abl.checkSyntax.showOutput';

export function removeTestStatus(e: vscode.TextDocumentChangeEvent) {
    if (e.document.isUntitled) {
        return;
    }
    statusBarItem.hide();
    statusBarItem.text = '';
}

export interface ICheckResult {
    file: string;
    line: number;
    column: number;
    msg: string;
    severity: string;
}

export function checkSyntax(filename: string, ablConfig: vscode.WorkspaceConfiguration): Promise<ICheckResult[]> {
    outputChannel.clear();
    statusBarItem.show();
    statusBarItem.text = 'Checking syntax';

    let cwd = path.dirname(filename);

    return getOpenEdgeConfig().then((oeConfig) => {
        const cmd = getProBin(oeConfig.dlc);
        const env = setupEnvironmentVariables(process.env, oeConfig, vscode.workspace.rootPath);
        const args = createProArgs({
            parameterFiles: oeConfig.parameterFiles,
            batchMode: true,
            startupProcedure: path.join(__dirname, '../../abl-src/check-syntax.p'),
            param: filename,
            workspaceRoot: vscode.workspace.rootPath,
        });
        cwd = oeConfig.workingDirectory ? oeConfig.workingDirectory.replace('${workspaceRoot}', vscode.workspace.rootPath).replace('${workspaceFolder}', vscode.workspace.rootPath) : cwd;
        return new Promise<ICheckResult[]>((resolve, reject) => {
            cp.execFile(cmd, args, { env, cwd }, (err, stdout, stderr) => {
                try {
                    if (err && (err as any).code === 'ENOENT') {
                        // Since the tool is run on save which can be frequent
                        // we avoid sending explicit notification if tool is missing
                        console.log(`Cannot find ${cmd}`);
                        return resolve([]);
                    }
                    const useStdErr = false; // todo voir si utile
                    if (err && stderr && !useStdErr) {
                        outputChannel.appendLine(['Error while running tool:', cmd, ...args].join(' '));
                        outputChannel.appendLine(stderr);
                        return resolve([]);
                    }
                    const lines = stdout.toString().split('\r\n').filter((line) => line.length > 0);
                    if (lines.length === 1 && lines[0].startsWith('SUCCESS')) {
                        resolve([]);
                        return;
                    }
                    const results: ICheckResult[] = [];

                    // Format = &1 File:'&2' Row:&3 Col:&4 Error:&5 Message:&6
                    const re = /(ERROR|WARNING) File:'(.*)' Row:(\d+) Col:(\d+) Error:(.*) Message:(.*)/;
                    lines.forEach((line) => {
                        const matches = line.match(re);

                        if (matches) {
                            const checkResult = {
                                file: matches[2],
                                line: parseInt(matches[3]),
                                column: parseInt(matches[4]),
                                msg: `${matches[5]}: ${matches[6]}`,
                                severity: matches[1].toLowerCase(),
                            };
                            // console.log(`${JSON.stringify(checkResult)}`);
                            results.push(checkResult);
                        } else {
                            reject(stdout);
                        }
                    });
                    resolve(results);
                } catch (e) {
                    reject(e);
                }
            });
        }).then((results) => {
            if (results.length === 0) {
                statusBarItem.text = 'Syntax OK';
            }
            else {
                statusBarItem.text = 'Syntax error';
            }
            return results;
        });
    });
}
