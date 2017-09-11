import * as path from 'path';
import * as os from 'os';
import { Socket } from 'net';
import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugSession, InitializedEvent, TerminatedEvent, BreakpointEvent, ThreadEvent, StoppedEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint } from 'vscode-debugadapter';
import { readFileSync, existsSync, lstatSync } from 'fs';
import { basename, dirname, extname } from 'path';
import { spawn, ChildProcess, execSync, spawnSync } from 'child_process';
import * as logger from 'vscode-debug-logger';
import * as FS from 'fs';
import { OpenEdgeConfig, loadConfigFile, OPENEDGE_CONFIG_FILENAME } from '../shared/openEdgeConfigFile';
import { getProBin, createProArgs, setupEnvironmentVariables } from '../shared/ablPath';

// require('console-stamp')(console);

enum AblReflectKind {
    Invalid = 0,
    Variable,
    Buffer,
    TempTable,
    DataSet,
    Parameter
}

interface DebugMessage {
    code: string;
    args: string[][];
}
interface DebugMessageListing extends DebugMessage {
    code: string;
    args: string[][];
    breakpointCount: number;
    file: string;
    stoppedAtLine: number;
    breakpoints: DebugMessageListingBreapoint[];
}
interface DebugMessageListingBreapoint {
    line: number;
    id: number;
}

interface DebuggerState {
    exited: boolean;
    exitStatus: number;
    breakPoint: DebugBreakpoint;
    breakPointInfo: {};
}

interface DebugBreakpoint {
    file: string;
    procedureName?: string;
    condition?: string;
    line: number;
    verified: boolean;
}

interface DebugVariable {
    name: string;
    type: string;
    kind: AblReflectKind;
    value: string;
    children: DebugVariable[];
    // unreadable: string;
}

// Arguments shared between Launch and Attach requests.
interface CommonArguments {
    port?: number;
    trace?: boolean | 'verbose';
}
// This interface should always match the schema found in `package.json`.
interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments, CommonArguments {
    address?: string;
    localRoot?: string;
    remoteRoot?: string;
}
// This interface should always match the schema found in `package.json`.
interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, CommonArguments {
    program: string;
    args?: string[];
    stopOnEntry?: boolean;
    cwd?: string;
    showLog?: boolean;
}

process.on('uncaughtException', (err: any) => {
    const errMessage = err && (err.stack || err.message);
    logger.error(`Unhandled error in debug adapter: ${errMessage}`);
    throw err;
});

function logArgsToString(args: any[]): string {
    return args.map(arg => {
        return typeof arg === 'string' ?
            arg :
            JSON.stringify(arg);
    }).join(' ');
}

function verbose(...args: any[]) {
    logger.verbose(logArgsToString(args));
}

function log(...args: any[]) {
    logger.log(logArgsToString(args));
}

function logError(...args: any[]) {
    logger.error(logArgsToString(args));
}

function normalizePath(filePath: string) {
    // Progress is compatible with forward slash, even on Windows platform
    // Let's generalize
    return path.posix.normalize(filePath.replace(/\\/g, '/'));
}

class AblDebugger {
    sendSocket: Socket;
    recvSocket: Socket;
    connection: Promise<void>;

    msgQueue: string[];
    onstdout: (str: string) => void;
    onstderr: (str: string) => void;
    onClose: () => void;
    onMessage: (msg: DebugMessage) => void;
    timeout = 20000;

    constructor(port: number, host: string) {
        this.msgQueue = [];
        this.connection = new Promise((resolve, reject) => {
            if (!host) {
                return reject('The hostname is missing in launch.json');
            }
            this.recvSocket = new Socket();
            this.recvSocket.on('data', this.dataHandler.bind(this));
            this.recvSocket.on('close', this.closeHandler.bind(this));
            this.recvSocket.on('error', this.errorHandler.bind(this));

            this.sendSocket = new Socket();
            this.sendSocket.on('close', this.closeHandler.bind(this));
            this.sendSocket.on('error', this.errorHandler.bind(this));

            // first socket to connect is the listening-one
            this.recvSocket.addListener('error', connectionErrorHandler.bind(this));

            this.recvSocket.connect(port, host, () => {
                this.recvSocket.removeListener('error', connectionErrorHandler);
                // second sends commands
                this.sendSocket.connect(port, host);
                resolve();
            });

            function connectionErrorHandler(err) {
                this.recvSocket.removeListener('error', connectionErrorHandler);
                if (err.code === 'ECONNREFUSED') {
                    reject(err);
                }
            }

        });
    }

    errorHandler(err: any) {
        log(err);
    }
    dataHandler(data: any) {
        if (!this.onMessage) return;

        this.convertDataToDebuggerMessages(data).forEach(msg => {
            this.onMessage(msg);
        });
    }
    // convertMessage<T>(args: T): T {
    //     return args;
    // }
    convertDataToDebuggerMessages(data: any): DebugMessage[] {
        let messages: string = data.toString();
        return messages.split('\0').filter(msg => msg.length > 0).map(msg => {

            let idxCode = msg.indexOf(';');
            let msgCode = msg;
            let args = [];
            if (idxCode !== -1) {
                msgCode = msg.slice(0, idxCode);
                msg = msg.substr(idxCode + 1);

                // specific args convertion
                if (msgCode === 'MSG_LISTING') {
                    args = msg.split(';').filter(p => p.length > 0);
                    let msgConverted: DebugMessageListing = {
                        code: msgCode,
                        args: [],
                        breakpointCount: parseInt(args[4]),
                        file: args[0],
                        stoppedAtLine: parseInt(args[5]),
                        breakpoints: []
                    };

                    for (let bpIdx = 0; bpIdx < msgConverted.breakpointCount; bpIdx++) {
                        msgConverted.breakpoints.push({
                            line: args[6 + bpIdx * 2],
                            id: args[6 + (bpIdx * 2) + 1]
                        });
                    }
                    return msgConverted;
                } else {
                    let parts1 = msg.split('\n').filter(p => p.length > 0);
                    args = parts1.map(p => p.split(';')).filter(p => p.length > 0);
                }
            }
            return { code: msgCode, args: args };
        });
    }
    closeHandler() {
        log('Connection closed');
        if (this.onClose) { this.onClose(); }
    }

    sendMessage(msg: string) {
        verbose(`send(${msg})`);
        msg += '\0'; // ending

        // queue for later
        this.msgQueue.push(msg);
        if (this.msgQueue.length === 1) {
            this.writeMessage(msg);
        }
    }

    writeMessage(msg: string) {
        this.sendSocket.write(msg, () => {
            // remove the message we've just sent
            this.msgQueue.shift();
            // if there is more, send the rest of them
            if (this.msgQueue.length > 0) {
                this.writeMessage(this.msgQueue[0]);
            }
        });
    }

    close() {
        // TODO restore the remote process state, and send 'continue'
        this.sendSocket.destroy();
        this.recvSocket.destroy();
    }

    showStack(): Promise<DebugMessage> {
        return new Promise((resolve, reject) => {
            let response = null;
            this.sendMessage('show stack-ide');
            this.recvSocket.addListener('data', stackResponse);

            setTimeout(() => {
                if (response === null) {
                    this.recvSocket.removeListener('data', stackResponse);
                    reject(new Error('response not received'));
                }
            }, this.timeout);

            const self = this;

            function stackResponse(data) {
                response = self.convertDataToDebuggerMessages(data).filter(msg => msg.code === 'STACK-IDE');
                if (response.length > 0) {
                    resolve(response[0]);
                    self.recvSocket.removeListener('data', stackResponse);
                }
            }
        });
    }

    listVariables(): Promise<DebugMessage> {
        return this.sendMessageWithResponse('list variables', 'MSG_VARIABLES');
    }
    listParameters(): Promise<DebugMessage> {
        return this.sendMessageWithResponse('list parameters', 'MSG_PARAMETERS');
    }
    listTempTables(): Promise<DebugMessage> {
        return this.sendMessageWithResponse('list temp-tables', 'MSG_TEMPTABLES');
    }
    getFields(tempTableName: string): Promise<DebugMessage> {
        return this.sendMessageWithResponse(`GET-FIELDS ${tempTableName}`, 'MSG_FIELDS');
    }

    sendMessageWithResponse(msg: string, respCode: string): Promise<DebugMessage> {
        return new Promise((resolve, reject) => {
            let response = null;

            const self = this;
            let respCallback = function (data) {
                response = self.convertDataToDebuggerMessages(data).filter(msg => msg.code === respCode);
                if (response.length > 0) {
                    resolve(response[0]);
                    self.recvSocket.removeListener('data', respCallback);
                }
            };
            this.sendMessage(msg);
            this.recvSocket.on('data', respCallback);

            setTimeout(() => {
                if (response === null) {
                    this.recvSocket.removeListener('data', respCallback);
                    reject(new Error('response not received'));
                }
            }, this.timeout);
        });

    }
}

class AblDebugSession extends DebugSession {

    private _variableHandles: Handles<DebugVariable>;
    private breakpoints: Map<string, DebugBreakpoint[]>;
    private watchpointExpressions: Set<string>;
    private threads: Set<number>;
    private localRoot: string;
    private remoteRoot: string;
    private debugState: DebuggerState;
    private ablDebugger: AblDebugger;

    public constructor(debuggerLinesStartAt1: boolean, isServer: boolean = false) {
        super(debuggerLinesStartAt1, isServer);
        this._variableHandles = new Handles<DebugVariable>();
        this.threads = new Set<number>();
        this.debugState = null;
        this.ablDebugger = null;
        this.breakpoints = new Map<string, DebugBreakpoint[]>();
        this.watchpointExpressions = new Set<string>();
        this.localRoot = '';
        this.remoteRoot = '';

        const logPath = path.join(os.tmpdir(), 'vscode-abl-debug.txt');
        logger.init(e => this.sendEvent(e), logPath, isServer);
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        verbose('InitializeRequest');
        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = true;
        // response.body.supportsConditionalBreakpoints = true;
        this.sendResponse(response);
        verbose('InitializeResponse');
    }

    protected initializeDebugger(args: AttachRequestArguments): Promise<void> {
        const logLevel = args.trace === 'verbose' ?
            logger.LogLevel.Verbose :
            args.trace ? logger.LogLevel.Log :
                logger.LogLevel.Error;
        logger.setMinLogLevel(logLevel);
        if (args.remoteRoot)
            this.remoteRoot = normalizePath(args.remoteRoot);
        if (args.localRoot)
            this.localRoot = normalizePath(args.localRoot);

        this.ablDebugger = new AblDebugger(args.port, args.address);

        this.ablDebugger.onstdout = (str: string) => {
            this.sendEvent(new OutputEvent(str, 'stdout'));
        };
        this.ablDebugger.onstderr = (str: string) => {
            this.sendEvent(new OutputEvent(str, 'stderr'));
        };
        this.ablDebugger.onClose = () => {
            this.sendEvent(new TerminatedEvent());
            verbose('TerminatedEvent');
        };
        this.ablDebugger.onMessage = (msg: DebugMessage) => {
            verbose(`recv(${msg.code} ${JSON.stringify(msg.args)})`);

            if (msg.code === 'MSG_INFO') {
                // verbose(`recv(MSG_INFO ${msg.args})`);
                this.sendEvent(new OutputEvent(msg.args[0].toString()));
            }
            else if (msg.code === 'MSG_ENTER') {
                this.sendEvent(new StoppedEvent('breakpoint', 0));

                // At first stop, the AblDebugger clear its breakpoints, we should re-send them
                this.sendBreakpoints();
                verbose('StoppedEvent("breakpoint")');
            }
            else if (msg.code === 'MSG_LISTING') {
                let msgListing = <DebugMessageListing>msg;
                // TODO send BreakpointEvent with verified breakpoints
                // is that really needed ???

                // this.sendEvent(new BreakpointEvent('new', bp));
                // this.sendEvent(new BreakpointEvent('changed', bp));
                // this.sendEvent(new BreakpointEvent('update', bp));

                // starting with msg.args[0][4]
                verbose(`${JSON.stringify(msgListing)}`);
            }
            else {
            }
        };

        return this.ablDebugger.connection.then(() => {
            this.ablDebugger.sendMessage('SETPROP IDE 1');
            // this.ablDebugger.sendMessage('SETPROP RELPATH 0 GENLISTING 1');
            // this.ablDebugger.sendMessage('SETPROP RELPATH 0 GENLISTING 1');

            this.sendEvent(new InitializedEvent());
            verbose('InitializeEvent');
        });
    }
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        verbose('LaunchRequest');

        let cmd = getProBin();

        let filename = args.program;
        let cwd = args.cwd || path.dirname(filename);

        loadConfigFile(path.join(args.cwd, OPENEDGE_CONFIG_FILENAME)).then(oeConfig => {
            let env = setupEnvironmentVariables(process.env, oeConfig, cwd);
            let proArgs = createProArgs({
                oeConfig: oeConfig,
                batchMode: true,
                startupProcedure: path.join(__dirname, '../../abl-src/run-debug.p'),
                param: filename,
                debugPort: args.port
            });

            // prepareProArguments(path.join(__dirname, '../../abl-src/run-debug.p'), filename, true, true).then(proArgs => {
            let spawnOptions = { env: env, cwd: cwd };
            // spawnOptions.stdio = 'pipe';
            const spawnedProcess = spawn(cmd, proArgs, spawnOptions);
            spawnedProcess.stderr.on('data', chunk => {
                let str = chunk.toString();
                this.sendEvent(new OutputEvent(str, 'stderr'));
            });
            spawnedProcess.stdout.on('data', chunk => {
                let str = chunk.toString();
                this.sendEvent(new OutputEvent(str, 'stdout'));
            });
            spawnedProcess.on('close', (code) => {
                this.sendEvent(new TerminatedEvent());
                logError('Process exiting with code: ' + code);
            });
            spawnedProcess.on('error', function (err) {
                logError('Process exiting with code: ' + err);
            });

            let attachArgs = {
                address: 'localhost',
                ...args
            };
            this.initializeDebugger(attachArgs).then(() => {
                // Send a key, because the spawned process is waiting for the debugger to connect
                spawnedProcess.stdin.write('\x0D');
                if (typeof args.stopOnEntry === 'boolean' && args.stopOnEntry === false) {
                    this.ablDebugger.sendMessage('cont');
                } else {
                    this.ablDebugger.sendMessage('interrup');
                }
                this.sendResponse(response);
                verbose('LaunchResponse');
            }, err => {
                this.sendErrorResponse(response, 3000, 'Failed to continue: "{e}"', { e: err.toString() });
            });
        }, err => {
            this.sendErrorResponse(response, 3000, 'Failed to load config file: "{e}"', { e: err.toString() });
        });
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): void {
        verbose('AttachRequest');
        this.initializeDebugger(args).then(() => {
            this.sendResponse(response);
            verbose('AttachResponse');
        }, err => {
            this.sendErrorResponse(response, 3000, 'Failed to continue: "{e}"', { e: err.toString() });
        });
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
        verbose('DisconnectRequest');
        this.ablDebugger.close();
        super.disconnectRequest(response, args);
        verbose('DisconnectResponse');
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        verbose('ConfigurationDoneRequest');
        // this.sendEvent(new StoppedEvent('breakpoint', 0));
        // verbose('StoppedEvent("breakpoint")');
        this.sendResponse(response);
    }
    protected sendBreakpoints(): void {
        let msg;
        if (this.breakpoints.size > 0) {
            msg = 'break ';
            let bpIdx = 1;
            this.breakpoints.forEach((breakpoints, f) => {
                breakpoints.forEach(bp => {
                    msg += `B;${bpIdx};E;${bp.file};${bp.line}; ;`;
                    bpIdx += 1;
                });
            });
        } else {
            msg = 'break;';
        }
        /*
        break B;1;E;C:/OpenEdge/WRK/testof.p;18; ;.
        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;1;18;18;1.
        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;0;0.

        break B;1;E;C:/OpenEdge/WRK/testof.p;18; ;B;2;E;C:/OpenEdge/WRK/testof.p;27; ;.
        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;0;0.
        break B;1;E;C:/OpenEdge/WRK/testof.p;18; ;B;2;E;C:/OpenEdge/WRK/testof.p;27; ;.
        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;0;0.
        break B;1;E;C:/OpenEdge/WRK/testof.p;18; ;B;2;E;C:/OpenEdge/WRK/testof.p;27; ;B;3;E;C:/OpenEdge/WRK/testof.p;32; ;.
        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;0;0.
        break B;1;E;C:/OpenEdge/WRK/testof.p;18; ;B;2;E;C:/OpenEdge/WRK/testof.p;27; ;B;3;E;C:/OpenEdge/WRK/testof.p;32; ;.
        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;0;0.

        MSG_STATUS;.Arrêté à 18 dans testof.p. (3061)..
        MSG_ENTER;.
        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;3;18;18;10;27;11;32;12.

        MSG_LISTING;C:\OpenEdge\WRK\testof.p;testof.p (LOCAL);C:\OpenEdge\WRK\testof.p;30961;3;18;18;10;27;11;32;12.
        */

        this.ablDebugger.sendMessage(msg);
    }
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        verbose('SetBreakPointsRequest');

        // break B;1;E;C:/OpenEdge/WRK/testof.p;2; ;B;2;E;C:/OpenEdge/WRK/testof.p;3; ;.

        // foreach breakpoint : B;1;E;C:/OpenEdge/WRK/testof.p;2; ;
        // let file = normalizePath(args.source.path);
        let file = this.convertLocalPathToRemote(args.source.path);

        if (!this.breakpoints.get(file)) {
            this.breakpoints.set(file, []);
        }
        // no need to clear all breakpoints, the 'break' message sends all active breakpoints everytime
        // this.ablDebugger.sendMessage('break;');
        let breakpoints: DebugBreakpoint[] = args.lines.map(line => {
            return {
                file: file,
                line: line,
                verified: true
            };
        });
        this.breakpoints.set(file, breakpoints);

        this.sendBreakpoints();
        // TODO wait for MSG_LISTING because it contains the valid position for breakpoints (verified)

        response.body = { breakpoints };
        this.sendResponse(response);
        verbose('SetBreakPointsResponse');
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        verbose('ThreadsRequest');
        // if (this.debugState.exited) {
        //     // If the program exits very quickly, the initial threadsRequest will complete after it has exited.
        //     // A TerminatedEvent has already been sent. Ignore the err returned in this case.
        //     response.body = { threads: [] };
        //     return this.sendResponse(response);
        // }
        let threads = [new Thread(0, 'abl-main')];
        response.body = { threads: threads };
        this.sendResponse(response);
        verbose('ThreadsResponse', threads);
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        verbose('StackTraceRequest');
        this.ablDebugger.showStack().then(msg => {
            let stackFrames = msg.args.map((location, i) => {
                let filename = path.basename(location[4]);
                let localPath = this.convertRemotePathToLocal(location[5]);
                return new StackFrame(
                    i,
                    location[6],
                    new Source(
                        filename,
                        localPath,
                    ),
                    parseInt(location[8])
                );
            });
            stackFrames.reverse();
            response.body = { stackFrames };
            this.sendResponse(response);
            verbose('StackTraceResponse');
        }).catch(reason => {
            logError('Failed to produce stack trace!');
            return this.sendErrorResponse(response, 2004, 'Unable to produce stack trace: "{e}"', { e: reason.toString() });
        });

    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        verbose('ScopesRequest');
        // list variables
        // list buffers
        // list parameters
        // list temp-table
        // list datasets
        this.ablDebugger.listParameters().then(msgParameters => {
            this.ablDebugger.listVariables().then(msgVariables => {
                this.ablDebugger.listTempTables().then(msgTempTables => {
                    let parameters: DebugVariable[] = msgParameters.args.map(p => {
                        let displayName = p[1];
                        if (p[0] === 'OUTPUT') {
                            displayName = '\u2190' + displayName;
                        } else if (p[0] === 'INPUT') {
                            displayName = '\u2192' + displayName;
                        } else if (p[0] === 'INPUT-OUTPUT') {
                            displayName = '\u2194' + displayName;
                        }
                        return {
                            name: displayName,
                            type: p[2],
                            kind: AblReflectKind.Parameter,
                            value: p[5],
                            children: []
                        };
                    });

                    let variables: DebugVariable[] = msgVariables.args.map(p => {
                        return {
                            name: p[0],
                            type: p[1],
                            kind: AblReflectKind.Variable,
                            value: p[6],
                            children: []
                        };
                    });
                    let tempTables: DebugVariable[] = msgTempTables.args.map(p => {
                        return {
                            name: p[0],
                            type: p[1],
                            kind: AblReflectKind.TempTable,
                            value: '',
                            children: []
                        };
                    });

                    let scopes = new Array<Scope>();
                    scopes.push(new Scope('Local', this._variableHandles.create({
                        name: 'Local',
                        type: '',
                        kind: 0,
                        value: '',
                        children: parameters.concat(variables).concat(tempTables)
                    }), false));
                    // scopes.push(new Scope('Parameters', this._variableHandles.create({
                    //     name: 'Parameters',
                    //     type: '',
                    //     kind: 0,
                    //     value: '',
                    //     children: parameters
                    // }), false));
                    // scopes.push(new Scope('Variables', this._variableHandles.create({
                    //     name: 'Variables',
                    //     type: '',
                    //     kind: 0,
                    //     value: '',
                    //     children: variables
                    // }), false));
                    // scopes.push(new Scope('TempTables', this._variableHandles.create({
                    //     name: 'TempTables',
                    //     type: '',
                    //     kind: 0,
                    //     value: '',
                    //     children: tempTables
                    // }), true));
                    response.body = { scopes };
                    this.sendResponse(response);
                    verbose('ScopesResponse');
                });
            });
        }).catch(reason => {
            logError('Unable to list vars.');
            return this.sendErrorResponse(response, 2004, 'Unable to list vars: "{e}"', { e: reason.toString() });
        });
    }

    private convertDebugVariableToProtocolVariable(v: DebugVariable, i: number): { result: string; variablesReference: number; } {
        // if (v.kind === GoReflectKind.UnsafePointer) {
        // 	return {
        // 		result: `unsafe.Pointer(0x${v.children[0].addr.toString(16)})`,
        // 		variablesReference: 0
        // 	};
        // } else if (v.kind === GoReflectKind.Ptr) {
        // 	if (v.children[0].addr === 0) {
        // 		return {
        // 			result: 'nil <' + v.type + '>',
        // 			variablesReference: 0
        // 		};
        // 	} else if (v.children[0].type === 'void') {
        // 		return {
        // 			result: 'void',
        // 			variablesReference: 0
        // 		};
        // 	} else {
        // 		return {
        // 			result: '<' + v.type + '>',
        // 			variablesReference: v.children[0].children.length > 0 ? this._variableHandles.create(v.children[0]) : 0
        // 		};
        // 	}
        // } else if (v.kind === GoReflectKind.Slice) {
        // 	return {
        // 		result: '<' + v.type + '> (length: ' + v.len + ', cap: ' + v.cap + ')',
        // 		variablesReference: this._variableHandles.create(v)
        // 	};
        // } else if (v.kind === GoReflectKind.Array) {
        // 	return {
        // 		result: '<' + v.type + '>',
        // 		variablesReference: this._variableHandles.create(v)
        // 	};
        // } else if (v.kind === GoReflectKind.String) {
        // 	let val = v.value;
        // 	if (v.value && v.value.length < v.len) {
        // 		val += `...+${v.len - v.value.length} more`;
        // 	}
        // 	return {
        // 		result: v.unreadable ? ('<' + v.unreadable + '>') : ('"' + val + '"'),
        // 		variablesReference: 0
        // 	};
        // } else {
        // 	return {
        // 		result: v.value || ('<' + v.type + '>'),
        // 		variablesReference: v.children.length > 0 ? this._variableHandles.create(v) : 0
        // 	};
        // }
        // if (v.kind === AblReflectKind.Variable && v.type === 'CHARACTER') {
        if (v.type === 'CHARACTER') {
            let val = v.value.replace('\n', '');
            let quoteIdx = val.indexOf('"');
            if (quoteIdx > 0) {
                let length = parseInt(val.substring(0, quoteIdx));
                val = val.substr(quoteIdx);
            }
            return {
                result: val,
                variablesReference: 0
            };
        } else if (v.kind === AblReflectKind.TempTable) {
            return {
                result: '<' + v.type + '>',
                variablesReference: this._variableHandles.create(v)
            };
        } else {
            return {
                result: v.value || ('<' + v.type + '>'),
                variablesReference: v.children.length > 0 ? this._variableHandles.create(v) : 0
            };
        }
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        verbose('VariablesRequest');
        let vari = this._variableHandles.get(args.variablesReference);
        let variables;
        if (vari.kind === AblReflectKind.TempTable) {

            this.ablDebugger.getFields(vari.name).then(msgFields => {
                let fields = msgFields.args.slice(1);
                variables = fields.map(f => {
                    return {
                        name: f[0],
                        type: f[1],
                        kind: AblReflectKind.Variable,
                        value: f[3],
                        children: []
                    };
                }).map((f, i) => {
                    let { result, variablesReference } = this.convertDebugVariableToProtocolVariable(f, i);
                    return {
                        name: f.name,
                        value: result,
                        variablesReference
                    };
                });
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
                // verbose('VariablesResponse', JSON.stringify(variables, null, ' '));
            });
        } else {

            // if (vari.kind === GoReflectKind.Array || vari.kind === GoReflectKind.Slice || vari.kind === GoReflectKind.Map) {
            //     variables = vari.children.map((v, i) => {
            //         let { result, variablesReference } = this.convertDebugVariableToProtocolVariable(v, i);
            //         return {
            //             name: '[' + i + ']',
            //             value: result,
            //             variablesReference
            //         };
            //     });
            // } else {
            //     variables = vari.children.map((v, i) => {
            //         let { result, variablesReference } = this.convertDebugVariableToProtocolVariable(v, i);
            //         return {
            //             name: v.name,
            //             value: result,
            //             variablesReference
            //         };
            //     });
            // }
            variables = vari.children.map((v, i) => {
                let { result, variablesReference } = this.convertDebugVariableToProtocolVariable(v, i);
                return {
                    name: v.name,
                    value: result,
                    variablesReference
                };
            });
            response.body = { variables };
            this.sendResponse(response);
            verbose('VariablesResponse');
            // verbose('VariablesResponse', JSON.stringify(variables, null, ' '));
        }
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse): void {
        verbose('ContinueRequest');
        this.ablDebugger.sendMessage('cont');
        this.sendResponse(response);
        verbose('ContinueResponse');
    }

    protected nextRequest(response: DebugProtocol.NextResponse): void {
        verbose('NextRequest');
        this.ablDebugger.sendMessage('next');
        this.sendResponse(response);
        verbose('NextResponse');
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse): void {
        verbose('StepInRequest');
        this.ablDebugger.sendMessage('step');
        this.sendResponse(response);
        verbose('StepInResponse');
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse): void {
        verbose('StepOutRequest');
        this.ablDebugger.sendMessage('step-out');
        this.sendResponse(response);
        verbose('StepOutResponse');
    }

    protected pauseRequest(response: DebugProtocol.PauseResponse): void {
        verbose('PauseRequest');
        this.ablDebugger.sendMessage('interrupt');
        this.sendResponse(response);
        verbose('PauseResponse');
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        verbose('EvaluateRequest');
        if (args.context === 'watch' || args.context === 'hover') {
            // keep track of the watchpoint we've already set
            if (!this.watchpointExpressions.has(args.expression)) {
                this.ablDebugger.sendMessage(`watch ${args.expression}`);
                this.watchpointExpressions.add(args.expression);
            }
            this.ablDebugger.sendMessageWithResponse('show watch', 'MSG_WATCHPOINTS').then(msg => {
                // MSG_WATCHPOINTS;.1;String(varIntGlobal);UNKNOWN;0;R;** Unavailable **;.2;varIntGlobal;INTEGER;0;RW;42;.3;varIntGlobal;INTEGER;0;RW;42;.4;varIntGlobal;INTEGER;0;RW;42;.5;varCharGlobal;CHARACTER;0;RW;.7"youpi";.6;varCharGlobal;CHARACTER;0;RW;.7"youpi";.7;varCharGlobal;CHARACTER;0;RW;.7"youpi";.8;varCharGlobal;CHARACTER;0;RW;.7"youpi";..
                // 0: index
                // 1: expression
                // 2: type
                // 3: 0 ??
                // 4: R/RW
                // 5: value
                let watchpoint = msg.args.find(wp => {
                    return wp[1] === args.expression;
                });
                if (watchpoint) {
                    let variable: DebugVariable = {
                        kind: AblReflectKind.Variable,
                        children: [],
                        name: watchpoint[1],
                        type: watchpoint[2],
                        value: watchpoint[5]
                    };
                    response.body = this.convertDebugVariableToProtocolVariable(variable, 0);
                }
                this.sendResponse(response);
                verbose('EvaluateResponse');
            });
        } else {
            this.sendResponse(response);
            verbose('EvaluateResponse');
        }
    }

    protected convertRemotePathToLocal(remotePath: string): string {
        if (this.localRoot) {
            remotePath = normalizePath(remotePath);
            remotePath.replace(this.remoteRoot, '');
            remotePath = path.join(this.localRoot, remotePath);
        }
        return remotePath;
    }
    protected convertLocalPathToRemote(localPath: string): string {
        if (this.localRoot) {
            localPath = normalizePath(localPath);
            localPath = localPath.replace(this.localRoot, this.remoteRoot);
        }
        return localPath;
    }
}

DebugSession.run(AblDebugSession);
