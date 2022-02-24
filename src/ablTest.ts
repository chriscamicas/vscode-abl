import { mkdtemp, readFile } from 'fs';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { create } from './OutputChannelProcess';
import { createProArgs, setupEnvironmentVariables } from './shared/ablPath';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { getProject } from './extension';

import * as glob from 'glob';
import * as path from 'path';
import * as promisify from 'util.promisify';
import * as xml2js from 'xml2js';
import * as rimraf from 'rimraf';

const readFileAsync = promisify(readFile);
const globAsync = promisify(glob);
const mkdtempAsync = promisify(mkdtemp);
const rmdirAsync = promisify(rimraf);

const outputChannel = vscode.window.createOutputChannel('ABL Tests');
const failedStatusChar = '✘';
const successStatusChar = '✔';

export function ablTest(filename: string, ablConfig: vscode.WorkspaceConfiguration): Thenable<any> {

    // let cwd = path.dirname(filename);
    const cwd = vscode.workspace.rootPath;
    const oeConfig = getProject(filename);

        const cmd = oeConfig.getExecutable(false)
        outputChannel.clear();
        outputChannel.show(true);

        outputChannel.appendLine(`Starting UnitTests`);

        const env = setupEnvironmentVariables(process.env, oeConfig);
        if (filename) {
            runTestFile(filename, cmd, env, cwd, oeConfig).then((summary) => {
                outputChannel.appendLine(`Executed ${summary.tests} tests, Errors ${summary.errors}, Failures ${summary.failures}`);
            });
        } else {
            oeConfig.test.files.forEach(async (pattern) => {
                const files = await globAsync(pattern, { cwd });
                const r = [];
                for (const file of files) {
                    r.push(await runTestFile(file, cmd, env, cwd, oeConfig));
                }

                const summary = r.reduce((s1: any, s2: any) => {
                    return {
                        errors: s1.errors + s2.errors,
                        failures: s1.failures + s2.failures,
                        tests: s1.tests + s2.tests,
                    };
                });
                outputChannel.appendLine(`Executed ${summary.tests} tests, Errors ${summary.errors}, Failures ${summary.failures}`);
            });
            return null;
        }
        // outputChannel.appendLine(`Finished UnitTests`);
}

async function runTestFile(fileName, cmd, env, cwd, oeConfig: OpenEdgeProjectConfig) {
    const outDir = await mkdtempAsync(path.join(tmpdir(), 'ablunit-'));

    const xmlParser = new xml2js.Parser();
    const parseStringAsync = promisify(xmlParser.parseString);

    // TODO specif args for Tests
    // TODO -db ?
    if (oeConfig.test.beforeEach) {
        let beforeCmd = oeConfig.test.beforeEach.cmd;
        beforeCmd = beforeCmd.replace(/%([^%]+)%/g, (_, n) => {
            return env[n];
        });
        const beforeCwd = oeConfig.test.beforeEach.cwd || cwd;
        await create(beforeCmd, ['-c', `echo BASH before ${fileName}`], { env, cwd: beforeCwd }, outputChannel);
        // await create(beforeCmd, oeConfig.test.beforeEach.args, { env: env, cwd: cwd }, outputChannel);
    }
    const args = createProArgs({
        batchMode: true,
        param: `${fileName} -outputLocation ${outDir}`,
        parameterFiles: oeConfig.parameterFiles,
        startupProcedure: 'ABLUnitCore.p',
        temporaryDirectory: outDir,
    });
    const outputFile = path.join(outDir, 'results.xml');

    const consoleOutput = await create(cmd, args, { env, cwd }, outputChannel);
    const content = await readFileAsync(outputFile);
    const result = await parseStringAsync(content);
    const testResultSummary = {
        errors: 0,
        failures: 0,
        tests: 0,
    };
    if (result.testsuites) {
        result.testsuites.testsuite.forEach((testsuite) => {
            testsuite.testcase.forEach((t) => {

                const statusChar = t.$.status !== 'Success' ? failedStatusChar : successStatusChar;
                outputChannel.appendLine(`\t${statusChar} ${t.$.name}`);

                let stacktrace = [];
                if (t.$.status === 'Failure') {
                    stacktrace = t.failure;
                }
                if (t.$.status === 'Error') {
                    stacktrace = t.error;
                }
                stacktrace.forEach((f) => {
                    f.split('\r\n').filter((l) => l.indexOf('ABLUnit') === -1).forEach((l) => {
                        outputChannel.appendLine(`\t\t↱ ${l}`);
                    });
                });

            });
        });
        testResultSummary.tests += parseInt(result.testsuites.$.tests, 10);
        testResultSummary.errors += parseInt(result.testsuites.$.errors, 10);
        testResultSummary.failures += parseInt(result.testsuites.$.failures, 10);
        // outputChannel.appendLine(`Executed ${result.testsuites.$.tests} tests, Errors ${result.testsuites.$.errors}, Failures ${result.testsuites.$.failures}`);
    }
    await rmdirAsync(outDir);

    if (oeConfig.test.afterEach) {
        let afterCmd = oeConfig.test.afterEach.cmd;
        afterCmd = afterCmd.replace(/%([^%]+)%/g, (_, n) => {
            return env[n];
        });
        const afterCwd = oeConfig.test.afterEach.cwd || cwd;
        await create(afterCmd, ['-c', `echo BASH after ${fileName}`], { env, cwd: afterCwd }, outputChannel);
        // await create(afterCmd, oeConfig.test.afterEach.args, { env: env, cwd: cwd }, outputChannel);
    }
    return testResultSummary;
}
