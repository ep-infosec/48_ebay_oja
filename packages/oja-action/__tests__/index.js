'use strict';

const Assert = require('assert');
const Fs = require('fs');
const Path = require('path');
const Shell = require('shelljs');

describe(__filename, () => {
    const tmpBase = Path.resolve(__dirname, '.tmp-index');
    const tmpDir = Path.resolve(tmpBase, `${Date.now()}`);
    const appDir = Path.resolve(tmpDir, 'app');

    function createMockModule(name, code, selectors, namespace) {
        const modRoot = Path.resolve(appDir, 'node_modules', name);
        Shell.mkdir('-p', modRoot);
        Fs.writeFileSync(`${modRoot}/package.json`, JSON.stringify({
            name,
            version: '1.0.0',
            main: './index'
        }));
        const ns = namespace || `${name.toUpperCase()}NS/${name}`;
        const actionJson = {};
        actionJson[ns] = {
            function: '.',
            ...selectors
        };
        Fs.writeFileSync(`${modRoot}/action.json`, JSON.stringify(actionJson));
        Fs.writeFileSync(`${modRoot}/index.js`, code || `module.exports = () => '${name}v';`);
    }

    beforeEach(() => {
        Shell.rm('-rf', tmpBase);
        Shell.mkdir('-p', tmpDir);
    });

    afterEach(() => {
        Shell.rm('-rf', tmpBase);
    });

    test('should create context and discover actions', async () => {
        Shell.cp('-r', Path.resolve(__dirname, 'fixtures/app'), tmpDir);
        createMockModule('qaz');
        createMockModule('wsx');
        createMockModule('edc');
        createMockModule('rfv');

        const act = require(appDir);
        Assert.equal('foov', await act('FOONS/foo'));
        Assert.equal('qazv', await act('QAZNS/qaz'));
        Assert.equal('mock', await act('QAZNS/qaz', {
            functions: {
                'QAZNS/qaz': 'mock'
            }
        }), 'should allow overriding action via in-line context');
    });

    test('should allow to call action with selectors', async () => {
        Shell.cp('-r', Path.resolve(__dirname, 'fixtures/app'), tmpDir);
        createMockModule('qaz');
        createMockModule('wsx');
        createMockModule('edc');
        createMockModule('rfv');

        const act = require(appDir);
        Assert.equal('foov', await act('FOONS/foo'));
        Assert.equal('qazv', await act({ name: 'QAZNS/qaz', module: 'qaz' }));
        Assert.equal('qazv', await act({ name: 'QAZNS/qaz', module: 'qaz', version: '1.0.0' }));
        Assert.equal('qazv', await act({ name: 'QAZNS/qaz', module: 'qaz', '~version': '2.0.0' }));
        try {
            await act({ name: 'QAZNS/qaz', module: 'none' });
            return Promise.reject(new Error('Should have failed'));
        }
        catch (err) {
            Assert.equal('Cannot find action "QAZNS/qaz"', err.message);
        }
        try {
            await act({ name: 'QAZNS/qaz', module: 'qaz', version: '2.0.0' });
            return Promise.reject(new Error('Should have failed'));
        }
        catch (err) {
            Assert.equal('Cannot find action "QAZNS/qaz"', err.message);
        }
    });

    test('fix: should not share properties between two separate contexts', async () => {
        const { createContext } = require('@ebay/oja-action');
        const ctx1 = await createContext({
            properties: {
                deep: {
                    down: {
                        foo: 'foov'
                    }
                }
            }
        });

        Assert.equal('foov', ctx1.deep.down.foo);

        const ctx2 = await createContext();
        Assert.equal(ctx2.deep, undefined);
    });

    test('should provide caller location', async () => {
        const { createContext } = require('@ebay/oja-action');
        const ctx = await createContext({
            functions: {
                'actions/getLocation': (context, runtime) =>
                    runtime[Symbol.for('oja@callerLocation')],
                'actions/getLocation2': (context, runtime) => arg =>
                    `${runtime[Symbol.for('oja@callerLocation')]}-${arg}`
            }
        });

        Assert.equal(__filename, await ctx.action('actions/getLocation'));
        Assert.equal('foo/bar', await ctx.proxyAction('foo/bar', 'actions/getLocation'));
        Assert.equal('foo/bar-qaz', await ctx.proxyAction('foo/bar', 'actions/getLocation2', 'qaz'));

        const caller = Path.resolve(__dirname, './fixtures/location/actions/index.js');
        const act = require(caller);
        Assert.equal(`undefined-${caller}`, await act('caller/getLocation'));
        Assert.equal(`foo-${caller}`, await act('caller/getLocation2'));
    });
});
