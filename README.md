# OpenEdge ABL language support for Visual Studio Code
This extension provides rich OpenEdge ABL language support for Visual Studio Code. Now you can write and run ABL procedures using the excellent IDE-like interface that Visual Studio Code provides.

## What's new
* Better syntax highlighting (parameter vs variable). I recommand the Monokai theme.

## Features

* Syntax highlighting
* Code snippets
* Syntax checking
* Run

## Command
* Check Syntax
* Run current file
* Open DataDictionary external Tool

## Config file
You can create a local config file for your project named `.openedge.json`, with the following structure:
```JSON
{
    "proPath": [
        "",
        ""
    ],
    "proPathMode": "append", // overwrite, prepend
    "startupProcedure": "startup.p",
    "startupProcedureParam": "file.ini", // -param
    "parameterFiles": [ // -pf
        "default.pf"
    ]
}
```
Path for startupProcedure and parameterFiles are relative to your workspace root.

# Greetings
Largely inspired by ZaphyrVonGenevese work (https://github.com/ZaphyrVonGenevese/vscode-abl).
Also inspired by vscode-go and vscode-rust extensions.

## License


Licensed under the [MIT](LICENSE) License.