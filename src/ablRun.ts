import * as vscode from 'vscode';
import path = require('path');
import { outputChannel } from './ablStatus';
import { getOpenEdgeConfig } from './ablConfig';
import { getProBin, createProArgs, setupEnvironmentVariables } from './shared/ablPath';
import { create } from './OutputChannelProcess';

export function run(filename: string, ablConfig: vscode.WorkspaceConfiguration): Promise<any> {
	outputChannel.clear();
	let cwd = path.dirname(filename);

	let cmd = getProBin();
	return getOpenEdgeConfig().then(oeConfig => {
		let env = setupEnvironmentVariables(process.env, oeConfig, vscode.workspace.rootPath);
		let args = createProArgs({
			parameterFiles: oeConfig.parameterFiles,
			batchMode: true,
			startupProcedure: path.join(__dirname, '../../abl-src/run.p'),
			param: filename,
			workspaceRoot: vscode.workspace.rootPath
		});
		cwd = oeConfig.workingDirectory ? oeConfig.workingDirectory.replace('${workspaceRoot}', vscode.workspace.rootPath).replace('${workspaceFolder}', vscode.workspace.rootPath) : cwd;
		return create(cmd, args, { env: env, cwd: cwd }, outputChannel);
	});
}

// export function runDebug(filename: string, ablConfig: vscode.WorkspaceConfiguration): Promise<any> {
// 	outputChannel.clear();
// 	let cwd = path.dirname(filename);

// 	let cmd = getProBin();
// 	return prepareProArguments(path.join(__dirname, '../abl-src/run-debug.p'), filename, true, true).then(args => {
// 		return setupEnvironmentVariables(process.env).then(env => {
// 			// return create(cmd, args, { env: env, cwd: cwd }, outputChannel);

// 			let spawnOptions = { env: env, cwd: cwd };
// 			// spawnOptions.stdio = 'pipe';
// 			const spawnedProcess = spawn(cmd, args, spawnOptions);
// 			vscode.
// 		    setTimeout(() => { spawnedProcess.stdin.write('\x0D'); }, 8000);

// 		});
// 	});
// }

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