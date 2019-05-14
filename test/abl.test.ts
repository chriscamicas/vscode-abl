import * as assert from 'assert';
import * as vscode from 'vscode';
import { convertDataToDebuggerMessage } from '../src/debugAdapter/messages';

suite('OpenEdge ABL Extension Tests', () => {
    suiteSetup(() => {
    });

    suiteTeardown(() => {
    });

    test('Test MSG_CLASSINFO Processing', (done) => {
        const msgRaw = `MSG_CLASSINFO;1;ablRunner;Progress.Lang.Object;N;NULL;P;Next-Sibling;Progress.Lang.Object;1;R;1008  (Class OpenEdge.ABLUnit.Model.TestRootModel);P;Prev-Sibling;Progress.Lang.Object;1;R;1006  (Class OpenEdge.ABLUnit.Runner.TestConfig);`;
        const msg = convertDataToDebuggerMessage(msgRaw);
        assert.deepEqual(msg, [
            {
                code: 'MSG_CLASSINFO',
                args: [],
                baseClass: null,
                properties: [{
                    children: [],
                    kind: 7,
                    name: 'Next-Sibling',
                    type: 'Progress.Lang.Object',
                    value: '1008  (Class OpenEdge.ABLUnit.Model.TestRootModel)',
                }, {
                    children: [],
                    kind: 7,
                    name: 'Prev-Sibling',
                    type: 'Progress.Lang.Object',
                    value: '1006  (Class OpenEdge.ABLUnit.Runner.TestConfig)',
                }],
            }]);
        done();
    });
    test('Test MSG_ARRAY Processing', (done) => {
        // let msgRaw = `MSG_ARRAY;ext;.1;W;.3"A";.2;W;.2"";.3;W;.2"";.4;W;.2"";..`;
        const msgRaw = `MSG_ARRAY;ext2;1;W;2"";2;W;2"";`;
        const msg = convertDataToDebuggerMessage(msgRaw);
        assert.deepEqual(msg, [
            {
                code: 'MSG_ARRAY',
                args: [],
                values: [
                    '2""',
                    '2""',
                ],
            }]);
        done();
    });
});
