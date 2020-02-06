import cp = require('child_process');
import * as vscode from 'vscode';
import { ABLIndexDefinition, ABLTableDefinition, TextSelection } from './definition';

let regexInvalidWordEnd: RegExp = new RegExp(/[\.|\:|\-|\_|\\|\/]$/);

export function getText(document: vscode.TextDocument, position: vscode.Position, escapeEndChars?: boolean): TextSelection {
	let res = new TextSelection();
	res.wordRange = document.getWordRangeAtPosition(position, /[\w\d\-\+]+/);
	if (!res.wordRange)
		return;
	res.word = document.getText(res.wordRange).toLowerCase();
	res.statementRange = document.getWordRangeAtPosition(position, /[\w\d\-\+\.\:\\\/]+/);
	res.statement = document.getText(res.statementRange).toLowerCase();
	if (escapeEndChars !== true) {
		while (regexInvalidWordEnd.test(res.statement))
			res.statement = res.statement.substring(0, res.statement.length - 1);
	}
	return res;
}

export function cleanArray(arr: string[]): string[] {
	if (!arr)
		return [];
	for (var i = 0; i < arr.length; i++) {
		if (arr[i] == '') {
			arr.splice(i, 1);
			i--;
		}
	}
	return arr;
}

export function padRight(text: string, size: number): string {
	while (text.length < size)
		text += ' ';
	return text;
}
export function removeInvalidRightChar(text: string): string {
	let regexValidWordEnd: RegExp = new RegExp(/[\w\d]$/);
	while (!regexValidWordEnd.test(text))
		text = text.substring(0, text.length - 1);
	return text;
}
export function updateTableCompletionList(table: ABLTableDefinition) {
	table.completionFields = new vscode.CompletionList(table.allFields.map((field) => {
		return new vscode.CompletionItem(field.name, vscode.CompletionItemKind.Variable);
	}));
	table.completionIndexes = mapIndexCompletionList(table, table.indexes);
	table.completionAdditional = mapAdditionalCompletionList(table);
	table.completion = new vscode.CompletionList([...table.completionFields.items, ...table.completionAdditional.items, ...table.completionIndexes.items]);

	const pk = table.indexes.find((item) => item.primary);
	if ((pk) && (pk.fields)) {
		table.pkList = pk.fields.map((item) => item.label).join(', ');
	} else {
		table.pkList = '';
	}
}

function mapIndexCompletionList(table: ABLTableDefinition, list: ABLIndexDefinition[]): vscode.CompletionList {
	const result = new vscode.CompletionList();

	if (!list) { return result; }

	list.forEach((objItem) => {
		if (!objItem.fields) { return; }
		const item = new vscode.CompletionItem(objItem.label, vscode.CompletionItemKind.Snippet);
		item.insertText = getIndexSnippet(table, objItem);
		item.detail = objItem.fields.map((i) => i.label).join(', ');
		if (objItem.primary) {
			item.label = '>INDEX (PK) ' + item.label;
			item.detail = 'Primary Key, Fields: ' + item.detail;
		} else if (objItem.unique) {
			item.label = '>INDEX (U) ' + item.label;
			item.detail = 'Unique Index, Fields: ' + item.detail;
		} else {
			item.label = '>INDEX ' + item.label;
			item.detail = 'Index, Fields: ' + item.detail;
		}
		result.items.push(item);
	});
	return result;
}

function mapAdditionalCompletionList(table: ABLTableDefinition): vscode.CompletionList {
	const result = new vscode.CompletionList();
	let item;

	// ALL FIELDS
	item = new vscode.CompletionItem('>ALL FIELDS', vscode.CompletionItemKind.Snippet);
	item.insertText = getAllFieldsSnippet(table);
	item.detail = 'Insert all table fields';
	result.items.push(item);

	return result;
}

function getIndexSnippet(table: ABLTableDefinition, index: ABLIndexDefinition): vscode.SnippetString {
	const snip = new vscode.SnippetString();
	let first: boolean = true;
	let size = 0;
	// get max field name size
	index.fields.forEach((field) => { if (field.label.length > size) { size = field.label.length; } });
	// fields snippet
	index.fields.forEach((field) => {
		if (first) {
			first = false;
		} else {
			snip.appendText('\n');
			snip.appendText('\tand ' + table.label + '.');
		}
		snip.appendText(padRight(field.label, size) + ' = ');
		snip.appendTabstop();
	});
	return snip;
}

function getAllFieldsSnippet(table: ABLTableDefinition): vscode.SnippetString {
	const snip = new vscode.SnippetString();
	let first: boolean = true;
	let size = 0;
	// get max field name size
	table.allFields.forEach((field) => { if (field.name.length > size) { size = field.name.length; } });
	// allFields snippet
	table.allFields.forEach((field) => {
		if (first) {
			first = false;
		} else {
			snip.appendText('\n');
			snip.appendText(table.label + '.');
		}
		snip.appendText(padRight(field.name, size) + ' = ');
		snip.appendTabstop();
	});
	return snip;
}

export function replaceSnippetTableName(list: vscode.CompletionItem[], tableName: string, replacement: string): vscode.CompletionItem[] {
	const result = [...list];
	return result.map((item) => {
		if (item.kind === vscode.CompletionItemKind.Snippet) {
			item = Object.assign(new vscode.CompletionItem(item.label), item);
			const regex = new RegExp('^(?:[\\W]*)(' + tableName + ')(?![\\w]+)', 'gim');
			let ss = '';
			if (item.insertText instanceof vscode.SnippetString) {
				ss = item.insertText.value;
			} else {
				ss = item.insertText;
			}
			item.insertText = new vscode.SnippetString(ss.replace(regex, replacement));
		}
		return item;
	});
}
