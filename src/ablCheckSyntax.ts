import cp = require('child_process');
import * as path from 'path';
import * as vscode from 'vscode';
import { getOpenEdgeConfig } from './ablConfig';
import { outputChannel } from './ablStatus';
import { createProArgs, getProBin, setupEnvironmentVariables } from './shared/ablPath';

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
// statusBarItem.command = 'abl.checkSyntax.showOutput';

export function removeSyntaxStatus() {
    statusBarItem.hide();
    statusBarItem.text = '';
}

export interface CheckResult {
    file: string;
    line: number;
    column: number;
    msg: string;
    severity: string;
}

export function checkSyntax(filename: string, ablConfig: vscode.WorkspaceConfiguration): Promise<CheckResult[]> {
    outputChannel.clear();
    statusBarItem.show();
    // statusBarItem.text = '$(kebab-horizontal) Checking syntax';
    statusBarItem.text = '$(sync) Checking syntax';

    let cwd = path.dirname(filename);

    return getOpenEdgeConfig().then((oeConfig) => {
        const cmd = getProBin(oeConfig.dlc);
        const env = setupEnvironmentVariables(process.env, oeConfig, vscode.workspace.rootPath);
        const args = createProArgs({
            batchMode: true,
            param: filename,
            parameterFiles: oeConfig.parameterFiles,
            startupProcedure: path.join(__dirname, '../../abl-src/check-syntax.p'),
            workspaceRoot: vscode.workspace.rootPath,
        });
        if (oeConfig.workingDirectory) {
            cwd = oeConfig.workingDirectory.replace('${workspaceRoot}', vscode.workspace.rootPath)
                                           .replace('${workspaceFolder}', vscode.workspace.rootPath);
        }
        return new Promise<CheckResult[]>((resolve, reject) => {
            cp.execFile(cmd, args, { env, cwd }, (err, stdout, stderr) => {
                try {
                    if (err && (err as any).code === 'ENOENT') {
                        // Since the tool is run on save which can be frequent
                        // we avoid sending explicit notification if tool is missing
                        // console.log(`Cannot find ${cmd}`);
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
                    const results: CheckResult[] = [];

                    // Format = &1 File:'&2' Row:&3 Col:&4 Error:&5 Message:&6
                    const re = /(ERROR|WARNING) File:'(.*)' Row:(\d+) Col:(\d+) Error:(.*) Message:(.*)/;
                    lines.forEach((line) => {
                        const matches = line.match(re);

                        if (matches) {
                            const checkResult = {
                                column: parseInt(matches[4], 10),
                                file: matches[2],
                                line: parseInt(matches[3], 10),
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
                statusBarItem.text = '$(check) Syntax OK';
            } else {
                statusBarItem.text = '$(alert) Syntax error';
            }
            return results;
        });
    });
}
