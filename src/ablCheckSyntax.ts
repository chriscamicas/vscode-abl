import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { outputChannel } from './ablStatus';
import { createProArgs, setupEnvironmentVariables } from './shared/ablPath';

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
// statusBarItem.command = 'abl.checkSyntax.showOutput';

export function removeSyntaxStatus(): void {
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

export function checkSyntax(filename: string, ablConfig: OpenEdgeProjectConfig): Promise<CheckResult[]> {
    outputChannel.clear();
    statusBarItem.show();
    statusBarItem.text = '$(sync) Checking syntax';

    let cwd = path.dirname(filename);

    const cmd = ablConfig.getExecutable(); 
    const env = setupEnvironmentVariables(process.env, ablConfig, ablConfig.rootDir);
    const args = createProArgs({
        batchMode: true,
        param: filename,
        parameterFiles: ablConfig.parameterFiles,
        startupProcedure: path.join(__dirname, '../abl-src/check-syntax.p'),
        workspaceRoot: ablConfig.rootDir,
    });

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
}
