# OpenEdge ABL language support for Visual Studio Code
This extension provides rich OpenEdge ABL language support for Visual Studio Code. Now you can write and run ABL procedures using the excellent IDE-like interface that Visual Studio Code provides.

## What's new
* 0.7.6
    - Fix syntax highlight issues
* 0.7.5
    - Fix workspaceRoot on parameterFiles
    - Optional configuration: workingDirectory
* 0.7.4
    - Fix multiple syntax highlight issues
* 0.7.3
    - Fix remote/local path mapping while remote debugging
* 0.7.2
    - Fix syntax highlight issue #11
* 0.7.1
    - Fix syntax highlight issue chriscamicas/abl-tmlanguage#2
* 0.7
    - Fix syntax highlight issue #9
    - Migrate to DebugConfigurationProvider #10
    - Integration with ABLUnit Test framework
* 0.6.4
    - Highlight for (scoped|global)-define and analyze-(suspend|resume)
* 0.6.3
    - Fix syntax highlight issue #6
* 0.6.2
    - Fix .openedge.json won't load
* 0.6.1
    - Fix debugger launch failed
* 0.6.0
    - Integrated ABL debugger
    - Fix minor syntax highlighting flaw

## Features

* Syntax highlighting
* Code snippets
* Syntax checking
* Run
* Debugger

## Command
* Check Syntax
* Run current file
* Open DataDictionary external Tool

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
    "proPathMode": "append", // overwrite, prepend
    "parameterFiles": [ // -pf
        "default.pf"
    ]
}
```

`proPath` and `workingDirectory` are optional. Default values:
- `proPath`: workspaceRoot (of VSCode)
- `workingDirectory`: folder of active source code

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

## License
Licensed under the [MIT](LICENSE) License.
