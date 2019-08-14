# OpenEdge ABL language support for Visual Studio Code
This extension provides rich OpenEdge ABL language support for Visual Studio Code. Now you can write and run ABL procedures using the excellent IDE-like interface that Visual Studio Code provides.

## Features

* Syntax highlighting
* Syntax checking
* Run
* Debugger

![features demo](./docs/images/demo.gif "Demo")

![debugger demo](./docs/images/debug.gif "Debugger")

## Using
### Prerequisites
You need to have a local OpenEdge installation, and the `DLC` environment variable should point to the installation directory (usually `C:\Progress\OpenEdge`).
### Config file
You can create a local config file for your project named `.openedge.json`, with the following structure:
```JSON
{
    "workingDirectory": "${workspaceFolder}\\Home",
    "proPath": [
        "c:\\temp",
        "${workspaceFolder}"
    ],
    "dlc": "C:/Progress/OpenEdge", //optional override
    "proPathMode": "append", // overwrite, prepend
    "parameterFiles": [ // -pf
        "default.pf"
    ],
    "startupProcedure" : "${workspaceFolder}/vsc-oe-startup.p"
}
```

`dlc`, `startupProcedure`, `proPath` and `workingDirectory` are optional. Default values:
- `dlc`: uses environment variable $DLC
- `startupProcedure`: ''
- `proPath`: workspaceRoot (of VSCode)
- `workingDirectory`: folder of active source code

#### Parameter "startupProcedure"
The optional Startup Procedure for OpenEdge can be used to execute 4GL code before a check syntax/debug/run operation. Can be used to create Database aliases or instantiate Singleton Classes. The Procedure is executed everytime the IDE starts a check syntax/debug/run operation.

### Debugger
You can use the debugger to connect to a remote running process (assuming it is debug-ready), or run locally with debugger.

You first need to create the launch configuration in your `launch.json` file, 2 templates are available, one for launch and the other for attach).

```JSON
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Attach to process",
            "type": "abl",
            "request": "attach",
            "address": "192.168.1.100",
            "port": 3099
        }
    ]
}
```

To attach to a remote process, it needs to be [debug-ready](https://documentation.progress.com/output/ua/OpenEdge_latest/index.html#page/asaps/attaching-the-debugger-to-an-appserver-session.html).
The easiest way to achieve that is to add `-debugReady 3099` to the startup parameters (`.pf` file) of your application server.

The debugger supports basic features
- step-over, step-into, step-out, continue, suspend
- breakpoints
- display stack
- display variables
- watch/evaluate basic expressions

You can map remote path to local path (1 to 1) using `localRoot` and `remoteRoot`. This is useful when debugging a remote target, even more if it only executes r-code.
`localRoot` is usually your `${workspaceRoot}` (current directory opened in VSCode). `remoteRoot` may remains empty (or missing), in this particular case, the remote path is relative, and resolved via the `PROPATH` by the remote.


You can also map different remote path to local path via source mapping `sourceMap`. This is useful if you don't have all the source code in a unique project (ex dependencies).

### Unit tests
Based upon the ABLUnit framework (need to be installed locally), you can specify launch parameters to find and execute test files
```
{
    "test": {
        "files":[
            "tests/*.test.p"
        ],
        "beforeEach": {
            "cmd": "%ProgramFiles%\\Git\\bin\\sh.exe",
            "args": [
                "-c",
                "echo starting"
            ]
        },
        "afterEach": {
            "cmd": "%ProgramFiles%\\Git\\bin\\sh.exe",
            "args": [
                "-c",
                "echo done"
            ]
        }
    }
}
```

## Greetings
Largely inspired by ZaphyrVonGenevese work (https://github.com/ZaphyrVonGenevese/vscode-abl).
Also inspired by vscode-go and vscode-rust extensions.

Thanks to all the contributors: mscheblein

## License
Licensed under the [MIT](LICENSE) License.
