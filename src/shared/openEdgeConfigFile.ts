import * as jsonminify from 'jsonminify';
import { readFile } from 'fs';
import * as promisify from 'util.promisify';

const readFileAsync = promisify(readFile);

export const OPENEDGE_CONFIG_FILENAME = '.openedge.json';

export interface TestConfig {
    files?: string[];
    beforeAll?: Command;
    afterAll?: Command;
    beforeEach?: Command;
    afterEach?: Command;
}

export interface Command {
    cmd: string;
    args?: string[];
    env?: string[];
    cwd?: string;
}
export interface OpenEdgeConfig {
    proPath?: string[];
    proPathMode?: 'append' | 'overwrite' | 'prepend';
    parameterFiles?: string[];
    workingDirectory?: string;
    test?: TestConfig;
}

export function loadConfigFile(filename: string): Thenable<OpenEdgeConfig> {
    if (!filename)
        return Promise.resolve({});
    return readFileAsync(filename, { encoding: 'utf8' }).then(text => {
        // We don't catch the parsing error, to send the error in the UI (via promise rejection)
        return JSON.parse(jsonminify(text));
    });
}
