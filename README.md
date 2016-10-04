# OpenEdge ABL language support for VS Code
This is a language support for Visual Studio Code. I have decided to put this up and make it public as there is no such extension.
- This repository: https://github.com/ZaphyrVonGenevese/vscode-abl
- Grammar repository: https://github.com/ZaphyrVonGenevese/openedge-abl-syntax

## Syntax definition is not in this repository
For issues and other things regarding syntax definition, see
 - https://github.com/ZaphyrVonGenevese/openedge-abl-syntax

## Things that do NOT work
- Abbreviations are not fully supported
    - only the shortest and longest form of the keyword is now supported
    - e.g. `char` and `character` work, but `charac` does not
- Grammar scopes are not supported right now, but will be; see [Priorities](#priorities)

## Priorities
- My first priority is fixing issues
- My second priority is adding missing keywords, support for abbreviations and other
- When those two points are done, I plan to completely rewrite the grammar to support scopes and other features of `TextMate` grammar

## What you should know about me
- I do not use OOP aspects of ABL, so there may be some gaps
- This is my first `TextMate` language grammar
- This is my first opensource project

That being said, I am super enthusiasthic helping the OpenEdge community. Any suggestions, help, feedback, advice, and critic is appreciated.