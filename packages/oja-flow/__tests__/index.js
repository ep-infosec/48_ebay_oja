'use strict';

require('request-local');

const Assert = require('assert');
const Async = require('async');

const Oja = require('..');
const Flow = Oja.Flow;
const Domain = require('domain');

const done = require('./fixtures/done');

describe(__filename, () => {
    beforeEach(() => {
        process.removeAllListeners('unhandledRejection');
        process.once('unhandledRejection', err => {
            throw new Error(`Detected unhandled promise rejecttion for error:${err.message}`);
        });
    });

    describe('Flow', () => {
        test('should create empty flow', next => {
            const flow = new Flow();
            Assert.ok(flow.define);
            Assert.ok(flow.consume);
            next();
        });

        test('should define publisher with static data and consume via promise', next => {
            const flow = new Flow();
            flow.define('foo', 'bar');
            flow.consume('foo').then(val => {
                Assert.equal('bar', val);
                next();
            }).catch(next);
        });

        test('should define publisher', next => {
            const flow = new Flow();
            const pub = flow.define('foo');
            flow.consume('foo').then(val => {
                Assert.equal('bar', val);
                next();
            }).catch(next);
            pub.pub('bar');
        });

        test('should define publisher with promise and consume via promise', next => {
            const flow = new Flow();
            flow.define('foo', Promise.resolve('bar'));
            flow.consume('foo').then(val => {
                Assert.equal('bar', val);
                next();
            }).catch(next);
        });

        test('should capture promise reject, cb', next => {
            const flow = new Flow();
            flow.define('foo', Promise.reject(new Error('BOOM')));
            flow.consume('foo', () => {}).catch(err => {
                Assert.equal('BOOM', err.message);
                next();
            });
        });

        test('should capture promise reject', next => {
            const flow = new Flow();
            flow.define('foo', Promise.reject(new Error('BOOM')));
            flow.consume('foo').catch(err => {
                Assert.equal('BOOM', err.message);
                next();
            });
        });

        test('should catch reject from promise returned returned in define callback', next => {
            const greeting = new Flow();
            greeting
                .define('greeting', () => Promise.reject(new Error('BOOM')))
                .consume('greeting')
                .catch(err => {
                    Assert.equal('BOOM', err.message);
                    next();
                });
        });

        test('should catch reject from imported flow', next => {
            const nameSource = new Flow();
            nameSource.define('name', () => Promise.reject(new Error('BOOM')));

            const greeting = new Flow(nameSource);
            greeting
                .define('greeting', (_, runtime) => runtime.consume('name').then(name => `Hello ${name}`))
                .consume('greeting', data => {
                })
                .catch(err => {
                    Assert.equal('BOOM', err.message);
                    next();
                });
        });

        test('should define publisher with promise and consume via callback', next => {
            const flow = new Flow();
            flow
                .define('foo', Promise.resolve('bar'))
                .consume('foo', val => {
                    Assert.equal('bar', val);
                    next();
                })
                .consume('error', next);
        });

        test('should define publisher via callback and consume via promise', next => {
            const flow = new Flow();
            flow.define('foo', () => 'bar');
            flow.consume('foo').then(val => {
                Assert.equal('bar', val);
                next();
            }).catch(next);
        });

        test('should define publisher via async callback and consume via promise', next => {
            const flow = new Flow();
            flow.define('foo', publisher => {
                setImmediate(() => publisher.pub('bar'));
            });
            flow.consume('foo').then(val => {
                Assert.equal('bar', val);
                next();
            }).catch(next);
        });

        test('should publish/consume multiple events', next => {
            const events = ['bar', 'qaz'];
            const flow = new Flow();
            flow.define('foo', publisher => {
                events.forEach(evt => publisher.pub(evt));
            });
            next = done(2, next);
            flow.consume('foo', val => {
                Assert.equal(events.shift(), val);
                next();
            })
                .consume('error', next);
        });

        test('should publish multiple events via define', next => {
            next = done(2, next);
            const events = ['bar', 'qaz'];
            const flow = new Flow();

            events.forEach(evt => flow.define('foo', evt));

            flow.consume('foo', val => {
                Assert.equal(events.shift(), val);
                next();
            })
                .consume('error', next);
        });

        test('should publish/consume different events', next => {
            const flow = new Flow();
            next = done(2, next);
            flow.define('foo', 'bar')
                .define('qaz', 'wsx')
                .consume('foo', val => {
                    Assert.equal('bar', val);
                    next();
                })
                .consume('qaz', val => {
                    Assert.equal('wsx', val);
                    next();
                })
                .consume('error', next);
        });

        test('should publish/consume different events, async', next => {
            const flow = new Flow();
            next = done(2, next);
            flow.define('foo', publisher => {
                setImmediate(() => publisher.pub('bar'));
            })
                .define('qaz', publisher => {
                    setImmediate(() => publisher.pub('wsx'));
                })
                .define('qaz', 'wsx')
                .consume('foo', val => {
                    Assert.equal('bar', val);
                    next();
                })
                .consume('qaz', val => {
                    Assert.equal('wsx', val);
                    next();
                })
                .consume('error', next);
        });

        test('should consume any events', next => {
            const flow = new Flow();
            next = done(2, next);
            flow.define('foo', publisher => {
                setImmediate(() => publisher.pub('bar'));
            })
                .define('qaz', publisher => {
                    setImmediate(() => publisher.pub('wsx'));
                })
                .consume('*', evt => {
                    switch (evt.name) {
                        case 'foo':
                            Assert.equal('bar', evt.data);
                            next();
                            break;

                        case 'qaz':
                            Assert.equal('wsx', evt.data);
                            next();
                            break;
                        default:
                            // empty
                    }
                })
                .consume('error', next);
        });

        test('should define multi-topic publisher with static data and consume via promise', next => {
            const flow = new Flow();
            flow.define(['foo', 'qaz'], 'bar');

            const proms = flow
                .consume('error', next)
                .consume(['foo', 'qaz']);

            proms.then(data => {
                Assert.equal('bar', data.foo);
                Assert.equal('bar', data.qaz);
                next();
            });
        });

        test('should consume error without failing', next => {
            const flow = new Flow();
            flow.consume('error', err => {
                Assert.equal('Boom', err.message);
                // wait a little to give emitter chance to throw
                setTimeout(() => next(), 20);
            })
            // emit error
                .define('foo', new Error('Boom'));
        });

        describe('should fail due to uncaught error', () => {
            // eslint-disable-next-line no-undef
            beforeAll(() => {
                while (process.domain) {
                    process.domain.exit();
                }
            });

            // eslint-disable-next-line no-undef
            afterAll(() => {
                while (process.domain) {
                    process.domain.exit();
                }
            });

            test('test', next => {
                const flow = new Flow();
                const domain = Domain.create();
                domain.run(() => {
                    flow.define('foo', new Error('Boom'));
                });
                domain.on('error', err => {
                    Assert.ok(/Boom/.test(err.message));
                    next();
                });
            });
        });

        test('should import other flow with static data', next => {
            const nameSource = new Flow();
            nameSource.define('name', 'John');

            const greeting = new Flow(nameSource);
            greeting
                .define('greeting', (_, runtime) => runtime.consume('name').then(name => `Hello ${name}`))
                .consume('greeting', data => {
                    Assert.equal('Hello John', data);
                    next();
                })
                .consume('error', next);
        });

        test('should import flow dynamic data', next => {
            class NameSource extends Flow {
                name() {
                    // eslint-disable-next-line no-use-before-define
                    nameSource.define('name', 'John');
                }
            }
            const nameSource = new NameSource();

            const greeting = new Flow(nameSource);
            greeting
                .define('greeting', (_, runtime) => runtime.consume('name').then(name => `Hello ${name}`))
                .consume('greeting', data => {
                    Assert.equal('Hello John', data);
                    next();
                })
                .consume('error', next);

            nameSource.name();
        });

        test('should import other flow with multiple topics', next => {
            const otherFlow = new Flow();
            otherFlow.define('name1', 'John1');
            otherFlow.define('name2', 'John2');
            otherFlow.define('name3', 'John3');

            new Flow(otherFlow)
                .consume(['name1', 'name3'], data => {
                    Assert.equal('John1', data.name1);
                    Assert.equal('John3', data.name3);
                    next();
                })
                .consume('error', next);
        });

        test('should consume already consumed on * topic', next => {
            const flow = new Flow();
            flow.define('foo', 'bar');

            // let static settle
            setImmediate(() => {
                flow.consume('*', data => {
                    Assert.equal('foo', data.name);
                    Assert.equal('bar', data.data);
                    next();
                });
            });
        });

        test('should import static events for *', next => {
            const otherFlow = new Flow();
            otherFlow.define('foo', 'bar');

            // let otherFlow.emit execute
            setImmediate(() => {
                new Flow(otherFlow)
                    .define('qaz', 'wsx')
                    .consume(['qaz', 'foo'], data => {
                        Assert.equal('wsx', data.qaz);
                        Assert.equal('bar', data.foo);
                        next();
                    })
                    .catch(next);
            });
        });

        test('should import other flow with mutual topic', next => {
            const otherFlow = new Flow();
            otherFlow.consume('shared', shared => {
                Assert.equal('foo', shared);
                otherFlow.define('name1', 'John1');
            });

            new Flow(otherFlow)
                .define('shared', 'foo') // define in master flow
                .consume('name1', data => {
                    Assert.equal('John1', data);
                    next();
                })
                .consume('error', next);
        });

        test('should import other flow with mutual topic', next => {
            const otherFlow = new Flow();
            otherFlow.consume('shared', shared => {
                Assert.equal('foo', shared);
                otherFlow.define('name1', 'John1');
            });

            // async mode
            setImmediate(() => {
                new Flow(otherFlow)
                    .define('shared', 'foo') // define in master flow
                    .consume('name1', data => {
                        Assert.equal('John1', data);
                        next();
                    })
                    .consume('error', next);
            });
        });

        test('should import error', next => {
            next = done(2, next);

            const otherFlow = new Flow();
            otherFlow.define('name1', 'John1');
            otherFlow.define('error', new Error('Boom'));

            new Flow(otherFlow)
                .consume('name1', data => {
                    Assert.equal('John1', data);
                    next();
                })
                .catch(err => {
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        test('import flow, multiple sources', next => {
            const nameSource = new Flow();
            nameSource.define('name1', 'John');
            nameSource.define('name2', 'Bob');

            const greeting = new Flow(nameSource);
            greeting
                .consume(['name1', 'name2'], (input, runtime) => {
                    runtime.define('greeting', `Hello ${input.name1} and ${input.name2}`);
                })
                .consume('greeting', data => {
                    Assert.equal('Hello John and Bob', data);
                    next();
                })
                .consume('error', next);
        });

        test('should throw sync error', next => {
            class Foo extends Flow {
                throwError() {
                    this.define('data', new Error('Boom'));
                    return this;
                }
            }

            const flow = new Foo();
            flow.throwError()
                .consume('error', err => {
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        test('should throw async error', next => {
            class Foo extends Flow {
                throwError() {
                    this.define('data', publisher => {
                        setImmediate(() => {
                            publisher.pub(new Error('Boom'));
                        });
                    });
                    return this;
                }
            }

            const flow = new Foo();
            flow.throwError()
                .consume('error', err => {
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        describe('should throw error in cb when consuming multiple topics', () => {
            // eslint-disable-next-line no-undef
            beforeAll(() => {
                while (process.domain) {
                    process.domain.exit();
                }
            });

            // eslint-disable-next-line no-undef
            afterAll(() => {
                while (process.domain) {
                    process.domain.exit();
                }
            });

            test('test', next => {
                const domain = Domain.create();

                domain.run(() => {
                    // throw new Error('Boom')
                    setTimeout(() => {
                        new Flow()
                            .define('mess', {})
                            .consume(['mess', 'mess'], () => {
                                throw new Error('Boom');
                            });
                    }, 1);
                });

                domain.on('error', err => {
                    Assert.equal('Boom', err.message);
                    next();
                });
            });
        });

        test('should capture error in cb when consuming multiple topics, catch', next => {
            new Flow()
                .define('mess', {})
                .consume(['mess', 'mess'], (_, runtime) => {
                    runtime.define('error', new Error('Boom'));
                })
                .catch(err => {
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        test('should throw error when catch arguments are invalid', next => {
            Assert.throws(() => {
                new Flow().catch('error', err => {});
            }, /Invalid arguments/);
            next();
        });

        test('should publish one event and fail with error', next => {
            let dataReceived;
            new Flow()
                .define('data', 'ok')
                .define('data', new Error('Boom'))
                .consume('data', data => {
                    dataReceived = data;
                })
                .consume('error', err => {
                    Assert.equal('ok', dataReceived);
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        test('should resolve promise', next => {
            new Flow()
                .define('foo', Promise.resolve('bar'))
                .consume('foo', foo => {
                    Assert.equal('bar', foo);
                    next();
                });
        });

        test('should reject promise', next => {
            new Flow()
                .define('foo', Promise.reject(new Error('Boom')))
                .catch(err => {
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        test('should chain events', next => {
            new Flow()
                .define('A', 'a')
                .consume('A', (val, runtime) => {
                    Assert.equal('a', val);
                    runtime.define('B', 'b');
                })
                .consume('B', (val, runtime) => {
                    Assert.equal('b', val);
                    runtime.define('C', 'c');
                })
                .consume('C', val => {
                    Assert.equal('c', val);
                    next();
                })
                .consume('error', next);
        });

        test('should chain events, consuming multi-topics', next => {
            new Flow()
                .define('A', 'a')
                .consume('A', (val, runtime) => {
                    Assert.equal('a', val);
                    runtime.define('B', 'b');
                })
                .consume('B', (val, runtime) => {
                    Assert.equal('b', val);
                    runtime.define('C', 'c');
                })
                .consume(['C', 'B'], (val, runtime) => {
                    Assert.equal('c', val.C);
                    Assert.equal('b', val.B);
                    runtime.define('E', 'e');
                })
                .consume('C', (val, runtime) => {
                    Assert.equal('c', val);
                    next();
                })
                .consume('error', next);
        });

        test('should return pending topic', next => {
            const state = new Flow()
                .consume('foo', () => {})
                .state();

            Assert.deepEqual(['foo'], state.pending);
            Assert.deepEqual({}, state.queue);
            next();
        });

        test('should timeout for one topic', next => {
            new Flow()
                .consume('foo', () => {})
                .timeout('foo', 1)
                .catch(err => {
                    Assert.equal('Topic/s (foo) timed out, pending topics (none), queue state {}', err.message);
                    next();
                });
        });

        test('should timeout and show pending end of stream and main topic', next => {
            new Flow()
                .consume('foo', () => {})
                .consumeStream('bar', stream => {})
                .timeout('foo', 1)
                .catch(err => {
                    Assert.equal('Topic/s (foo) timed out, pending topics (bar:end,bar), queue state {}', err.message);
                    next();
                });
        });

        test('should timeout and show pending end of stream and main topic with bar in queue', next => {
            new Flow()
                .consume('foo', () => {})
                .define('bar', 'boo')
                .consumeStream('bar', stream => {})
                .timeout('foo', 1)
                .catch(err => {
                    Assert.equal(
                        'Topic/s (foo) timed out, pending topics (bar:end), queue state {"bar":1}', err.message);
                    next();
                });
        });

        test('should timeout for 2 topics, one resolved', next => {
            const flow = new Flow()
                .consume('foo', () => {})
                .consume('bar', () => {})
                .timeout(['foo', 'bar'], 20)
                .catch(err => {
                    Assert.equal('Topic/s (bar) timed out, pending topics (none), queue state {"foo":1}', err.message);
                    next();
                });
            setTimeout(() => {
                flow.define('foo', '');
            }, 10);
        });

        test('should timeout for 2 topics, one resolved, one pending', next => {
            const flow = new Flow()
                .consume('foo', () => {})
                .consume('bar', () => {})
                .consume('qaz', () => {})
                .timeout(['foo', 'bar'], 20)
                .catch(err => {
                    Assert.equal('Topic/s (bar) timed out, pending topics (qaz), queue state {"foo":1}', err.message);
                    next();
                });
            setTimeout(() => {
                flow.define('foo', '');
            }, 5);
        });

        test('should timeout for 2 topics without uncaught promise rejection', next => {
            const flow = new Flow()
                .consume('foo', () => {})
                .consume('bar', () => {})
                .consume('qaz', () => {})
                .timeout(['foo', 'bar'], 20)
                .catch(err => {
                    Assert.equal('Topic/s (bar) timed out, pending topics (qaz), queue state {"foo":1}', err.message);
                    next();
                });
            setTimeout(() => {
                flow.define('foo', '');
            }, 5);
        });

        it.skip('should timeout throw uncaught error', next => {
            process.removeAllListeners('unhandledRejection');
            process.once('unhandledRejection', err => {
                next();
            });
            new Flow()
                .timeout('foo', 20)
                .consume(['foo'], () => {});
        });

        test('should timeout on one of the timed topics', next => {
            const flow = new Flow()
                .consume(['foo', 'bar'], () => {})
                .timeout(['foo', 'bar'], 100)
                .catch(err => {
                    Assert.equal('Topic/s (bar) timed out, pending topics (none), queue state {"foo":1}', err.message);
                    next();
                });

            setTimeout(() => {
                flow.define('foo', '');
            }, 5);
        });

        test('should not timeout for 2 topics, one pending', next => {
            const flow = new Flow()
                .consume('foo', () => {})
                .consume('bar', () => {})
                .consume('qaz', () => {})
                .timeout(['foo', 'bar'], 20)
                .catch(next);

            setTimeout(() => {
                flow.define('foo', '');
            }, 5);
            setTimeout(() => {
                flow.define('bar', '');
            }, 6);
            setTimeout(next, 15);
        });

        test('should continue cascading style, after catch', next => {
            const state = new Flow()
                .consume('foo', () => {})
                .catch(next)
                .state();

            Assert.deepEqual(['foo'], state.pending);
            next();
        });

        test('should return pending topics', next => {
            const state = new Flow()
                .consume(['foo', 'bar'], () => {})
                .state();

            Assert.deepEqual(['foo', 'bar'], state.pending);
            next();
        });

        test('should return pending topics, duplicated', next => {
            const state = new Flow()
                .consume(['foo', 'bar', 'bar'], () => {})
                .consume(['foo', 'qaz'], () => {})
                .state();

            Assert.deepEqual(['foo', 'bar', 'qaz'], state.pending);
            next();
        });

        test('should return pending topics, some resolved', next => {
            const state = new Flow()
                .consume(['foo', 'bar', 'bar'], () => {})
                .consume(['foo', 'qaz'], () => {})
                .define('foo', '')
                .state();

            Assert.deepEqual(['bar', 'qaz'], state.pending);
            Assert.deepEqual({ foo: 1 }, state.queue);
            next();
        });

        test('should return state', next => {
            const state = new Flow()
                .define('qaz', '')
                .define('wsx', '')
                .define('foo', '')
                .define('foo', '')
                .define('foo', '')
                .define('foo', '')
                .state();

            Assert.deepEqual({ foo: 4, qaz: 1, wsx: 1 }, state.queue);
            next();
        });

        test('should stop after the error, sync', next => {
            next = done(3, next);
            const flow = new Flow();

            flow
                .define('foo', 'faa')
                .define('boo', 'baa')
                .define('error', new Error('Boom'))
                .define('too', 'taa')
                .consume('foo', foo => {
                    next();
                })
                .consume('boo', foo => {
                    next();
                })
                .consume('too', too => {
                // will never happen
                    next(new Error('Should never happen'));
                })
                .catch(err => { // catch error
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        test('should stop after the error, async', next => {
            next = done(3, next);
            const flow = new Flow();

            flow
                .define('foo', 'faa')
                .define('boo', 'baa')
                .define('error', new Error('Boom'))
                .consume('foo', foo => {
                    setTimeout(() => {
                        flow.define('too', 'taa');
                    }, 10);
                    next();
                })
                .consume('boo', foo => {
                    next();
                })
                .consume('too', too => {
                // will never happen
                    next(new Error('Should never happen'));
                })
                .catch(err => { // catch error
                    Assert.equal('Boom', err.message);
                    next();
                });
        });

        describe('Consume Stream', () => {
            test('should create empty readable stream', next => {
                const flow = new Flow();
                const stream = flow.consumeStream('topic');
                stream.on('data', () => next(new Error('Should not happen')));
                stream.on('end', () => {
                    next();
                });
                flow.define('topic', null);
            });

            test('should create empty reader', next => {
                const flow = new Flow();
                const reader = flow.getReader('topic');
                reader
                    .next()
                    .then(data => {
                        Assert.equal(undefined, data);
                        next();
                    })
                    .catch(next);

                flow.define('topic', null);
            });

            test('should handle topic and end of stream', next => {
                const flow = new Flow();
                const stream = flow.consumeStream('topic');
                const buffer = [];
                next = done(2, next);
                stream.on('data', data => {
                    buffer.push(data);
                });
                stream.on('end', () => {
                    Assert.deepEqual(['one', 'two'], buffer);
                    flow.define('topic', 'tree');
                    setImmediate(() => {
                        Assert.deepEqual(['one', 'two'], buffer);
                        next();
                    });
                });
                flow.consume('topic:end', () => next());

                flow.define('topic', 'one');
                flow.define('topic', 'two');
                flow.define('topic', null);
            });

            test('should handle topic and end of stream via reader', next => {
                const flow = new Flow();
                const reader = flow.getReader('topic');
                const buffer = [];

                function read(data) {
                    buffer.push(data);
                }

                reader.next().then(read);
                reader.next().then(read);
                reader.next().then(data => {
                    Assert.equal(undefined, data);
                    Assert.deepEqual(['one', 'two'], buffer);
                    flow.define('topic', 'tree');
                    setImmediate(() => {
                        Assert.deepEqual(['one', 'two'], buffer);
                        next();
                    });
                });

                flow.define('topic', 'one');
                flow.define('topic', 'two');
                flow.define('topic', null);
            });

            test('should handle topic and end of stream in async use-case', next => {
                const flow = new Flow();
                const reader = flow.getReader('topic');
                const buffer = [];

                function read(data) {
                    buffer.push(data);
                }

                flow.define('topic', 'one');

                setImmediate(() => {
                    reader.next().then(read);
                    reader.next().then(read);
                    reader.next().then(data => {
                        Assert.equal(undefined, data);
                        Assert.deepEqual(['one', 'two'], buffer);
                        flow.define('topic', 'tree');
                        setImmediate(() => {
                            Assert.deepEqual(['one', 'two'], buffer);
                            next();
                        });
                    });

                    flow.define('topic', 'two');
                    setImmediate(() => {
                        flow.define('topic', null);
                    });
                });
            });

            test('should throw error on completed reder', next => {
                const flow = new Flow();
                const reader = flow.getReader('topic');
                reader
                    .next()
                    .then(data => {
                        Assert.equal('one', data);
                        return reader.next();
                    })
                    .then(data => {
                        Assert.equal(undefined, data);
                        return reader.next();
                    })
                    .catch(err => {
                        Assert.equal('The reader(topic) is already closed', err.message);
                        next();
                    });
                flow.define('topic', 'one');
                flow.define('topic', null);
            });

            test('should handle topic and end of stream, different setup', next => {
                const flow = new Flow();
                flow.define('topic', 'one');
                flow.define('foo', 'bar');
                const stream = flow.consumeStream('topic');
                const buffer = [];
                next = done(2, next);
                stream.on('data', data => {
                    buffer.push(data);
                });
                stream.on('end', () => {
                    Assert.deepEqual(['one', 'two'], buffer);
                    flow.define('topic', 'tree');
                    setImmediate(() => {
                        Assert.deepEqual(['one', 'two'], buffer);
                        next();
                    });
                });
                flow.consume('topic:end', () => next());
                setImmediate(() => {
                    flow.define('topic', 'two');
                    flow.define('topic', null);
                    setImmediate(() => {
                        flow.define('topic', 'four');
                    });
                });
            });

            test('should buffer till it is read', next => {
                const flow = new Flow();
                const stream = flow.consumeStream('topic');
                const expected = [];
                for (let i = 0; i < 20; i++) {
                    flow.define('topic', i);
                    expected.push(i);
                }
                flow.define('topic', null); // mark the end

                Assert.ok(stream._buffer.length > 0);

                setImmediate(() => {
                    const buffer = [];
                    stream.on('data', data => {
                        buffer.push(data);
                    });
                    stream.on('end', () => {
                        Assert.equal(0, stream._buffer.length);
                        Assert.deepEqual(expected, buffer);
                        next();
                    });
                });
            });

            test('should buffer till it is read via reader', next => {
                const flow = new Flow();
                const reader = flow.getReader('topic');
                const expected = [];
                for (let i = 0; i < 20; i++) {
                    flow.define('topic', i);
                    expected.push(i);
                }
                expected.push(undefined);
                flow.define('topic', null); // mark the end

                const buffer = [];
                // eslint-disable-next-line no-shadow
                Async.doWhilst(next => {
                    reader
                        .next()
                        .then(data => {
                            buffer.push(data);
                            next();
                        });
                },
                () => {
                    const data = buffer[buffer.length - 1];
                    return data !== undefined;
                },
                err => {
                    Assert.ok(!err, err && err.stack);
                    Assert.deepEqual(expected, buffer);
                    next();
                });
            });

            test('should emit topic:end to signal end of stream when stream error happens', next => {
                const flow = new Flow();
                const stream = flow.consumeStream('topic');
                const buffer = [];

                stream.on('data', data => {
                    buffer.push(data);
                });
                stream.on('end', () => {
                    next(new Error('Should never happen'));
                });
                flow.consume('topic:end', () => {
                    Assert.deepEqual(['one', 'two'], buffer);
                    next();
                });
                setImmediate(() => stream.emit('error', new Error('Boom')));

                flow.define('topic', 'one');
                flow.define('topic', 'two');
            });
        });
    });
});
