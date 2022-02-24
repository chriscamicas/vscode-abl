import * as path from 'path';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';
import { createProArgs, setupEnvironmentVariables } from './shared/ablPath';

export function run(filename: string, ablConfig: OpenEdgeProjectConfig): Promise<any> {
    outputChannel.clear();
    let cwd = path.dirname(filename);

    const cmd = ablConfig.getExecutable(); 
    const env = setupEnvironmentVariables(process.env, ablConfig);

    const args = createProArgs({
        batchMode: true,
        param: filename,
        parameterFiles: ablConfig.parameterFiles,
        startupProcedure: path.join(__dirname, '../abl-src/run.p'),
        workspaceRoot: ablConfig.rootDir,
    });

    return create(cmd, args, { env, cwd }, outputChannel);
}
