'use strict';
const vscode = require('vscode');
const resolveFrom = require('resolve-from');

const DOCUMENT_SELECTORS = [{
    language: 'javascript',
    scheme: 'file'
}, {
    language: 'typescript',
    scheme: 'file'
}];

const ojaContextByLocation = {};

/**
 * TODO:
 *  - support complex action queries
 *    - validate support of mjs
 *    - auto suggest and validate selectors
 *    - suggest fallback selectors when no matching actions can be found
 *    - exclude action in focus from the popup list
 *    - support proxyAction `context.proxyAction(...)`
 *    - provide signatures for suggested actions
 *  - find where it is used from action.json to references
 *  - show a map of available actions (lense)
 *  - rename support
 */

let reportedErrors = {};
const runtimeErrorsCollection = vscode.languages.createDiagnosticCollection('oja-runtime');
function errorHandler(fn) {
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (err) {
            if (!reportedErrors[err.message]) {
                const errorMessage = reportedErrors[err.message] =
                    `vscode-oja: error detected ${err.message}, fix it and restart IDE or vscode plugin`;
                vscode.window.showInformationMessage(errorMessage);
                const range = new vscode.Range(0, 0, 0, 1);
                const uri = vscode.Uri.parse(getProjectRoot());
                const diagnostics = [...runtimeErrorsCollection.get(uri)] || [];
                diagnostics.push(new vscode.Diagnostic(range, errorMessage, 1));
                runtimeErrorsCollection.set(uri, diagnostics);
            }
            throw err;
        }
    };
}

async function _lintOnChange(diagnosticCollection, reset) {
    const root = getProjectRoot();
    const context = await getOjaContext(root);
    if (reset) {
        await context.proxyAction(root, 'oja/reset');
        delete ojaContextByLocation[root];
    }
    const errors = await context.proxyAction(root, 'oja/lint', 'lint', root);
    diagnosticCollection.clear();
    const diagnosticMap = new Map();
    errors.forEach(error => {
        if (error.code === 'duplicate') {
            error.files.forEach(file => {
                const canonicalFile = vscode.Uri.file(file).toString();
                const diagnostics = diagnosticMap.get(canonicalFile) || [];
                const range = new vscode.Range(0, 0, 0, 1);
                const message = `Duplicate action "${error.namespace}" detected`;
                diagnostics.push(new vscode.Diagnostic(range, message, 1));
                diagnosticMap.set(canonicalFile, diagnostics);
            });
            return;
        }

        const canonicalFile = vscode.Uri.file(error.path).toString();
        const diagnostics = diagnosticMap.get(canonicalFile) || [];

        if (error.code === 'parseError') {
            const range = new vscode.Range(0, 0, 0, 1);
            diagnostics.push(new vscode.Diagnostic(range, error.message, 1));
        }
        if (/parse|unexpected/.test(error.code)) {
            const lineMatch = error.message.match(/Line (\d+)/);
            const startLine = lineMatch ? parseInt(lineMatch[1]) - 1 : 0;
            const range = new vscode.Range(startLine, 0, startLine, 80);
            diagnostics.push(new vscode.Diagnostic(range, error.message, 0));
        }
        else {
            const namespace = error.namespace;
            const { start, end } = error.code !== 'functionNotFound' ?
                namespace.loc : error.function.loc;
            const range = new vscode.Range(start.line - 1, start.column, end.line - 1, end.column);
            const errorMsg = selectErrorMessage(error);
            diagnostics.push(new vscode.Diagnostic(range, errorMsg,
                error.codeType === 'error' ? 0 : 1));
        }

        diagnosticMap.set(canonicalFile, diagnostics);
    });
    diagnosticMap.forEach((diags, file) => {
        diagnosticCollection.set(vscode.Uri.parse(file), diags);
    });
}

const lintOnChange = errorHandler(_lintOnChange);

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
module.exports.activate = context => {
    reportedErrors = {};
    validateOjaInstallation();

    try {
        const provider = vscode.languages.registerCompletionItemProvider(
            // eslint-disable-next-line no-use-before-define
            DOCUMENT_SELECTORS, new OjaCompletionItemProvider(),
            '.', '(', '\'', '"'); // triggered whenever any of these chars is being typed
        context.subscriptions.push(provider);

        context.subscriptions.push(vscode.languages.registerDefinitionProvider(
            // eslint-disable-next-line no-use-before-define
            DOCUMENT_SELECTORS, new OjaDefinitionProvider()));

        const actionWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.workspace.getWorkspaceFolder(
                    vscode.window.activeTextEditor.document.uri
                ),
                '**/action.json'
            ),
            false,
            false,
            false
        );

        const diagnosticCollection = vscode.languages.createDiagnosticCollection('oja-lint');
        context.subscriptions.push(diagnosticCollection);
        context.subscriptions.push(runtimeErrorsCollection);

        // eslint-disable-next-line no-inner-declarations
        async function refresh(event) {
            lintOnChange(diagnosticCollection, true);
        }

        actionWatcher.onDidChange(refresh);
        actionWatcher.onDidCreate(refresh);
        actionWatcher.onDidDelete(refresh);

        // monitor the change of .ojalintignore
        const codeWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.workspace.getWorkspaceFolder(
                    vscode.window.activeTextEditor.document.uri
                ),
                '**/*.{js,mjs}'
            ),
            false,
            false,
            false
        );

        lintOnChange(diagnosticCollection);

        // eslint-disable-next-line no-inner-declarations
        function onCodeChange() {
            lintOnChange(diagnosticCollection, true);
        }
        codeWatcher.onDidChange(onCodeChange);
        codeWatcher.onDidCreate(onCodeChange);
        codeWatcher.onDidDelete(onCodeChange);

        const ignoreWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.workspace.getWorkspaceFolder(
                    vscode.window.activeTextEditor.document.uri
                ),
                '.ojalintignore'
            ),
            false,
            false,
            false
        );
        ignoreWatcher.onDidChange(onCodeChange);
        ignoreWatcher.onDidCreate(onCodeChange);
        ignoreWatcher.onDidDelete(onCodeChange);

        // Use the console to output diagnostic information (console.log) and errors (console.error)
        // This line of code will only be executed once when your extension is activated
        // eslint-disable-next-line no-console
        console.info('Congratulations, your extension "vscode-oja" is now active!');
        // let oja framework know we are running in vscode
        process.env.VS_CODE_OJA_EXTENSION = 'true';
    }
    catch (err) {
        vscode.window.showInformationMessage(
            `vscode-oja: activation failure due to ${err.message}`);
    }
};

function selectErrorMessage(error) {
    if (error.code === 'functionNotFound') {
        return `Action ${error.namespace.value} function "${
            error.function.value}" not found, error:${error.message}`;
    }
    if (error.code === 'notFound') {
        return `Action ${error.namespace.value} not found`;
    }
    if (error.code === 'circular') {
        return `Action ${error.namespace.value} calls itself`;
    }
    return `Unexpected error ${error.message}`;
}

class OjaCompletionItemProvider {
    async provideCompletionItems(document, position) {
        // get all text until the `position` and check if it reads `context.`
        // and if so then complete if `log`, `warn`, and `error`
        const line = document.lineAt(position).text;
        const linePrefix = line.substr(0, position.character);
        const actionStartPos = linePrefix.indexOf('context.');
        const actionEndPos = line.indexOf(')', actionStartPos);
        if (position.character < actionStartPos ||
            actionEndPos !== -1 && position.character > actionEndPos) {
            return undefined;
        }
        const range = actionEndPos !== -1 ?
            new vscode.Range(position,
                new vscode.Position(position.line, actionEndPos + 1)) : undefined;

        const actions = await findAllActions(document.fileName);
        const ret = actions.reduce((memo, act) => {
            const text = `context.action('${act.namespace}')`;
            const textHead = text.substring(0, position.character - actionStartPos);
            if (line.indexOf(textHead) === -1) {
                return memo;
            }
            const textReminder = text.substring(position.character - actionStartPos);
            const completionItem = new vscode.CompletionItem(text, vscode.CompletionItemKind.Method);
            completionItem.insertText = textReminder;
            if (range) {
                completionItem.range = range;
            }
            memo.push(completionItem);
            return memo;
        }, []);
        return ret;
    }
}

function getProjectRoot() {
    return vscode.workspace.getWorkspaceFolder(
        vscode.window.activeTextEditor.document.uri
    ).uri.fsPath;
}

function assertModule(root, name) {
    try {
        resolveFrom(root, name);
    }
    catch (err) {
        vscode.window.showInformationMessage(
            `vscode-oja: module ${name} is not found, please install it`);
    }
}

function validateOjaInstallation() {
    const root = getProjectRoot();

    assertModule(root, '@ebay/oja-context');
    assertModule(root, '@ebay/oja-action');
    assertModule(root, '@ebay/oja-linter');
}

function loadOjaResolve(path) {
    return require(resolveFrom(path, '@ebay/oja-action/resolver'));
}

async function getOjaContext(path) {
    const {
        moduleRoot
    } = loadOjaResolve(path);
    const rootPath = moduleRoot(path);
    let context = ojaContextByLocation[rootPath];
    if (context) {
        return context;
    }
    const { createContext } = require(resolveFrom(path, '@ebay/oja-action'));
    context = await createContext();
    ojaContextByLocation[rootPath] = context;
    return context;
}

async function findAllActions(path) {
    const context = await getOjaContext(path);
    const actions = await context.proxyAction(path, 'oja/resolveAllUniqueActions', '*', path);

    const retActions = [];
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        retActions.push(action[Symbol.for('oja@action')]);
    }
    return retActions;
}

function findStatement(statements, position) {
    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const {
            start,
            end
        } = stmt.namespace.loc;
        const startPos = new vscode.Position(start.line - 1, start.column - 1);
        const endPos = new vscode.Position(end.line - 1, end.column - 1);
        if (position.isAfterOrEqual(startPos) && position.isBeforeOrEqual(endPos)) {
            return stmt;
        }
    }
}

class OjaDefinitionProvider {
    /**
     * @param {vscode.TextDocument} document
     * @param {vscode.Position} position
     * @returns {Promise} vscode.Location | vscode.Location[]
     */
    async provideDefinition(document, position) {
        const context = await getOjaContext(document.fileName);
        const stmts = await context.proxyAction(document.fileName,
            'oja/lint', 'loadActionStatements', document.fileName);
        const actionStmt = findStatement(stmts, position);
        if (!actionStmt) {
            return;
        }
        const actions = await context.proxyAction(document.fileName, 'oja/resolveAllActions',
            actionStmt.namespace.value, document.fileName);

        const locations = [];
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            const location = action[Symbol.for('oja@action')][Symbol.for('oja@location')]();
            locations.push(new vscode.Location(vscode.Uri.file(location), new vscode.Position(0, 1)));
        }
        return Promise.resolve(locations);
    }
}
