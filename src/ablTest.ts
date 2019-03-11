import * as vscode from 'vscode';
import { OpenEdgeConfig } from './shared/openEdgeConfigFile';
import { getOpenEdgeConfig } from './ablConfig';
import { getProBin, createProArgs, setupEnvironmentVariables } from './shared/ablPath';
import { create } from './OutputChannelProcess';
import { readFile, mkdtemp } from 'fs';
import { tmpdir } from 'os';

import path = require('path');
import xml2js = require('xml2js');
import * as promisify from 'util.promisify';
import * as glob from 'glob';

import * as rimraf from 'rimraf';

const readFileAsync = promisify(readFile);
const globAsync = promisify(glob);
const mkdtempAsync = promisify(mkdtemp);
const rmdirAsync = promisify(rimraf);

let outputChannel = vscode.window.createOutputChannel('ABL Tests');
const failedStatusChar = '✘';
const successStatusChar = '✔';

const promiseSerial = funcs =>
	funcs.reduce((promise, func) =>
		promise.then(result => func().then(Array.prototype.concat.bind(result))),
		Promise.resolve([]));

export function ablTest(filename: string, ablConfig: vscode.WorkspaceConfiguration): Thenable<any> {

	// let cwd = path.dirname(filename);
	let cwd = vscode.workspace.rootPath;

	return getOpenEdgeConfig().then(oeConfig => {
		let cmd = getProBin(oeConfig.dlc);
		outputChannel.clear();
		outputChannel.show(true);

		outputChannel.appendLine(`Starting UnitTests`);

		let env = setupEnvironmentVariables(process.env, oeConfig, vscode.workspace.rootPath);
		let summary: any;
		if (filename) {
			runTestFile(filename, cmd, env, cwd, oeConfig).then(summary => {
				outputChannel.appendLine(`Executed ${summary.tests} tests, Errors ${summary.errors}, Failures ${summary.failures}`);
			});
		} else {
			oeConfig.test.files.forEach(async pattern => {
				let files = await globAsync(pattern, { cwd: cwd });
				let r = [];
				for (let i = 0; i < files.length; i++) {
					r.push(await runTestFile(files[i], cmd, env, cwd, oeConfig));
				}
				// console.log(`after all ${r}`);

				summary = r.reduce((s1: any, s2: any) => {
					return {
						tests: s1.tests + s2.tests,
						errors: s1.errors + s2.errors,
						failures: s1.failures + s2.failures
					};
				});
				outputChannel.appendLine(`Executed ${summary.tests} tests, Errors ${summary.errors}, Failures ${summary.failures}`);
			});
		}
		// outputChannel.appendLine(`Finished UnitTests`);
	});
}

async function runTestFile(fileName, cmd, env, cwd, oeConfig: OpenEdgeConfig) {
	let outDir = await mkdtempAsync(path.join(tmpdir(), 'ablunit-'));

	let xmlParser = new xml2js.Parser();
	let parseStringAsync = promisify(xmlParser.parseString);

	// TODO specif args for Tests
	// TODO -db ?
	if (oeConfig.test.beforeEach) {
		let beforeCmd = oeConfig.test.beforeEach.cmd;
		beforeCmd = beforeCmd.replace(/%([^%]+)%/g, (_, n) => {
			return env[n];
		});
		let beforeCwd = oeConfig.test.beforeEach.cwd || cwd;
		await create(beforeCmd, ['-c', `echo BASH before ${fileName}`], { env: env, cwd: beforeCwd }, outputChannel);
		// await create(beforeCmd, oeConfig.test.beforeEach.args, { env: env, cwd: cwd }, outputChannel);
	}
	let args = createProArgs({
		parameterFiles: oeConfig.parameterFiles,
		temporaryDirectory: outDir,
		batchMode: true,
		startupProcedure: 'ABLUnitCore.p',
		param: `${fileName} -outputLocation ${outDir}`
	});
	let outputFile = path.join(outDir, 'results.xml');

	let consoleOutput = await create(cmd, args, { env: env, cwd: cwd }, outputChannel);
	let content = await readFileAsync(outputFile);
	let result = await parseStringAsync(content);
	let testResultSummary = {
		tests: 0,
		errors: 0,
		failures: 0
	};
	if (result.testsuites) {
		result.testsuites.testsuite.forEach(testsuite => {
			testsuite.testcase.forEach(t => {

				let statusChar = t.$.status !== 'Success' ? failedStatusChar : successStatusChar;
				outputChannel.appendLine(`\t${statusChar} ${t.$.name}`);

				let stacktrace = [];
				if (t.$.status === 'Failure') {
					stacktrace = t.failure;
				}
				if (t.$.status === 'Error') {
					stacktrace = t.error;
				}
				stacktrace.forEach(f => {
					f.split('\r\n').filter(l => l.indexOf('ABLUnit') === -1).forEach(l => {
						outputChannel.appendLine(`\t\t↱ ${l}`);
					});
				});

			});
		});
		testResultSummary.tests += parseInt(result.testsuites.$.tests);
		testResultSummary.errors += parseInt(result.testsuites.$.errors);
		testResultSummary.failures += parseInt(result.testsuites.$.failures);
		// outputChannel.appendLine(`Executed ${result.testsuites.$.tests} tests, Errors ${result.testsuites.$.errors}, Failures ${result.testsuites.$.failures}`);
	}
	await rmdirAsync(outDir);

	if (oeConfig.test.afterEach) {
		let afterCmd = oeConfig.test.afterEach.cmd;
		afterCmd = afterCmd.replace(/%([^%]+)%/g, (_, n) => {
			return env[n];
		});
		let afterCwd = oeConfig.test.afterEach.cwd || cwd;
		await create(afterCmd, ['-c', `echo BASH after ${fileName}`], { env: env, cwd: afterCwd }, outputChannel);
		// await create(afterCmd, oeConfig.test.afterEach.args, { env: env, cwd: cwd }, outputChannel);
	}
	return testResultSummary;
}
