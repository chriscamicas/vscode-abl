/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

// Orphan file, not used for now (or ever)

'use strict';

import * as vscode from 'vscode';
import { ABL_MODE } from './ablMode';

export const outputChannel = vscode.window.createOutputChannel('ABL');

let statusBarEntry: vscode.StatusBarItem;

export function showHideStatus() {
    if (!statusBarEntry) {
        return;
    }
    if (!vscode.window.activeTextEditor) {
        statusBarEntry.hide();
        return;
    }
    if (vscode.languages.match(ABL_MODE, vscode.window.activeTextEditor.document)) {
        statusBarEntry.show();
        return;
    }
    statusBarEntry.hide();
}

export function hideAblStatus() {
    if (statusBarEntry) {
        statusBarEntry.dispose();
    }
}

export function showAblStatus(message: string, command: string, tooltip?: string) {
    statusBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
    statusBarEntry.text = message;
    statusBarEntry.command = command;
    statusBarEntry.color = 'yellow';
    statusBarEntry.tooltip = tooltip;
    statusBarEntry.show();
}
