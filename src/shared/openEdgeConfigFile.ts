import { readFileSync } from 'fs';
import * as jsonminify from 'jsonminify'; // Remove comments from JSON file
import * as path from 'path';
import * as fs from 'fs';
import { OpenEdgeFormatOptions } from '../misc/OpenEdgeFormatOptions';

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
    // JSON mapping of openedge-project.json
    version?: string;
    graphicalMode?: boolean;
    extraParameters?: string;
    buildPath?: BuildPathEntry[];
    buildDirectory?: string;
    dumpFiles?: string[];
    dbConnections?: string[];
    aliases?: string;
    numThreads: number;
    format?: OpenEdgeFormatOptions;
}

export interface BuildPathEntry {
  type: string;
  path: string;
}

export class OpenEdgeProjectConfig {
  // Real project config, created from OpenEdgeConfig
  rootDir: string;
  version: string;
  gui: boolean;
  dlc: string;
  propath: string[]
  propathMode: 'append' | 'overwrite' | 'prepend';
  startupProc: string
  parameterFiles: string[]
  dbDictionary?: string[];
  test?: TestConfig;
  format?: OpenEdgeFormatOptions;

  getExecutable(gui?: boolean): string {
    if (gui || this.gui) {
      if (fs.existsSync(path.join(this.dlc, 'bin', 'prowin.exe')))
        return path.join(this.dlc, 'bin', 'prowin.exe');
      else
        return path.join(this.dlc, 'bin', 'prowin32.exe')
    } else {
      if (fs.existsSync(path.join(this.dlc, 'bin', '_progres.exe')))
        return path.join(this.dlc, 'bin', '_progres.exe');
      else
        return path.join(this.dlc, 'bin', '_progres')
    }
  }
}

export async function loadConfigFile(filename: string): Promise<OpenEdgeConfig> {
    if (!filename) {
        return Promise.reject();
    }
    try {
        const text = readFileSync(filename, { encoding: 'utf8' });
        return JSON.parse(jsonminify(text));
    } catch (caught) {
        return Promise.reject();
    }
}
