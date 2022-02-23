import { spawn } from 'child_process';
import { Socket } from 'net';
import * as path from 'path';
import { LoggingDebugSession, Logger, logger, Handles, InitializedEvent, OutputEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol'
import { createProArgs, setupEnvironmentVariables } from '../shared/ablPath';
import { convertDataToDebuggerMessage, DebugMessage, DebugMessageArray, DebugMessageClassInfo, DebugMessageListing, DebugMessageVariables } from './messages';
import { AblDebugKind, DebugVariable } from './variables';
import { getProject } from '../extension';
import * as minimatch from 'minimatch';

const DEFAULT_DEBUG_PORT = 3099;

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

interface SourceMap {
    [key: string]: string;
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
    sourceMap?: SourceMap;
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
    return args.map((arg) => {
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

export class AblDebugger {
    public sendSocket: Socket;
    public recvSocket: Socket;
    public connection: Promise<void>;

    public msgQueue: string[];
    public onstdout: (str: string) => void;
    public onstderr: (str: string) => void;
    public onClose: () => void;
    public onMessage: (msg: DebugMessage) => void;
    public timeout = 20000;

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

    public errorHandler(err: any) {
        log(err);
    }
    public dataHandler(data: any) {
        if (!this.onMessage) { return; }

        convertDataToDebuggerMessage(data).forEach((msg) => {
            this.onMessage(msg);
        });
    }

    public closeHandler() {
        log('Connection closed');
        if (this.onClose) { this.onClose(); }
    }

    public sendMessage(msg: string) {
        verbose(`send(${msg})`);
        msg += '\0'; // ending

        // queue for later
        this.msgQueue.push(msg);
        if (this.msgQueue.length === 1) {
            this.writeMessage(msg);
        }
    }

    public writeMessage(msg: string) {
        this.sendSocket.write(msg, () => {
            // remove the message we've just sent
            this.msgQueue.shift();
            // if there is more, send the rest of them
            if (this.msgQueue.length > 0) {
                this.writeMessage(this.msgQueue[0]);
            }
        });
    }

    public close() {
        // TODO restore the remote process state, and send 'continue'
        this.sendSocket.destroy();
        this.recvSocket.destroy();
    }

    public showStack(): Promise<DebugMessage> {
        return this.sendMessageWithResponse<DebugMessage>('show stack-ide', 'STACK-IDE');
    }

    public listVariables(): Promise<DebugMessageVariables> {
        return this.sendMessageWithResponse<DebugMessageVariables>('list variables', 'MSG_VARIABLES');
    }
    public listParameters(): Promise<DebugMessageVariables> {
        return this.sendMessageWithResponse<DebugMessageVariables>('list parameters', 'MSG_PARAMETERS');
    }
    public listTempTables(): Promise<DebugMessage> {
        return this.sendMessageWithResponse<DebugMessage>('list temp-tables', 'MSG_TEMPTABLES');
    }
    public getFields(tempTableName: string): Promise<DebugMessage> {
        return this.sendMessageWithResponse(`GET-FIELDS ${tempTableName}`, 'MSG_FIELDS');
    }
    public getClassInfo(className: string): Promise<DebugMessageClassInfo> {
        return this.sendMessageWithResponse<DebugMessageClassInfo>(`GET-CLASS-INFO ${className}`, 'MSG_CLASSINFO', 'MSG_CLASSINFO_ERR');
    }
    public getArray(arrayName: string): Promise<DebugMessageArray> {
        return this.sendMessageWithResponse<DebugMessageArray>(`GET-ARRAY ${arrayName}`, 'MSG_ARRAY');
    }

    public sendMessageWithResponse<T>(messageToSend: string, respCode: string, respCodeError?: string): Promise<T> {
        return new Promise((resolve, reject) => {
            let response = null;

            const self = this;
            const respCallback = (data) => {
                response = convertDataToDebuggerMessage(data).filter((message) => message.code === respCode || (respCodeError && (message.code === respCodeError)));
                if (response.length > 0) {
                    if (response[0].code === respCode) {
                        resolve(response[0]);
                    } else {
                        reject(response[0]);
                    }
                    self.recvSocket.removeListener('data', respCallback);
                }
            };
            this.sendMessage(messageToSend);
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

// tslint:disable-next-line: max-classes-per-file
class AblDebugSession extends LoggingDebugSession {

    private variableHandles: Handles<DebugVariable>;
    private breakpoints: Map<string, DebugBreakpoint[]>;
    private watchpointExpressions: Set<string>;
    private threads: Set<number>;
    private localRoot: string;
    private remoteRoot: string;
    private sourceMap: SourceMap;
    private debugState: DebuggerState;
    private ablDebugger: AblDebugger;

    public constructor(debuggerLinesStartAt1: boolean, isServer: boolean = false) {
        super('', debuggerLinesStartAt1, isServer);
        this.variableHandles = new Handles<DebugVariable>();
        this.threads = new Set<number>();
        this.debugState = null;
        this.ablDebugger = null;
        this.breakpoints = new Map<string, DebugBreakpoint[]>();
        this.watchpointExpressions = new Set<string>();
        this.localRoot = '';
        this.remoteRoot = '';
        this.sourceMap = {};

        // const logPath = path.join(os.tmpdir(), 'vscode-abl-debug.txt');
        // logger.init((e) => this.sendEvent(e), logPath, isServer);
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
            Logger.LogLevel.Verbose :
            args.trace ? Logger.LogLevel.Log :
                Logger.LogLevel.Error;
        logger.setup(logLevel);
        if (args.remoteRoot) {
            this.remoteRoot = normalizePath(args.remoteRoot);
        }
        if (args.localRoot) {
            this.localRoot = normalizePath(args.localRoot);
        }
        if (args.sourceMap) {
            this.sourceMap = args.sourceMap;
        }

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
            } else if (msg.code === 'MSG_ENTER') {
                this.sendEvent(new StoppedEvent('breakpoint', 0));

                // At first stop, the AblDebugger clear its breakpoints, we should re-send them
                this.sendBreakpoints();
                verbose('StoppedEvent("breakpoint")');
            } else if (msg.code === 'MSG_LISTING') {
                const msgListing = msg as DebugMessageListing;
                // TODO send BreakpointEvent with verified breakpoints
                // is that really needed ???

                // this.sendEvent(new BreakpointEvent('new', bp));
                // this.sendEvent(new BreakpointEvent('changed', bp));
                // this.sendEvent(new BreakpointEvent('update', bp));

                // starting with msg.args[0][4]
                verbose(`${JSON.stringify(msgListing)}`);
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

        const filename = args.program;
        const cwd = args.cwd || path.dirname(filename);

        this.localRoot = normalizePath(cwd);
        args.port = args.port || DEFAULT_DEBUG_PORT;

        const oeConfig = getProject(filename);
        // const configFileName = path.join(cwd, OPENEDGE_CONFIG_FILENAME);
        // loadConfigFile(configFileName).then((oeConfig) => {
            const cmd = oeConfig.getExecutable(false)
            const env = setupEnvironmentVariables(process.env, oeConfig, cwd);
            env.VSABL_STARTUP_PROGRAM = filename;
            const proArgs = createProArgs({
                batchMode: true,
                debugPort: args.port,
                param: args.args ? args.args.join(' ') : '',
                parameterFiles: oeConfig.parameterFiles,
                startupProcedure: path.join(__dirname, '../abl-src/run-debug.p'),
            });

            // prepareProArguments(path.join(__dirname, '../abl-src/run-debug.p'), filename, true, true).then(proArgs => {
            const spawnOptions = { env, cwd };
            // spawnOptions.stdio = 'pipe';
            const spawnedProcess = spawn(cmd, proArgs, spawnOptions);
            spawnedProcess.stderr.on('data', (chunk) => {
                const str = chunk.toString();
                this.sendEvent(new OutputEvent(str, 'stderr'));
            });
            spawnedProcess.stdout.on('data', (chunk) => {
                const str = chunk.toString();
                this.sendEvent(new OutputEvent(str, 'stdout'));
            });
            spawnedProcess.on('close', (code) => {
                this.sendEvent(new TerminatedEvent());
                logError('Process exiting with code: ' + code);
            });
            spawnedProcess.on('error', (err) => {
                logError('Process exiting with code: ' + err);
            });

            const attachArgs = {
                address: 'localhost',
                ...args,
            };
            this.initializeDebugger(attachArgs).then(() => {
                // Send a key, because the spawned process is waiting for the debugger to connect
                spawnedProcess.stdin.write('\x0D');
                if (args.stopOnEntry) {
                    this.ablDebugger.sendMessage('interrupt');
                } else {
                    this.ablDebugger.sendMessage('cont');
                }
                // if (typeof args.stopOnEntry === 'boolean' && args.stopOnEntry === false) {
                //     this.ablDebugger.sendMessage('cont');
                // } else {
                //     this.ablDebugger.sendMessage('interrupt');
                // }
                this.sendResponse(response);
                verbose('LaunchResponse');
            }, (err) => {
                this.sendErrorResponse(response, 3000, 'Failed to continue: "{e}"', { e: err.toString() });
            });
        /* }, (err) => {
            this.sendErrorResponse(response, 3000, 'Failed to load config file {f}: "{e}"', {
                e: err.toString(),
                f: configFileName,
            });
        }); */
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): void {
        verbose('AttachRequest');
        args.port = args.port || DEFAULT_DEBUG_PORT;
        this.initializeDebugger(args).then(() => {
            this.sendResponse(response);
            verbose('AttachResponse');
        }, (err) => {
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
                breakpoints.forEach((bp) => {
                    msg += `B;${bpIdx};E;${bp.file};${bp.line}; ;`;
                    bpIdx += 1;
                });
            });
            // msg += `E;${bpIdx + 1};E;-2;E;${bpIdx + 2};E;-1`; // Break on all errors
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
        const file = this.convertLocalPathToRemote(args.source.path);

        if (!this.breakpoints.get(file)) {
            this.breakpoints.set(file, []);
        }
        // no need to clear all breakpoints, the 'break' message sends all active breakpoints everytime
        // this.ablDebugger.sendMessage('break;');
        const breakpoints: DebugBreakpoint[] = args.lines.map((line) => {
            return {
                file,
                line,
                verified: true,
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
        const threads = [new Thread(0, 'abl-main')];
        response.body = { threads };
        this.sendResponse(response);
        verbose('ThreadsResponse', threads);
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        verbose('StackTraceRequest');
        this.ablDebugger.showStack().then((msg) => {
            const stackFrames = msg.args.map((location, i) => {
                const filename = path.basename(location[4]);
                const localPath = this.convertRemotePathToLocal(location[4]);
                return new StackFrame(
                    i,
                    location[6],
                    new Source(
                        filename,
                        localPath,
                    ),
                    parseInt(location[8], 10),
                );
            });
            stackFrames.reverse();
            response.body = { stackFrames };
            this.sendResponse(response);
            verbose('StackTraceResponse');
        }).catch((reason) => {
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
        this.ablDebugger.listParameters().then((msgParameters) => {
            this.ablDebugger.listVariables().then((msgVariables) => {
                this.ablDebugger.listTempTables().then((msgTempTables) => {
                    const parameters: DebugVariable[] = msgParameters.variables;
                    const variables: DebugVariable[] = msgVariables.variables;
                    const tempTables: DebugVariable[] = msgTempTables.args.map((p) => {
                        return {
                            children: [],
                            kind: AblDebugKind.TempTable,
                            name: p[0],
                            type: p[1],
                            value: '',
                        };
                    });

                    const scopes = new Array<Scope>();
                    scopes.push(new Scope('Local', this.variableHandles.create({
                        children: parameters.concat(variables).concat(tempTables),
                        kind: 0,
                        name: 'Local',
                        type: '',
                        value: '',
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
        }).catch((reason) => {
            logError('Unable to list vars.');
            return this.sendErrorResponse(response, 2004, 'Unable to list vars: "{e}"', { e: reason.toString() });
        });
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        verbose('VariablesRequest');
        const vari = this.variableHandles.get(args.variablesReference);
        let variables;
        if (vari.kind === AblDebugKind.TempTable) {

            this.ablDebugger.getFields(vari.name).then((msgFields) => {
                const fields = msgFields.args.slice(1);
                variables = fields.map((f) => {
                    return {
                        children: [],
                        kind: AblDebugKind.Variable,
                        name: f[0],
                        type: f[1],
                        value: f[3],
                    };
                }).map((f, i) => {
                    const { result, variablesReference } = this.convertDebugVariableToProtocolVariable(f, i);
                    return {
                        name: f.name,
                        value: result,
                        variablesReference,
                    };
                });
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
                // verbose('VariablesResponse', JSON.stringify(variables, null, ' '));
            });
        } else if (vari.kind === AblDebugKind.Class) {
            let classInfoName = vari.name;
            let parentRef = vari.parentReference;
            // We should find the full path to the property ex: 'class1:propertyA:propertyB'
            while (parentRef) {
                const parentVar = this.variableHandles.get(parentRef);
                if (parentVar) {
                    if (parentVar.kind === AblDebugKind.Class) {
                        classInfoName = parentVar.name + ':' + classInfoName;
                    }
                    parentRef = parentVar.parentReference;
                } else {
                    parentRef = null;
                }
            }
            this.ablDebugger.getClassInfo(classInfoName).then((msgClassInfo) => {
                const baseClass = msgClassInfo.baseClass;
                const fields = msgClassInfo.properties;
                if (baseClass) {
                    const varBaseClass: DebugVariable = {
                        children: [],
                        kind: AblDebugKind.BaseClass,
                        name: '<base>',
                        parentReference: args.variablesReference,
                        type: baseClass,
                        value: baseClass,
                    };
                    fields.unshift(varBaseClass);
                }

                variables = fields.map((f, i) => {
                    f.parentReference = args.variablesReference;
                    const { result, variablesReference } = this.convertDebugVariableToProtocolVariable(f, i);
                    return {
                        name: f.name,
                        value: result,
                        variablesReference,
                    };
                });
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
            }, (msgErr) => {
                variables = [{ name: 'error', value: msgErr.args[0][0], variablesReference: 0 }];
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
            });
        } else if (vari.kind === AblDebugKind.Array) {
            // TODO if in a class, compute full name to property
            this.ablDebugger.getArray(vari.name).then((msgArray) => {
                const values = msgArray.values;
                if (values.length > 0) {
                    variables = values.map((v, i) => {
                        const debugVariable: DebugVariable = {
                            children: [],
                            kind: AblDebugKind.Variable,
                            name: `${i + 1}`, // ABL array indice starts at 1
                            type: vari.type,
                            value: v,
                        };
                        const { result, variablesReference } = this.convertDebugVariableToProtocolVariable(debugVariable, i);
                        return {
                            name: debugVariable.name,
                            value: result,
                            variablesReference,
                        };
                    });
                }
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
            }, (msgErr) => {
                variables = [{ name: 'error', value: msgErr.args[0][0], variablesReference: 0 }];
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
            });
        } else if (vari.kind === AblDebugKind.BaseClass) {
            let depth = 0;
            let classInfoName = '';
            let parentRef = vari.parentReference;
            // We should find the full path to the property ex: 'class1:propertyA:propertyB'
            while (parentRef) {
                const parentVar = this.variableHandles.get(parentRef);
                if (parentVar) {
                    if (parentVar.kind !== AblDebugKind.BaseClass) {
                        if (classInfoName !== '') {
                            classInfoName = parentVar.name + ':' + classInfoName;
                        } else { classInfoName = parentVar.name; }
                    }
                    depth += 1;
                    parentRef = parentVar.parentReference;
                } else {
                    parentRef = null;
                }
            }
            this.ablDebugger.getClassInfo(`${classInfoName} DEPTH ${depth}`).then((msgClassInfo) => {
                const baseClass = msgClassInfo.baseClass;
                const fields = msgClassInfo.properties;
                if (baseClass) {
                    const varBaseClass: DebugVariable = {
                        children: [],
                        kind: AblDebugKind.BaseClass,
                        name: '<base>',
                        parentReference: args.variablesReference,
                        type: baseClass,
                        value: baseClass,
                    };
                    fields.unshift(varBaseClass);
                }

                variables = fields.map((f, i) => {
                    f.parentReference = args.variablesReference;
                    const { result, variablesReference } = this.convertDebugVariableToProtocolVariable(f, i);
                    return {
                        name: f.name,
                        value: result,
                        variablesReference,
                    };
                });
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
            }, (msgErr) => {
                variables = [{ name: 'error', value: msgErr.args[0][0], variablesReference: 0 }];
                response.body = { variables };
                this.sendResponse(response);
                verbose('VariablesResponse');
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
                const { result, variablesReference } = this.convertDebugVariableToProtocolVariable(v, i);
                return {
                    name: v.name,
                    value: result,
                    variablesReference,
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
            this.ablDebugger.sendMessageWithResponse<DebugMessage>('show watch', 'MSG_WATCHPOINTS').then((msg) => {
                // MSG_WATCHPOINTS;.1;String(varIntGlobal);UNKNOWN;0;R;** Unavailable **;.2;varIntGlobal;INTEGER;0;RW;42;.3;varIntGlobal;INTEGER;0;RW;42;.4;varIntGlobal;INTEGER;0;RW;42;.5;varCharGlobal;CHARACTER;0;RW;.7"youpi";.6;varCharGlobal;CHARACTER;0;RW;.7"youpi";.7;varCharGlobal;CHARACTER;0;RW;.7"youpi";.8;varCharGlobal;CHARACTER;0;RW;.7"youpi";..
                // 0: index
                // 1: expression
                // 2: type
                // 3: 0 ??
                // 4: R/RW
                // 5: value
                const watchpoint = msg.args.find((wp) => {
                    return wp[1] === args.expression;
                });
                if (watchpoint) {
                    const variable: DebugVariable = {
                        children: [],
                        kind: AblDebugKind.Variable,
                        name: watchpoint[1],
                        type: watchpoint[2],
                        value: watchpoint[5],
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
        if (this.sourceMap) {
            const entries = Object.keys(this.sourceMap);
            const entry = entries.find((value) => minimatch(remotePath, value));
            if (entry) {
                const baseRemote = entry.replace(/\*/g, '');
                const baseLocal = this.sourceMap[entry].replace(/\*/g, '');
                remotePath = remotePath.replace(baseRemote, baseLocal);
                return remotePath;
            }
        }
        if (this.localRoot && this.remoteRoot) {
            remotePath = normalizePath(remotePath);
            remotePath = remotePath.replace(this.remoteRoot, '');
            remotePath = path.join(this.localRoot, remotePath);
        }
        return remotePath;
    }

    protected convertLocalPathToRemote(localPath: string): string {
        if (this.localRoot && this.remoteRoot) {
            localPath = normalizePath(localPath);
            localPath = localPath.replace(this.localRoot, this.remoteRoot);
        }
        return localPath;
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
        if (v.kind === AblDebugKind.Array) {
            return {
                result: v.type + v.value,
                variablesReference: this.variableHandles.create(v),
            };
        } else if (v.kind === AblDebugKind.TempTable) {
            return {
                result: '<' + v.type + '>',
                variablesReference: this.variableHandles.create(v),
            };
        } else if (v.kind === AblDebugKind.Class || v.kind === AblDebugKind.BaseClass) {
            if (v.value !== '?') {
                return {
                    result: v.value,
                    variablesReference: this.variableHandles.create(v),
                };
            }
            return {
                result: v.value,
                variablesReference: 0,
            };
        } else if (v.type === 'CHARACTER' || v.type === 'LONGCHAR') {
            // let val = v.value.replace(/\n/g, '');
            let val = v.value;
            const quoteIdx = val.indexOf('"');
            if (quoteIdx > 0) {
                // let length = parseInt(val.substring(0, quoteIdx));
                val = val.substr(quoteIdx);
            }
            return {
                result: val,
                variablesReference: 0,
            };
        } else {
            return {
                result: v.value || ('<' + v.type + '>'),
                variablesReference: v.children.length > 0 ? this.variableHandles.create(v) : 0,
            };
        }
    }
}

LoggingDebugSession.run(AblDebugSession);
