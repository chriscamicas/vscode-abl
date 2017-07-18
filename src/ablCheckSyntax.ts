import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');
import os = require('os');
import fs = require('fs');
import { outputChannel } from './ablStatus';
import { getBinPath, getProBin, prepareProArguments } from './ablPath';

let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
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
	// vscode.extensions.getExtension('chriscamicas.openedge-abl').extensionPath
	let env = process.env;
	// let cmd = getBinPath('_progres.exe');

	let cmd = getProBin();
	let args = prepareProArguments(path.join(__dirname, '../abl-src/check-syntax.p'), filename);

	return new Promise<ICheckResult[]>((resolve, reject) => {
		cp.execFile(cmd, args, { env: env, cwd: cwd }, (err, stdout, stderr) => {
			try {
				if (err && (<any>err).code === 'ENOENT') {
					// Since the tool is run on save which can be frequent
					// we avoid sending explicit notification if tool is missing
					console.log(`Cannot find ${cmd}`);
					return resolve([]);
				}
				let useStdErr = false; // todo voir si utile
				if (err && stderr && !useStdErr) {
					outputChannel.appendLine(['Error while running tool:', cmd, ...args].join(' '));
					outputChannel.appendLine(stderr);
					return resolve([]);
				}
				let lines = stdout.toString().split('\r\n').filter(line => line.length > 0);
				if (lines.length === 1 && lines[0].startsWith('SUCCESS')) {
					resolve([]);
					return;
				}
				let results: ICheckResult[] = [];

				// Format = &1 File:'&2' Row:&3 Col:&4 Error:&5 Message:&6
				let re = /(ERROR|WARNING) File:'(.*)' Row:(\d+) Col:(\d+) Error:(.*) Message:(.*)/;
				lines.forEach(line => {
					let matches = line.match(re);

					if (matches) {
						let checkResult = {
							file: matches[2],
							line: parseInt(matches[3]),
							column: parseInt(matches[4]),
							msg: `${matches[5]}: ${matches[6]}`,
							severity: matches[1].toLowerCase()
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
	}).then(results => {
		if (results.length === 0)
			statusBarItem.text = 'Syntax OK';
		else
			statusBarItem.text = 'Syntax error';
		return results;
	});
}

// function runTool(args: string[], cwd: string, severity: string, useStdErr: boolean, toolName: string, env: any, printUnexpectedOutput?: boolean): Promise<ICheckResult[]> {
//     let cmd = getBinPath(toolName);
//     cp.execFile(cmd, args, { env: env, cwd: cwd }, (err, stdout, stderr) => {

//     });
// }

/*
"command": "${env:DLC}\\bin\\_progres.exe",
            "args": [
                "-b",
                "-pf",
                "${workspaceRoot}\\.openedge\\default.pf",
                "-T",
                "${env:TEMP}",
                "-p",
                "${workspaceRoot}\\.openedge\\run.p",
                "-param",
                "${file},${env:DLC}\\tty\\netlib\\OpenEdge.Net.pl"
            ],
*/
            /*
	let env = getToolsEnvVars();
	let goRuntimePath = getGoRuntimePath();

	if (!goRuntimePath) {
		vscode.window.showInformationMessage('Cannot find "go" binary. Update PATH or GOROOT appropriately');
		return Promise.resolve([]);
	}

	let testPromise: Thenable<boolean>;
	let tmpCoverPath;
	let runTest = () => {
		if (testPromise) {
			return testPromise;
		}

		let buildFlags = goConfig['testFlags'] || goConfig['buildFlags'] || [];

		let args = buildFlags;
		if (goConfig['coverOnSave']) {
			tmpCoverPath = path.normalize(path.join(os.tmpdir(), 'go-code-cover'));
			args = ['-coverprofile=' + tmpCoverPath, ...buildFlags];
		}

		testPromise = goTest({
			goConfig: goConfig,
			dir: cwd,
			flags: args,
			background: true
		});
		return testPromise;
	};

	if (!!goConfig['buildOnSave'] && goConfig['buildOnSave'] !== 'off') {
		const tmpPath = path.normalize(path.join(os.tmpdir(), 'go-code-check'));
		let buildFlags = goConfig['buildFlags'] || [];
		// Remove the -i flag as it will be added later anyway
		if (buildFlags.indexOf('-i') > -1) {
			buildFlags.splice(buildFlags.indexOf('-i'), 1);
		}

		// We use `go test` instead of `go build` because the latter ignores test files
		let buildArgs: string[] = ['test', '-i', '-c', '-o', tmpPath, ...buildFlags];
		if (goConfig['buildTags']) {
			buildArgs.push('-tags');
			buildArgs.push('"' + goConfig['buildTags'] + '"');
		}

		if (goConfig['buildOnSave'] === 'workspace') {
			// Use `go list ./...` to get list of all packages under the vscode workspace
			// And then run `go test -i -c -o` on each of them
			let outerBuildPromise = new Promise<any>((resolve, reject) => {
				cp.execFile(goRuntimePath, ['list', './...'], { cwd: vscode.workspace.rootPath }, (err, stdout, stderr) => {
					if (err) {
						console.log('Could not find packages to build');
						return resolve([]);
					}
					let importPaths = stdout.split('\n');
					let buildPromises = [];
					importPaths.forEach(pkgPath => {
						// Skip compiling vendor packages
						if (!pkgPath || pkgPath.indexOf('/vendor/') > -1) {
							return;
						}
						buildPromises.push(runTool(
							buildArgs.concat(pkgPath),
							cwd,
							'error',
							true,
							null,
							env,
							true
						));
					});
					return Promise.all(buildPromises).then((resultSets) => {
						return resolve([].concat.apply([], resultSets));
					});
				});
			});
			runningToolsPromises.push(outerBuildPromise);
		} else {
			// Find the right importPath instead of directly using `.`. Fixes https://github.com/Microsoft/vscode-go/issues/846
			let currentGoWorkspace = getCurrentGoWorkspaceFromGOPATH(cwd);
			let importPath = currentGoWorkspace ? cwd.substr(currentGoWorkspace.length + 1) : '.';

			runningToolsPromises.push(runTool(
				buildArgs.concat(importPath),
				cwd,
				'error',
				true,
				null,
				env,
				true
			));
		}
	}

	if (!!goConfig['testOnSave']) {
		statusBarItem.show();
		statusBarItem.text = 'Tests Running';
		runTest().then(success => {
			if (statusBarItem.text === '') {
				return;
			}
			if (success) {
				statusBarItem.text = 'Tests Passed';
			} else {
				statusBarItem.text = 'Tests Failed';
			}
		});
	}

	if (!!goConfig['lintOnSave'] && goConfig['lintOnSave'] !== 'off') {
		let lintTool = goConfig['lintTool'] || 'golint';
		let lintFlags: string[] = goConfig['lintFlags'] || [];

		let args = [];
		let configFlag = '--config=';
		lintFlags.forEach(flag => {
			// --json is not a valid flag for golint and in gometalinter, it is used to print output in json which we dont want
			if (flag === '--json') {
				return;
			}
			if (flag.startsWith(configFlag)) {
				let configFilePath = flag.substr(configFlag.length);
				configFilePath = resolvePath(configFilePath, vscode.workspace.rootPath);
				args.push(`${configFlag}${configFilePath}`);
				return;
			}
			args.push(flag);
		});
		if (lintTool === 'gometalinter' && args.indexOf('--aggregate') === -1) {
			args.push('--aggregate');
		}

		let lintWorkDir = cwd;

		if (goConfig['lintOnSave'] === 'workspace') {
			args.push('./...');
			lintWorkDir = vscode.workspace.rootPath;
		}

		runningToolsPromises.push(runTool(
			args,
			lintWorkDir,
			'warning',
			false,
			lintTool,
			env
		));
	}

	if (!!goConfig['vetOnSave'] && goConfig['vetOnSave'] !== 'off') {
		let vetFlags = goConfig['vetFlags'] || [];
		let vetArgs = ['tool', 'vet', ...vetFlags, '.'];
		let vetWorkDir = cwd;

		if (goConfig['vetOnSave'] === 'workspace') {
			vetWorkDir = vscode.workspace.rootPath;
		}

		runningToolsPromises.push(runTool(
			vetArgs,
			vetWorkDir,
			'warning',
			true,
			null,
			env
		));
	}

	if (!!goConfig['coverOnSave']) {
		let coverPromise = runTest().then(success => {
			if (!success) {
				return [];
			}
			// FIXME: it's not obvious that tmpCoverPath comes from runTest()
			return getCoverage(tmpCoverPath);
		});
		runningToolsPromises.push(coverPromise);
	}

	return Promise.all(runningToolsPromises).then(resultSets => [].concat.apply([], resultSets));
}*/