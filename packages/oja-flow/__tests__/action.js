'use strict';

const Assert = require('assert');
const Action = require('..').Action;

describe(__filename, () => {
    test('should define action', () => {
        // eslint-disable-next-line no-new
        new Action();
    });

    test('should execute action', () => {
        const action = new Action();
        action.activate();
        Assert.ok(action.executed);
    });

    test('should execute custom action', next => {
        class MyAction extends Action {
            execute() {
                this.define('foo', 'bar');
            }
        }

        const myaction = new MyAction();
        myaction.consume('foo').then(data => {
            Assert.equal('bar', data);
            next();
        });
        myaction.activate();
    });

    test('should propagate context from child action', next => {
        class BaseAction extends Action {}

        class MyAction extends Action {
            execute() {
                this.define('foo', 'bar');
            }
        }

        const base = new BaseAction();
        base.add(new MyAction());
        base.consume('foo').then(data => {
            Assert.equal('bar', data);
            next();
        });
        base.activate();
    });

    test('should propagate context from base action to child', next => {
        class BaseAction extends Action {}

        class MyAction extends Action {
            execute() {
                this.define('foo', 'bar');
            }
        }

        const base = new BaseAction();
        // show all waterfall style
        base.add(new MyAction())
            .activate()
            .consume('foo')
            .then(data => {
                Assert.equal('bar', data);
                next();
            });
    });

    test('should throw error when adding action that is already started', () => {
        Assert.throws(() => {
            new Action().add(new Action().activate());
        }, /The action should not be in progress when it is added to the other action/);
    });

    test('should not re-execute the action', next => {
        let executed;

        class MyAction extends Action {
            execute() {
                Assert.ok(!executed);
                executed = true;
                next();
                return this;
            }
        }

        new MyAction()
            .activate()
            .activate();
    });

    test('should add child action as a generic function', next => {
        class BaseAction extends Action {}

        const base = new BaseAction();
        base.add((flow) => {
            flow.define('foo', 'bar');
        });
        base.consume('foo').then(data => {
            Assert.equal('bar', data);
            next();
        });
        base.activate();
    });

    test('should add array of actions', next => {
        class BaseAction extends Action {}

        class MyFooAction extends Action {
            execute() {
                this.define('foo', 'bar');
            }
        }

        class MyQazAction extends Action {
            execute() {
                this.define('qax', 'wsx');
            }
        }

        const base = new BaseAction();
        base.add([
            function (flow) {
                flow.define('edc', 'rfv');
            },
            new MyQazAction(),
            new MyFooAction()
        ]);

        base
            .activate()
            .consume(['foo', 'qax', 'edc'])
            .then(data => {
                Assert.equal('bar', data.foo);
                Assert.equal('wsx', data.qax);
                Assert.equal('rfv', data.edc);
                next();
            });
    });

    test('should add array of actions as parameters', next => {
        class BaseAction extends Action {}

        class MyFooAction extends Action {
            execute() {
                this.define('foo', 'bar');
            }
        }

        class MyQazAction extends Action {
            execute() {
                this.define('qax', 'wsx');
            }
        }

        const base = new BaseAction();
        base.add(
            (flow) => {
                flow.define('edc', 'rfv');
            },
            new MyQazAction(),
            new MyFooAction()
        );

        base
            .activate()
            .consume(['foo', 'qax', 'edc'])
            .then(data => {
                Assert.equal('bar', data.foo);
                Assert.equal('wsx', data.qax);
                Assert.equal('rfv', data.edc);
                next();
            });
    });

    test('should add action during execution of base and still execute them successfully', next => {
        class MyFooAction extends Action {
            execute() {
                this.define('foo', 'bar');
            }
        }

        class MyQazAction extends Action {
            execute() {
                this.define('qax', 'wsx');
            }
        }

        class BaseAction extends Action {
            execute() {
                // eslint-disable-next-line no-use-before-define
                base.add(
                    (flow) => {
                        flow.define('edc', 'rfv');
                    },
                    new MyQazAction(),
                    new MyFooAction()
                );
            }
        }

        const base = new BaseAction();

        base
            .activate()
            .consume(['foo', 'qax', 'edc'])
            .then(data => {
                Assert.equal('bar', data.foo);
                Assert.equal('wsx', data.qax);
                Assert.equal('rfv', data.edc);
                next();
            });
    });

    describe('emitter warning', () => {
        const _error = console.error;
        // eslint-disable-next-line no-undef
        afterAll(() => {
            console.error = _error;
        });

        test('should not trigget too many listeners warning', next => {
            console.error = function (msg) {
                if (/Possible EventEmitter memory leak detected/.test(msg)) {
                    setImmediate(() => next(new Error('Should not happen')));
                }
                _error.apply(console, arguments);
            };
            const action = new Action();
            for (let i = 0; i < 15; i++) {
                action.consume('topic', () => {});
            }
            setImmediate(next);
        });

        test('should not trigget too many listeners warning, using setMaxListeners explicitly', next => {
            console.error = function (msg) {
                if (/Possible EventEmitter memory leak detected/.test(msg)) {
                    setImmediate(() => next(new Error('Should not happen')));
                }
                _error.apply(console, arguments);
            };
            const action = new Action();
            action.setMaxListeners(30);
            for (let i = 0; i < 25; i++) {
                action.consume('topic', () => {});
            }
            setImmediate(next);
        });
    });

    test('should update childrens context when parent gets new context when added to other action', next => {
        class FooAction extends Action {
            execute() {
                this.consume('common', () => {
                    this.define('foo', 'foo-val');
                });
            }
        }

        class BarAction extends Action {
            constructor() {
                super();
                this.add(new FooAction());
            }
            execute() {
                this.consume('common', () => {
                    this.define('bar', 'bar-val');
                });
            }
        }

        class QweAction extends Action {
            constructor() {
                super();
                this.add(new FooAction());
            }
            execute() {
                this.consume('common', () => {
                    this.define('qwe', 'qwe-val');
                });
            }
        }

        class QazAction extends Action {
            constructor() {
                super();
                this.add(new BarAction());
                this.add(new QweAction());
            }

            execute() {
                this.consume('common', () => {
                    this.define('qaz', 'parent-val');
                });
            }
        }

        new QazAction()
            .activate()
            .define('common', 'common')
            .consume(['foo', 'bar', 'qwe', 'qaz'])
            .then(data => {
                next();
            })
            .catch(next);
    });
});
