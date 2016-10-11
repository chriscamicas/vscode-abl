# OpenEdge ABL language support for VS Code
This is a language support for Visual Studio Code. I have decided to put this up and make it public as there is no such extension.
- This repository: https://github.com/ZaphyrVonGenevese/vscode-abl
- Grammar repository: https://github.com/ZaphyrVonGenevese/openedge-abl-syntax
- For latest changes see: [Release notes](#release-notes)

## Syntax definition is not in this repository
For issues and other things regarding syntax definition, see
 - https://github.com/ZaphyrVonGenevese/openedge-abl-syntax

## Things that do NOT work
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

## Release notes

### v0.2.0
- Added partial support for escape characters
- `=*/` is not end of a comment, it is parameter
- Fix: Consecutive comments on single line do not work as expected
- Fix: Significant performance loss after adding support for abbreviations
- Preprocesor names marked as functions; temp. solution
- Fix: comment regex not escaped properly
- Fix: < and > are special characters; keywords set to match whole word only
- Added more information about package
- Icon added

### v0.1.1
- Updated readme to help users reach me

### v0.1.0
- Initial relase
