(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],2:[function(require,module,exports){
(function (process){
/**
 * @module vow
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @version 0.4.10
 * @license
 * Dual licensed under the MIT and GPL licenses:
 *   * http://www.opensource.org/licenses/mit-license.php
 *   * http://www.gnu.org/licenses/gpl.html
 */

(function(global) {

var undef,
    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof setImmediate === 'function') { // ie10, nodejs >= 0.10
            return function(fn) {
                enqueueFn(fn) && setImmediate(callFns);
            };
        }

        if(typeof process === 'object' && process.nextTick) { // nodejs < 0.10
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        var MutationObserver = global.MutationObserver || global.WebKitMutationObserver; // modern browsers
        if(MutationObserver) {
            var num = 1,
                node = document.createTextNode('');

            new MutationObserver(callFns).observe(node, { characterData : true });

            return function(fn) {
                enqueueFn(fn) && (node.data = (num *= -1));
            };
        }

        if(global.postMessage) {
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__promise' + +new Date,
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                };
                (doc.documentElement || doc.body).appendChild(script);
            };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })(),
    throwException = function(e) {
        nextTick(function() {
            throw e;
        });
    },
    isFunction = function(obj) {
        return typeof obj === 'function';
    },
    isObject = function(obj) {
        return obj !== null && typeof obj === 'object';
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    getArrayKeys = function(arr) {
        var res = [],
            i = 0, len = arr.length;
        while(i < len) {
            res.push(i++);
        }
        return res;
    },
    getObjectKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            obj.hasOwnProperty(i) && res.push(i);
        }
        return res;
    },
    defineCustomErrorType = function(name) {
        var res = function(message) {
            this.name = name;
            this.message = message;
        };

        res.prototype = new Error();

        return res;
    },
    wrapOnFulfilled = function(onFulfilled, idx) {
        return function(val) {
            onFulfilled.call(this, val, idx);
        };
    };

/**
 * @class Deferred
 * @exports vow:Deferred
 * @description
 * The `Deferred` class is used to encapsulate newly-created promise object along with functions that resolve, reject or notify it.
 */

/**
 * @constructor
 * @description
 * You can use `vow.defer()` instead of using this constructor.
 *
 * `new vow.Deferred()` gives the same result as `vow.defer()`.
 */
var Deferred = function() {
    this._promise = new Promise();
};

Deferred.prototype = /** @lends Deferred.prototype */{
    /**
     * Returns the corresponding promise.
     *
     * @returns {vow:Promise}
     */
    promise : function() {
        return this._promise;
    },

    /**
     * Resolves the corresponding promise with the given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.then(function(value) {
     *     // value is "'success'" here
     * });
     *
     * defer.resolve('success');
     * ```
     */
    resolve : function(value) {
        this._promise.isResolved() || this._promise._resolve(value);
    },

    /**
     * Rejects the corresponding promise with the given `reason`.
     *
     * @param {*} reason
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.fail(function(reason) {
     *     // reason is "'something is wrong'" here
     * });
     *
     * defer.reject('something is wrong');
     * ```
     */
    reject : function(reason) {
        if(this._promise.isResolved()) {
            return;
        }

        if(vow.isPromise(reason)) {
            reason = reason.then(function(val) {
                var defer = vow.defer();
                defer.reject(val);
                return defer.promise();
            });
            this._promise._resolve(reason);
        }
        else {
            this._promise._reject(reason);
        }
    },

    /**
     * Notifies the corresponding promise with the given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.progress(function(value) {
     *     // value is "'20%'", "'40%'" here
     * });
     *
     * defer.notify('20%');
     * defer.notify('40%');
     * ```
     */
    notify : function(value) {
        this._promise.isResolved() || this._promise._notify(value);
    }
};

var PROMISE_STATUS = {
    PENDING   : 0,
    RESOLVED  : 1,
    FULFILLED : 2,
    REJECTED  : 3
};

/**
 * @class Promise
 * @exports vow:Promise
 * @description
 * The `Promise` class is used when you want to give to the caller something to subscribe to,
 * but not the ability to resolve or reject the deferred.
 */

/**
 * @constructor
 * @param {Function} resolver See https://github.com/domenic/promises-unwrapping/blob/master/README.md#the-promise-constructor for details.
 * @description
 * You should use this constructor directly only if you are going to use `vow` as DOM Promises implementation.
 * In other case you should use `vow.defer()` and `defer.promise()` methods.
 * @example
 * ```js
 * function fetchJSON(url) {
 *     return new vow.Promise(function(resolve, reject, notify) {
 *         var xhr = new XMLHttpRequest();
 *         xhr.open('GET', url);
 *         xhr.responseType = 'json';
 *         xhr.send();
 *         xhr.onload = function() {
 *             if(xhr.response) {
 *                 resolve(xhr.response);
 *             }
 *             else {
 *                 reject(new TypeError());
 *             }
 *         };
 *     });
 * }
 * ```
 */
var Promise = function(resolver) {
    this._value = undef;
    this._status = PROMISE_STATUS.PENDING;

    this._fulfilledCallbacks = [];
    this._rejectedCallbacks = [];
    this._progressCallbacks = [];

    if(resolver) { // NOTE: see https://github.com/domenic/promises-unwrapping/blob/master/README.md
        var _this = this,
            resolverFnLen = resolver.length;

        resolver(
            function(val) {
                _this.isResolved() || _this._resolve(val);
            },
            resolverFnLen > 1?
                function(reason) {
                    _this.isResolved() || _this._reject(reason);
                } :
                undef,
            resolverFnLen > 2?
                function(val) {
                    _this.isResolved() || _this._notify(val);
                } :
                undef);
    }
};

Promise.prototype = /** @lends Promise.prototype */ {
    /**
     * Returns the value of the fulfilled promise or the reason in case of rejection.
     *
     * @returns {*}
     */
    valueOf : function() {
        return this._value;
    },

    /**
     * Returns `true` if the promise is resolved.
     *
     * @returns {Boolean}
     */
    isResolved : function() {
        return this._status !== PROMISE_STATUS.PENDING;
    },

    /**
     * Returns `true` if the promise is fulfilled.
     *
     * @returns {Boolean}
     */
    isFulfilled : function() {
        return this._status === PROMISE_STATUS.FULFILLED;
    },

    /**
     * Returns `true` if the promise is rejected.
     *
     * @returns {Boolean}
     */
    isRejected : function() {
        return this._status === PROMISE_STATUS.REJECTED;
    },

    /**
     * Adds reactions to the promise.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise} A new promise, see https://github.com/promises-aplus/promises-spec for details
     */
    then : function(onFulfilled, onRejected, onProgress, ctx) {
        var defer = new Deferred();
        this._addCallbacks(defer, onFulfilled, onRejected, onProgress, ctx);
        return defer.promise();
    },

    /**
     * Adds only a rejection reaction. This method is a shorthand for `promise.then(undefined, onRejected)`.
     *
     * @param {Function} onRejected Callback that will be called with a provided 'reason' as argument after the promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    'catch' : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds only a rejection reaction. This method is a shorthand for `promise.then(null, onRejected)`. It's also an alias for `catch`.
     *
     * @param {Function} onRejected Callback to be called with the value after promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    fail : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds a resolving reaction (for both fulfillment and rejection).
     *
     * @param {Function} onResolved Callback that will be invoked with the promise as an argument, after the promise has been resolved.
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    always : function(onResolved, ctx) {
        var _this = this,
            cb = function() {
                return onResolved.call(this, _this);
            };

        return this.then(cb, cb, ctx);
    },

    /**
     * Adds a progress reaction.
     *
     * @param {Function} onProgress Callback that will be called with a provided value when the promise has been notified
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    progress : function(onProgress, ctx) {
        return this.then(undef, undef, onProgress, ctx);
    },

    /**
     * Like `promise.then`, but "spreads" the array into a variadic value handler.
     * It is useful with the `vow.all` and the `vow.allResolved` methods.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise()]).spread(function(arg1, arg2) {
     *     // arg1 is "1", arg2 is "'two'" here
     * });
     *
     * defer1.resolve(1);
     * defer2.resolve('two');
     * ```
     */
    spread : function(onFulfilled, onRejected, ctx) {
        return this.then(
            function(val) {
                return onFulfilled.apply(this, val);
            },
            onRejected,
            ctx);
    },

    /**
     * Like `then`, but terminates a chain of promises.
     * If the promise has been rejected, this method throws it's "reason" as an exception in a future turn of the event loop.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     *
     * @example
     * ```js
     * var defer = vow.defer();
     * defer.reject(Error('Internal error'));
     * defer.promise().done(); // exception to be thrown
     * ```
     */
    done : function(onFulfilled, onRejected, onProgress, ctx) {
        this
            .then(onFulfilled, onRejected, onProgress, ctx)
            .fail(throwException);
    },

    /**
     * Returns a new promise that will be fulfilled in `delay` milliseconds if the promise is fulfilled,
     * or immediately rejected if the promise is rejected.
     *
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(delay) {
        var timer,
            promise = this.then(function(val) {
                var defer = new Deferred();
                timer = setTimeout(
                    function() {
                        defer.resolve(val);
                    },
                    delay);

                return defer.promise();
            });

        promise.always(function() {
            clearTimeout(timer);
        });

        return promise;
    },

    /**
     * Returns a new promise that will be rejected in `timeout` milliseconds
     * if the promise is not resolved beforehand.
     *
     * @param {Number} timeout
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promiseWithTimeout1 = defer.promise().timeout(50),
     *     promiseWithTimeout2 = defer.promise().timeout(200);
     *
     * setTimeout(
     *     function() {
     *         defer.resolve('ok');
     *     },
     *     100);
     *
     * promiseWithTimeout1.fail(function(reason) {
     *     // promiseWithTimeout to be rejected in 50ms
     * });
     *
     * promiseWithTimeout2.then(function(value) {
     *     // promiseWithTimeout to be fulfilled with "'ok'" value
     * });
     * ```
     */
    timeout : function(timeout) {
        var defer = new Deferred(),
            timer = setTimeout(
                function() {
                    defer.reject(new vow.TimedOutError('timed out'));
                },
                timeout);

        this.then(
            function(val) {
                defer.resolve(val);
            },
            function(reason) {
                defer.reject(reason);
            });

        defer.promise().always(function() {
            clearTimeout(timer);
        });

        return defer.promise();
    },

    _vow : true,

    _resolve : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        if(val === this) {
            this._reject(TypeError('Can\'t resolve promise with itself'));
            return;
        }

        this._status = PROMISE_STATUS.RESOLVED;

        if(val && !!val._vow) { // shortpath for vow.Promise
            val.isFulfilled()?
                this._fulfill(val.valueOf()) :
                val.isRejected()?
                    this._reject(val.valueOf()) :
                    val.then(
                        this._fulfill,
                        this._reject,
                        this._notify,
                        this);
            return;
        }

        if(isObject(val) || isFunction(val)) {
            var then;
            try {
                then = val.then;
            }
            catch(e) {
                this._reject(e);
                return;
            }

            if(isFunction(then)) {
                var _this = this,
                    isResolved = false;

                try {
                    then.call(
                        val,
                        function(val) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._resolve(val);
                        },
                        function(err) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._reject(err);
                        },
                        function(val) {
                            _this._notify(val);
                        });
                }
                catch(e) {
                    isResolved || this._reject(e);
                }

                return;
            }
        }

        this._fulfill(val);
    },

    _fulfill : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.FULFILLED;
        this._value = val;

        this._callCallbacks(this._fulfilledCallbacks, val);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _reject : function(reason) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.REJECTED;
        this._value = reason;

        this._callCallbacks(this._rejectedCallbacks, reason);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _notify : function(val) {
        this._callCallbacks(this._progressCallbacks, val);
    },

    _addCallbacks : function(defer, onFulfilled, onRejected, onProgress, ctx) {
        if(onRejected && !isFunction(onRejected)) {
            ctx = onRejected;
            onRejected = undef;
        }
        else if(onProgress && !isFunction(onProgress)) {
            ctx = onProgress;
            onProgress = undef;
        }

        var cb;

        if(!this.isRejected()) {
            cb = { defer : defer, fn : isFunction(onFulfilled)? onFulfilled : undef, ctx : ctx };
            this.isFulfilled()?
                this._callCallbacks([cb], this._value) :
                this._fulfilledCallbacks.push(cb);
        }

        if(!this.isFulfilled()) {
            cb = { defer : defer, fn : onRejected, ctx : ctx };
            this.isRejected()?
                this._callCallbacks([cb], this._value) :
                this._rejectedCallbacks.push(cb);
        }

        if(this._status <= PROMISE_STATUS.RESOLVED) {
            this._progressCallbacks.push({ defer : defer, fn : onProgress, ctx : ctx });
        }
    },

    _callCallbacks : function(callbacks, arg) {
        var len = callbacks.length;
        if(!len) {
            return;
        }

        var isResolved = this.isResolved(),
            isFulfilled = this.isFulfilled();

        nextTick(function() {
            var i = 0, cb, defer, fn;
            while(i < len) {
                cb = callbacks[i++];
                defer = cb.defer;
                fn = cb.fn;

                if(fn) {
                    var ctx = cb.ctx,
                        res;
                    try {
                        res = ctx? fn.call(ctx, arg) : fn(arg);
                    }
                    catch(e) {
                        defer.reject(e);
                        continue;
                    }

                    isResolved?
                        defer.resolve(res) :
                        defer.notify(res);
                }
                else {
                    isResolved?
                        isFulfilled?
                            defer.resolve(arg) :
                            defer.reject(arg) :
                        defer.notify(arg);
                }
            }
        });
    }
};

/** @lends Promise */
var staticMethods = {
    /**
     * Coerces the given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return vow.cast(value);
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, then the returned promise will be rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     */
    all : function(iterable) {
        return vow.all(iterable);
    },

    /**
     * Returns a promise, that will be fulfilled only when any of the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, then the returned promise will be rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    race : function(iterable) {
        return vow.anyResolved(iterable);
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, the returned promise will have `value`'s state.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        return vow.resolve(value);
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        return vow.reject(reason);
    }
};

for(var prop in staticMethods) {
    staticMethods.hasOwnProperty(prop) &&
        (Promise[prop] = staticMethods[prop]);
}

var vow = /** @exports vow */ {
    Deferred : Deferred,

    Promise : Promise,

    /**
     * Creates a new deferred. This method is a factory method for `vow:Deferred` class.
     * It's equivalent to `new vow.Deferred()`.
     *
     * @returns {vow:Deferred}
     */
    defer : function() {
        return new Deferred();
    },

    /**
     * Static equivalent to `promise.then`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     */
    when : function(value, onFulfilled, onRejected, onProgress, ctx) {
        return vow.cast(value).then(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.fail`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onRejected Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    fail : function(value, onRejected, ctx) {
        return vow.when(value, undef, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.always`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onResolved Callback that will be invoked with the promise as an argument, after the promise has been resolved.
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    always : function(value, onResolved, ctx) {
        return vow.when(value).always(onResolved, ctx);
    },

    /**
     * Static equivalent to `promise.progress`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onProgress Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    progress : function(value, onProgress, ctx) {
        return vow.when(value).progress(onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.spread`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     */
    spread : function(value, onFulfilled, onRejected, ctx) {
        return vow.when(value).spread(onFulfilled, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.done`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     */
    done : function(value, onFulfilled, onRejected, onProgress, ctx) {
        vow.when(value).done(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Checks whether the given `value` is a promise-like object
     *
     * @param {*} value
     * @returns {Boolean}
     *
     * @example
     * ```js
     * vow.isPromise('something'); // returns false
     * vow.isPromise(vow.defer().promise()); // returns true
     * vow.isPromise({ then : function() { }); // returns true
     * ```
     */
    isPromise : function(value) {
        return isObject(value) && isFunction(value.then);
    },

    /**
     * Coerces the given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return value && !!value._vow?
            value :
            vow.resolve(value);
    },

    /**
     * Static equivalent to `promise.valueOf`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {*}
     */
    valueOf : function(value) {
        return value && isFunction(value.valueOf)? value.valueOf() : value;
    },

    /**
     * Static equivalent to `promise.isFulfilled`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isFulfilled : function(value) {
        return value && isFunction(value.isFulfilled)? value.isFulfilled() : true;
    },

    /**
     * Static equivalent to `promise.isRejected`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isRejected : function(value) {
        return value && isFunction(value.isRejected)? value.isRejected() : false;
    },

    /**
     * Static equivalent to `promise.isResolved`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isResolved : function(value) {
        return value && isFunction(value.isResolved)? value.isResolved() : true;
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, the returned promise will have `value`'s state.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        var res = vow.defer();
        res.resolve(value);
        return res.promise();
    },

    /**
     * Returns a promise that has already been fulfilled with the given `value`.
     * If `value` is a promise, the returned promise will be fulfilled with the fulfill/rejection value of `value`.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    fulfill : function(value) {
        var defer = vow.defer(),
            promise = defer.promise();

        defer.resolve(value);

        return promise.isFulfilled()?
            promise :
            promise.then(null, function(reason) {
                return reason;
            });
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     * If `reason` is a promise, the returned promise will be rejected with the fulfill/rejection value of `reason`.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        var defer = vow.defer();
        defer.reject(reason);
        return defer.promise();
    },

    /**
     * Invokes the given function `fn` with arguments `args`
     *
     * @param {Function} fn
     * @param {...*} [args]
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var promise1 = vow.invoke(function(value) {
     *         return value;
     *     }, 'ok'),
     *     promise2 = vow.invoke(function() {
     *         throw Error();
     *     });
     *
     * promise1.isFulfilled(); // true
     * promise1.valueOf(); // 'ok'
     * promise2.isRejected(); // true
     * promise2.valueOf(); // instance of Error
     * ```
     */
    invoke : function(fn, args) {
        var len = Math.max(arguments.length - 1, 0),
            callArgs;
        if(len) { // optimization for V8
            callArgs = Array(len);
            var i = 0;
            while(i < len) {
                callArgs[i++] = arguments[i];
            }
        }

        try {
            return vow.resolve(callArgs?
                fn.apply(global, callArgs) :
                fn.call(global));
        }
        catch(e) {
            return vow.reject(e);
        }
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, the promise will be rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * with array:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise(), 3])
     *     .then(function(value) {
     *          // value is "[1, 2, 3]" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     *
     * @example
     * with object:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all({ p1 : defer1.promise(), p2 : defer2.promise(), p3 : 3 })
     *     .then(function(value) {
     *          // value is "{ p1 : 1, p2 : 2, p3 : 3 }" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     */
    all : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            len = keys.length,
            res = isPromisesArray? [] : {};

        if(!len) {
            defer.resolve(res);
            return defer.promise();
        }

        var i = len;
        vow._forEach(
            iterable,
            function(value, idx) {
                res[keys[idx]] = value;
                if(!--i) {
                    defer.resolve(res);
                }
            },
            defer.reject,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are resolved.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.allResolved([defer1.promise(), defer2.promise()]).spread(function(promise1, promise2) {
     *     promise1.isRejected(); // returns true
     *     promise1.valueOf(); // returns "'error'"
     *     promise2.isFulfilled(); // returns true
     *     promise2.valueOf(); // returns "'ok'"
     * });
     *
     * defer1.reject('error');
     * defer2.resolve('ok');
     * ```
     */
    allResolved : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            i = keys.length,
            res = isPromisesArray? [] : {};

        if(!i) {
            defer.resolve(res);
            return defer.promise();
        }

        var onResolved = function() {
                --i || defer.resolve(iterable);
            };

        vow._forEach(
            iterable,
            onResolved,
            onResolved,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    allPatiently : function(iterable) {
        return vow.allResolved(iterable).then(function() {
            var isPromisesArray = isArray(iterable),
                keys = isPromisesArray?
                    getArrayKeys(iterable) :
                    getObjectKeys(iterable),
                rejectedPromises, fulfilledPromises,
                len = keys.length, i = 0, key, promise;

            if(!len) {
                return isPromisesArray? [] : {};
            }

            while(i < len) {
                key = keys[i++];
                promise = iterable[key];
                if(vow.isRejected(promise)) {
                    rejectedPromises || (rejectedPromises = isPromisesArray? [] : {});
                    isPromisesArray?
                        rejectedPromises.push(promise.valueOf()) :
                        rejectedPromises[key] = promise.valueOf();
                }
                else if(!rejectedPromises) {
                    (fulfilledPromises || (fulfilledPromises = isPromisesArray? [] : {}))[key] = vow.valueOf(promise);
                }
            }

            if(rejectedPromises) {
                throw rejectedPromises;
            }

            return fulfilledPromises;
        });
    },

    /**
     * Returns a promise, that will be fulfilled if any of the items in `iterable` is fulfilled.
     * If all of the `iterable` items get rejected, the promise will be rejected (with the reason of the first rejected item).
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    any : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        var i = 0, reason;
        vow._forEach(
            iterable,
            defer.resolve,
            function(e) {
                i || (reason = e);
                ++i === len && defer.reject(reason);
            },
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Returns a promise, that will be fulfilled only when any of the items in `iterable` is fulfilled.
     * If any of the `iterable` items gets rejected, the promise will be rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    anyResolved : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        vow._forEach(
            iterable,
            defer.resolve,
            defer.reject,
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Static equivalent to `promise.delay`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(value, delay) {
        return vow.resolve(value).delay(delay);
    },

    /**
     * Static equivalent to `promise.timeout`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Number} timeout
     * @returns {vow:Promise}
     */
    timeout : function(value, timeout) {
        return vow.resolve(value).timeout(timeout);
    },

    _forEach : function(promises, onFulfilled, onRejected, onProgress, ctx, keys) {
        var len = keys? keys.length : promises.length,
            i = 0;

        while(i < len) {
            vow.when(
                promises[keys? keys[i] : i],
                wrapOnFulfilled(onFulfilled, i),
                onRejected,
                onProgress,
                ctx);
            ++i;
        }
    },

    TimedOutError : defineCustomErrorType('TimedOut')
};

var defineAsGlobal = true;
if(typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = vow;
    defineAsGlobal = false;
}

if(typeof modules === 'object' && isFunction(modules.define)) {
    modules.define('vow', function(provide) {
        provide(vow);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = vow;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.vow = vow);

})(this);

}).call(this,require('_process'))

},{"_process":1}],3:[function(require,module,exports){
(function (process,global){
/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.2
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            getStat = function() {
                var res = {},
                    module;

                for(var name in modulesStorage) {
                    if(modulesStorage.hasOwnProperty(name)) {
                        module = modulesStorage[name];
                        (res[module.decl.state] || (res[module.decl.state] = [])).push(name);
                    }
                }

                return res;
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    onDeclResolved = function(_, error) {
                        if(error) {
                            cb(null, error);
                            return;
                        }

                        if(!--unresolvedDepsCnt) {
                            var exports = [],
                                i = 0, decl;
                            while(decl = decls[i++]) {
                                exports.push(decl.exports);
                            }
                            cb(exports);
                        }
                    },
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    decls.push(decl);

                    startDeclResolving(decl, path, onDeclResolved);
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else if(decl.state === DECL_STATES.IN_RESOLVING) {
                    curOptions.trackCircularDependencies && isDependenceCircular(decl, path)?
                        cb(null, buildCircularDependenceError(decl, path)) :
                        decl.dependents.push(cb);
                    return;
                }

                decl.dependents.push(cb);

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create     : create,
            define     : define,
            require    : require,
            getState   : getState,
            isDefined  : isDefined,
            setOptions : setOptions,
            getStat    : getStat
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(typeof window !== 'undefined' ? window : global);

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"_process":1}],4:[function(require,module,exports){
var Logger = require('./logger/logger');
var logger = new Logger('AudioPlayer');

var Events = require('./lib/async/events');
var Deferred = require('./lib/async/deferred');
var detect = require('./lib/browser/detect');
var config = require('./config');
var merge = require('./lib/data/merge');
var reject = require('./lib/async/reject');

var AudioError = require('./error/audio-error');
var AudioStatic = require('./audio-static');

var playerId = 1;

//TODO: сделать интерфейс для возможности подключения новых типов
var audioTypes = {
    html5: require('./html5/audio-html5'),
    flash: require('./flash/audio-flash')
};

var detectString = "@" + detect.platform.version +
    " " + detect.platform.os +
    ":" + detect.browser.name +
    "/" + detect.browser.version;

audioTypes.flash.priority = 0;
audioTypes.html5.priority = config.html5.blacklist.some(function(item) { return detectString.match(item); }) ? -1 : 1;

logger.debug(null, "audioTypes", audioTypes);

/** Описание временных данных плеера
 * @typedef {Object} ya.Audio~AudioPlayerTimes
 *
 * @property {Number} duration - длительность трека
 * @property {Number} loaded - длительность загруженной части
 * @property {Number} position - позиция воспроизведения
 * @property {Number} played - длительность воспроизведения
 */

//------------------------------------------------------------------------- Common Events
/** Событие начала воспроизведения ({@link ya.Audio.EVENT_PLAY})
 * @event ya.Audio#play
 */
/** Событие завершения воспроизведения ({@link ya.Audio.EVENT_ENDED})
 * @event ya.Audio#ended
 */
/** Событие изменения громкости ({@link ya.Audio.EVENT_VOLUME})
 * @event ya.Audio#volumechange
 * @param {Number} volume - громкость
 */
/** Событие краха плеера ({@link ya.Audio.EVENT_CRASHED})
 * @event ya.Audio#crashed
 */
/** Событие смены статуса плеера ({@link ya.Audio.EVENT_STATE})
 * @event ya.Audio#state
 * @param {String} state - новый статус плеера
 */
/** Событие переключения активного плеера и прелоадера ({@link ya.Audio.EVENT_SWAP})
 * @event ya.Audio#swap
 */

//------------------------------------------------------------------------- Active Events
/** Событие остановки воспроизведения ({@link ya.Audio.EVENT_STOP})
 * @event ya.Audio#stop
 */
/** Событие начала воспроизведения ({@link ya.Audio.EVENT_PAUSE})
 * @event ya.Audio#pause
 */
/** Событие обновления позиции воспроизведения/загруженной части ({@link ya.Audio.EVENT_PROGRESS})
 * @event ya.Audio#progress
 * @param {ya.Audio~AudioPlayerTimes} times - информация о временных данных трека
 */
/** Событие начала загрузки трека ({@link ya.Audio.EVENT_LOADING})
 * @event ya.Audio#loading
 */
/** Событие завершения загрузки трека ({@link ya.Audio.EVENT_LOADED})
 * @event ya.Audio#loaded
 */
/** Событие ошибки воспроизведения ({@link ya.Audio.EVENT_ERROR})
 * @event ya.Audio#error
 */

//------------------------------------------------------------------------- Preloader Events
/** Событие остановки воспроизведения ({@link ya.Audio.EVENT_STOP})
 * @event ya.Audio#preloader:stop
 */
/** Событие начала воспроизведения ({@link ya.Audio.EVENT_PAUSE})
 * @event ya.Audio#preloader:pause
 */
/** Событие обновления позиции воспроизведения/загруженной части ({@link ya.Audio.EVENT_PROGRESS})
 * @event ya.Audio#preloader:progress
 * @param {ya.Audio~AudioPlayerTimes} times - информация о временных данных трека
 */
/** Событие начала загрузки трека ({@link ya.Audio.EVENT_LOADING})
 * @event ya.Audio#preloader:loading
 */
/** Событие завершения загрузки трека ({@link ya.Audio.EVENT_LOADED})
 * @event ya.Audio#preloader:loaded
 */
/** Событие ошибки воспроизведения ({@link ya.Audio.EVENT_ERROR})
 * @event ya.Audio#preloader:error
 */

/**
 * @class Аудио-плеер для браузера.
 * @alias ya.Audio
 * @param {String} [preferredType] - preferred player type (html5/flash)
 * @param {HTMLElement} [overlay] - dom element to show flash
 *
 * @extends Events
 * @mixes AudioStatic
 *
 * @fires ya.Audio#play
 * @fires ya.Audio#ended
 * @fires ya.Audio#volumechange
 * @fires ya.Audio#crashed
 * @fires ya.Audio#state
 * @fires ya.Audio#swap
 *
 * @fires ya.Audio#stop
 * @fires ya.Audio#pause
 * @fires ya.Audio#progress
 * @fires ya.Audio#loading
 * @fires ya.Audio#loaded
 * @fires ya.Audio#error
 *
 * @fires ya.Audio#preloader:stop
 * @fires ya.Audio#preloader:pause
 * @fires ya.Audio#preloader:progress
 * @fires ya.Audio#preloader:loading
 * @fires ya.Audio#preloader:loaded
 * @fires ya.Audio#preloader:error
 *
 * @constructor
 */
var AudioPlayer = function(preferredType, overlay) {
    this.name = playerId++;
    logger.debug(this, "constructor");

    Events.call(this);

    this.preferredType = preferredType;
    this.overlay = overlay;
    this.state = AudioPlayer.STATE_INIT;
    this._played = 0;
    this._lastSkip = 0;
    this._playId = null;

    this._whenReady = new Deferred();
    this.whenReady = this._whenReady.promise().then(function() {
        logger.info(this, "implementation found", this.implementation.type);

        this.implementation.on("*", function(event, offset, data) {
            this._populateEvents(event, offset, data);

            if (!offset) {
                switch (event) {
                    case AudioPlayer.EVENT_PLAY:
                        this._setState(AudioPlayer.STATE_PLAYING);
                        break;

                    case AudioPlayer.EVENT_SWAP:
                    case AudioPlayer.EVENT_STOP:
                    case AudioPlayer.EVENT_ENDED:
                    case AudioPlayer.EVENT_ERROR:
                        this._setState(AudioPlayer.STATE_IDLE);
                        break;

                    case AudioPlayer.EVENT_PAUSE:
                        this._setState(AudioPlayer.STATE_PAUSED);
                        break;

                    case AudioPlayer.EVENT_CRASHED:
                        this._setState(AudioPlayer.STATE_CRASHED);
                        break;
                }
            }
        }.bind(this));

        this._setState(AudioPlayer.STATE_IDLE);
    }.bind(this), function(e) {
        logger.error(this, AudioError.NO_IMPLEMENTATION, e);

        this._setState(AudioPlayer.STATE_CRASHED);
        throw e;
    }.bind(this));

    this._init(0);
};
Events.mixin(AudioPlayer);
merge(AudioPlayer, AudioStatic, true);

/**
 * Список доступных плееров
 * @type {Object}
 * @static
 */
AudioPlayer.info = {
    html5: audioTypes.html5.available,
    flash: audioTypes.flash.available
};

/**
 * Контекст для Web Audio API
 * @type {AudioContext}
 * @static
 */
AudioPlayer.audioContext = audioTypes.html5.audioContext;

/**
 * Установить статус плеера
 * @param {String} state - новый статус
 * @private
 */
AudioPlayer.prototype._setState = function(state) {
    logger.debug(this, "_setState", state);

    var changed = this.state !== state;
    this.state = state;

    if (changed) {
        logger.info(this, "newState", state);
        this.trigger(AudioPlayer.EVENT_STATE, state);
    }
};

/**
 * Инициализация плеера
 * @param {int} [retry=0] - количество попыток
 * @private
 */
AudioPlayer.prototype._init = function(retry) {
    retry = retry || 0;
    logger.info(this, "_init", retry);

    if (!this._whenReady.pending) {
        return;
    }

    if (retry > config.audio.retry) {
        logger.error(this, AudioError.NO_IMPLEMENTATION);
        this._whenReady.reject(new AudioError(AudioError.NO_IMPLEMENTATION));
    }

    var initSeq = [
        audioTypes.html5,
        audioTypes.flash
    ].sort(function(a, b) {
            if (a.available !== b.available) {
                return a.available ? -1 : 1;
            }

            if (a.AudioImplementation.type === this.preferredType) {
                return -1;
            }

            if (b.AudioImplementation.type === this.preferredType) {
                return 1;
            }

            return b.priority - a.priority;
        }.bind(this));

    var self = this;

    function init() {
        var type = initSeq.shift();

        if (!type) {
            self._init(retry + 1);
            return;
        }

        self._initType(type).then(self._whenReady.resolve, init);
    }

    init();
};

/**
 * Запуск реализации плеера с указанным типом
 * @param {{type: string, AudioImplementation: function}} type - объект описания типа инициализации.
 * @returns {Promise}
 * @private
 */
AudioPlayer.prototype._initType = function(type) {
    logger.info(this, "_initType", type);

    var deferred = new Deferred();
    try {
        /**
         * Текущая реализация аудио-плеера
         * @type {IAudioImplementation|null}
         * @private
         */
        this.implementation = new type.AudioImplementation(this.overlay);
        if (this.implementation.whenReady) {
            this.implementation.whenReady.then(deferred.resolve, deferred.reject);
        } else {
            deferred.resolve();
        }
    } catch(e) {
        deferred.reject(e);
    }

    return deferred.promise();
};

/**
 * Создание обещания, которое разрешается при одном из списка событий
 * @param {String} action - название действия
 * @param {Array.<String>} resolve - список ожидаемых событий для разрешения обещания
 * @param {Array.<String>} reject - список ожидаемый событий для отклонения обещания
 * @returns {Promise} -- также создаёт Deferred свойство с названием _when<Action>, которое живёт до момента разрешения
 * @private
 */
AudioPlayer.prototype._waitEvents = function(action, resolve, reject) {
    var deferred = new Deferred();
    var self = this;

    this[action] = deferred;

    var cleanupEvents = function() {
        resolve.forEach(function(event) {
            self.off(event, deferred.resolve);
        });
        reject.forEach(function(event) {
            self.off(event, deferred.reject);
        });
        delete self[action];
    };

    resolve.forEach(function(event) {
        self.on(event, deferred.resolve);
    });

    reject.forEach(function(event) {
        self.on(event, function(data) {
            var error = data instanceof Error ? data : new AudioError(data || event);
            deferred.reject(error);
        });
    });

    deferred.promise().then(cleanupEvents, cleanupEvents);

    return deferred.promise();
};

/**
 * Расширение событий аудио-плеера дополнительными свойствами. Подписывается на все события аудио-плеера,
 * триггерит итоговые события, разделяя их по типу активный плеер или прелоадер, дополняет события данными.
 * @param {String} event - событие
 * @param {int} offset - источник события. 0 - активный плеер. 1 - прелоадер.
 * @param {*} data - дополнительные данные события.
 * @private
 */
AudioPlayer.prototype._populateEvents = function(event, offset, data) {
    if (event !== AudioPlayer.EVENT_PROGRESS) {
        logger.debug(this, "_populateEvents", event, offset, data);
    }

    var outerEvent = (offset ? AudioPlayer.PRELOADER_EVENT : "") + event;

    switch (event) {
        case AudioPlayer.EVENT_CRASHED:
        case AudioPlayer.EVENT_SWAP:
            this.trigger(event, data);
            break;
        case AudioPlayer.EVENT_ERROR:
            this.trigger(outerEvent, data);
            break;
        case AudioPlayer.EVENT_VOLUME:
            this.trigger(event, this.getVolume());
            break;
        case AudioPlayer.EVENT_PROGRESS:
            this.trigger(outerEvent, {
                duration: this.getDuration(offset),
                loaded: this.getLoaded(offset),
                position: offset ? 0 : this.getPosition(),
                played: offset ? 0 : this.getPlayed()
            });
            break;
        default:
            this.trigger(outerEvent);
            break;
    }
};

/**
 * Генерация playId
 * @private
 */
AudioPlayer.prototype._generatePlayId = function() {
    this._playId = Math.random().toString().slice(2);
};

//------------------------------------------------------------------------- Common
/**
 * Возвращает обещание, разрешающееся после завершения инициализации.
 * @returns {Promise}
 */
AudioPlayer.prototype.initPromise = function() {
    return this.whenReady;
};

/**
 * Возвращает статус плеера
 * @returns {String}
 */
AudioPlayer.prototype.getState = function() {
    return this.state;
};

/**
 * Возвращает тип реализации плеера
 * @returns {String|null}
 */
AudioPlayer.prototype.getType = function() {
    return this.implementation && this.implementation.type;
};

/**
 * Возвращает ссылку на текущий трек
 * @param {int} [offset=0] - брать трек из активного плеера или из прелоадера. 0 - активный плеер, 1 - прелоадер.
 * @returns {IAudioImplementation|null}
 */
AudioPlayer.prototype.getSrc = function(offset) {
    return this.implementation && this.implementation.getSrc(offset);
};

//------------------------------------------------------------------------- Playback

/**
 * Запуск воспроизведения
 * @param {String} src - ссылка на трек
 * @param {Number} [duration] - длительность трека. Актуально для флеш-реализации, в ней пока трек грузится
 * длительность определяется с погрешностью.
 * @returns {AbortablePromise}
 */
AudioPlayer.prototype.play = function(src, duration) {
    logger.info(this, "play", src, duration);

    this._played = 0;
    this._lastSkip = 0;
    this._generatePlayId();

    if (this._whenPlay) {
        this._whenPlay.reject("play");
    }
    if (this._whenPause) {
        this._whenPause.reject("play");
    }
    if (this._whenStop) {
        this._whenStop.reject("play");
    }

    var promise = this._waitEvents("_whenPlay", [AudioPlayer.EVENT_PLAY], [
        AudioPlayer.EVENT_STOP,
        AudioPlayer.EVENT_ERROR,
        AudioPlayer.EVENT_CRASHED
    ]);

    promise.abort = function() {
        if (this._whenPlay) {
            this._whenPlay.reject.apply(this._whenPlay, arguments);
            this.stop();
        }
    }.bind(this);

    this.implementation.play(src, duration);

    return promise;
};

/**
 * Остановка воспроизведения
 * @param {int} [offset=0] - активный плеер или прелоадер. 0 - активный плеер. 1 - прелоадер.
 * @returns {AbortablePromise}
 */
AudioPlayer.prototype.stop = function(offset) {
    logger.info(this, "stop", offset);

    if (offset !== 0) {
        return this.implementation.stop(offset);
    }

    this._played = 0;
    this._lastSkip = 0;

    if (this._whenPlay) {
        this._whenPlay.reject("stop");
    }
    if (this._whenPause) {
        this._whenPause.reject("stop");
    }

    var promise;
    if (this._whenStop) {
        promise = this._whenStop.promise();
    } else {
        promise = this._waitEvents("_whenStop", [AudioPlayer.EVENT_STOP], [
            AudioPlayer.EVENT_PLAY,
            AudioPlayer.EVENT_ERROR,
            AudioPlayer.EVENT_CRASHED
        ]);
    }

    this.implementation.stop();

    return promise;
};

/**
 * Поставить плеер на паузу
 * @returns {AbortablePromise}
 */
AudioPlayer.prototype.pause = function() {
    logger.info(this, "pause");

    if (this.state !== AudioPlayer.STATE_PLAYING) {
        return reject(new AudioError(AudioError.BAD_STATE));
    }

    var promise;

    if (this._whenPlay) {
        this._whenPlay.reject("pause");
    }

    if (this._whenPause) {
        promise = this._whenPause.promise();
    } else {
        promise = this._waitEvents("_whenPause", [AudioPlayer.EVENT_PAUSE], [
            AudioPlayer.EVENT_STOP,
            AudioPlayer.EVENT_PLAY,
            AudioPlayer.EVENT_ERROR,
            AudioPlayer.EVENT_CRASHED
        ]);
    }

    this.implementation.pause();

    return promise;
};

/**
 * Снятие плеера с паузы
 * @returns {AbortablePromise}
 */
AudioPlayer.prototype.resume = function() {
    logger.info(this, "resume");

    if (this.state === AudioPlayer.STATE_PLAYING && !this._whenPause) {
        return Promise.resolve();
    }

    if (!(this.state === AudioPlayer.STATE_IDLE || this.state === AudioPlayer.STATE_PAUSED || this.state
        === AudioPlayer.STATE_PLAYING)) {
        return reject(new AudioError(AudioError.BAD_STATE));
    }

    var promise;

    if (this._whenPause) {
        this._whenPause.reject("resume");
    }

    if (this._whenPlay) {
        promise = this._whenPlay.promise();
    } else {
        promise = this._waitEvents("_whenPlay", [AudioPlayer.EVENT_PLAY], [
            AudioPlayer.EVENT_STOP,
            AudioPlayer.EVENT_ERROR,
            AudioPlayer.EVENT_CRASHED
        ]);
    }

    this.implementation.resume();

    return promise;
};

//abortable
/**
 * Запуск воспроизведения предзагруженного трека
 * @param {String} src - ссылка на трек
 * @returns {AbortablePromise}
 */
AudioPlayer.prototype.playPreloaded = function(src) {
    logger.info(this, "playPreloaded", src);

    if (!this.isPreloaded(src)) {
        logger.warn(this, "playPreloadedBadTrack", AudioError.NOT_PRELOADED);
        return reject(new AudioError(AudioError.NOT_PRELOADED));
    }

    this._played = 0;
    this._lastSkip = 0;
    this._generatePlayId();

    if (this._whenPlay) {
        this._whenPlay.reject("playPreloaded");
    }
    if (this._whenPause) {
        this._whenPause.reject("playPreloaded");
    }
    if (this._whenStop) {
        this._whenStop.reject("playPreloaded");
    }

    var promise = this._waitEvents("_whenPlay", [AudioPlayer.EVENT_PLAY], [
        AudioPlayer.EVENT_STOP,
        AudioPlayer.EVENT_ERROR,
        AudioPlayer.EVENT_CRASHED
    ]);
    promise.abort = function() {
        if (this._whenPlay) {
            this._whenPlay.reject.apply(this._whenPlay, arguments);
            this.stop();
        }
    }.bind(this);

    var result = this.implementation.playPreloaded();

    if (!result) {
        logger.warn(this, "playPreloadedError", AudioError.NOT_PRELOADED);
        this._whenPlay.reject(new AudioError(AudioError.NOT_PRELOADED));
    }

    return promise;
};

//------------------------------------------------------------------------- Preload
//abortable
/**
 * Предзагрузка трека
 * @param {String} src - ссылка на трек
 * @param {Number} [duration] - длительность трека. Актуально для флеш-реализации, в ней пока трек грузится
 * длительность определяется с погрешностью.
 * @returns {Promise}
 */
AudioPlayer.prototype.preload = function(src, duration) {
    logger.info(this, "preload", src, duration);

    if (this._whenPreload) {
        this._whenPreload.reject("preload");
    }

    var promise = this._waitEvents("_whenPreload", [
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_LOADING,
        AudioPlayer.EVENT_SWAP
    ], [
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_CRASHED,
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_ERROR,
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_STOP
    ]);

    promise.abort = function() {
        if (this._whenPreload) {
            this._whenPreload.reject.apply(this._whenPreload, arguments);
            this.stop(1);
        }
    }.bind(this);

    this.implementation.preload(src, duration);

    return promise;
};

/**
 * Проверка, что трек предзагружен
 * @param {String} src - ссылка на трек
 */
AudioPlayer.prototype.isPreloaded = function(src) {
    return this.implementation.isPreloaded(src);
};

/**
 * Проверка, что трек предзагружается
 * @param {String} src - ссылка на трек
 */
AudioPlayer.prototype.isPreloading = function(src) {
    return this.implementation.isPreloading(src, 1);
};

//------------------------------------------------------------------------- Timings
/**
 * Получение позиции воспроизведения
 * @returns {Number}
 */
AudioPlayer.prototype.getPosition = function() {
    return this.implementation.getPosition();
};

/**
 * Установка позиции воспроизведения
 * @param {Number} position - новая позиция воспроизведения
 * @returns {Number} -- конечная позиция воспроизведения
 */
AudioPlayer.prototype.setPosition = function(position) {
    logger.info(this, "setPosition", position);

    if (this.implementation.type == "flash") {
        position = Math.max(0, Math.min(this.getLoaded(), position));
    } else {
        position = Math.max(0, Math.min(this.getDuration(), position));
    }

    this._played += this.getPosition() - this._lastSkip;
    this._lastSkip = position;

    this.implementation.setPosition(position);

    return position;
};

/**
 * Получение длительности трека
 * @param {Boolean|int} preloader - активный плеер или предзагрузчик. 0 - активный плеер, 1 - предзагрузчик
 * @returns {Number}
 */
AudioPlayer.prototype.getDuration = function(preloader) {
    return this.implementation.getDuration(preloader ? 1 : 0);
};

/**
 * Получение длительности загруженной части
 * @param {Boolean|int} preloader - активный плеер или предзагрузчик. 0 - активный плеер, 1 - предзагрузчик
 * @returns {Number}
 */
AudioPlayer.prototype.getLoaded = function(preloader) {
    return this.implementation.getLoaded(preloader ? 1 : 0);
};

/**
 * Получение длительности воспроизведения
 * @returns {Number}
 */
AudioPlayer.prototype.getPlayed = function() {
    var position = this.getPosition();
    this._played += position - this._lastSkip;
    this._lastSkip = position;

    return this._played;
};

//------------------------------------------------------------------------- Volume
/**
 * Получение громкости плеера
 * @returns {Number}
 */
AudioPlayer.prototype.getVolume = function() {
    if (!this.implementation) {
        return 0;
    }

    return this.implementation.getVolume();
};

/**
 * Установка громкости плеера
 * @param {Number} volume - новое значение громкости
 * @returns {Number} -- итоговое значение громкости
 */
AudioPlayer.prototype.setVolume = function(volume) {
    logger.info(this, "setVolume", volume);

    if (!this.implementation) {
        return 0;
    }

    return this.implementation.setVolume(volume);
};

/**
 * Проверка, что громкость управляется устройством, а не програмно
 * @returns {Boolean}
 */
AudioPlayer.prototype.isDeviceVolume = function() {
    if (!this.implementation) {
        return true;
    }

    return this.implementation.isDeviceVolume();
};

//------------------------------------------------------------------------- Web Audio API
/**
 * Переключение режима использования Web Audio API. Доступен только при html5-реализации плеера.
 *
 * **Внимание!** - после включения режима Web Audio API он не отключается полностью, т.к. для этого требуется
 * реинициализация плеера, которой требуется клик пользователя. При отключении из графа обработки исключаются
 * все ноды кроме нод-источников и ноды вывода, управление громкостью переключается на элементы audio, без
 * использования GainNode
 * @param {Boolean} state - запрашиваемый статус
 * @returns {Boolean} -- итоговый статус плеера
 */
AudioPlayer.prototype.toggleWebAudioAPI = function(state) {
    logger.info(this, "toggleWebAudioAPI", state);
    if (this.implementation.type !== "html5") {
        logger.warn(this, "toggleWebAudioAPIFailed", this.implementation.type);
        return false;
    }

    return this.implementation.toggleWebAudioAPI(state);
};

/**
 * Аудио-препроцессор
 * @typedef {Object} ya.Audio~AudioPreprocessor
 *
 * @property {AudioNode} input - нода, в которую перенаправляется вывод аудио
 * @property {AudioNode} output - нода из которой вывод подаётся на усилитель
 */

/**
 * Подключение аудио препроцессора. Вход препроцессора подключается к аудио-элементу у которого выставлена
 * 100% громкость. Выход препроцессора подключается к GainNode, которая регулирует итоговую громкость
 * @param {ya.Audio~AudioPreprocessor} preprocessor - препроцессор
 * @returns {boolean} -- статус успеха
 */
AudioPlayer.prototype.setAudioPreprocessor = function(preprocessor) {
    logger.info(this, "setAudioPreprocessor");
    if (this.implementation.type !== "html5") {
        logger.warn(this, "setAudioPreprocessorFailed", this.implementation.type);
        return false;
    }

    return this.implementation.setAudioPreprocessor(preprocessor);
};

//------------------------------------------------------------------------- PlayId
/**
 * Получение playId
 * @returns {String}
 */
AudioPlayer.prototype.getPlayId = function() {
    return this._playId;
};

/**
 * Вспомогательная функция для отображения состояния плеера в логе.
 * @private
 */
AudioPlayer.prototype._logger = function() {
    return {
        index: this.implementation && this.implementation.name,
        src: this.implementation && this.implementation._logger(),
        type: this.implementation && this.implementation.type
    };
};

module.exports = AudioPlayer;

},{"./audio-static":5,"./config":6,"./error/audio-error":7,"./flash/audio-flash":11,"./html5/audio-html5":21,"./lib/async/deferred":23,"./lib/async/events":24,"./lib/async/reject":26,"./lib/browser/detect":27,"./lib/data/merge":32,"./logger/logger":37}],5:[function(require,module,exports){
/**
 * @namespace AudioStatic
 * @private
 */
var AudioStatic = {};

/** @type {String}
 * @const*/
AudioStatic.EVENT_PLAY = "play";
/** @type {String}
 * @const */
AudioStatic.EVENT_STOP = "stop";

/** @type {String}
 * @const */
AudioStatic.EVENT_PAUSE = "pause";
/** @type {String}
 * @const */
AudioStatic.EVENT_PROGRESS = "progress";

/** @type {String}
 * @const */
AudioStatic.EVENT_LOADING = "loading";
/** @type {String}
 * @const */
AudioStatic.EVENT_LOADED = "loaded";

/** @type {String}
 * @const */
AudioStatic.EVENT_VOLUME = "volumechange";

/** @type {String}
 * @const */
AudioStatic.EVENT_ENDED = "ended";
/** @type {String}
 * @const */
AudioStatic.EVENT_CRASHED = "crashed";
/** @type {String}
 * @const */
AudioStatic.EVENT_ERROR = "error";

/** @type {String}
 * @const */
AudioStatic.EVENT_STATE = "state";
/** @type {String}
 * @const */
AudioStatic.EVENT_SWAP = "swap";

/** @type {String}
 * @const */
AudioStatic.PRELOADER_EVENT = "preloader:";

/** @type {String}
 * @const */
AudioStatic.STATE_INIT = "init";
/** @type {String}
 * @const */
AudioStatic.STATE_CRASHED = "crashed";
/** @type {String}
 * @const */
AudioStatic.STATE_IDLE = "idle";
/** @type {String}
 * @const */
AudioStatic.STATE_PLAYING = "playing";
/** @type {String}
 * @const */
AudioStatic.STATE_PAUSED = "paused";

module.exports = AudioStatic;

},{}],6:[function(require,module,exports){
/**
 * Настойки библиотеки
 * @alias ya.Audio.config
 * @namespace
 */
var config = {
    /**
     * Общие настройки
     * @namespace
     */
    audio: {
        /**
         * Количество попыток реинициализации
         * @type {Number}
         */
        retry: 3
    },
    /**
     * Настройки подключения flash-плеера
     * @namespace
     */
    flash: {
        /**
         * Путь к .swf файлу флеш-плеера
         * @type {String}
         */
        path: "dist",
        /**
         * Имя .swf файла флеш-плеера
         * @type {String}
         */
        name: "player-2_0.swf",
        /**
         * Минимальная версия флеш-плеера
         * @type {String}
         */
        version: "9.0.28",
        /**
         * ID, который будет выставлен для элемента с flash-плеером
         * @type {String}
         */
        playerID: "YandexAudioFlashPlayer",
        /**
         * Имя функции-обработчика событий flash-плеера
         * @type {String}
         * @const
         */
        callback: "ya.Audio._flashCallback",
        /**
         * Таймаут инициализации
         * @type {Number}
         */
        initTimeout: 3000, // 3 sec
        /**
         * Таймаут загрузки
         * @type {Number}
         */
        loadTimeout: 5000,
        /**
         * Таймаут инициализации после клика
         * @type {Number}
         */
        clickTimeout: 1000,
        /**
         * Интервал проверки доступности flash-плеера
         * @type {Number}
         */
        heartBeatInterval: 1000
    },
    /**
     * Описание настроек html5 плеера
     * @namespace
     */
    html5: {
        /**
         * Список идентификаторов для которых лучше не использовать html5 плеер. Используется при
         * авто-определении типа плеера. Идентификаторы сравниваются со строкой построенной по шаблону
         * `@<platform.version> <platform.os>:<browser.name>/<browser.version>`
         * @type {Array.<Number>}
         */
        blacklist: ["linux:mozilla", "unix:mozilla", "macos:mozilla", ":opera", "@NT 5", "@NT 4"]
    }
};

module.exports = config;

},{}],7:[function(require,module,exports){
var ErrorClass = require('../lib/class/error-class');

/**
 * @class Класс ошибки аудио-пллеера
 * @alias ya.Audio.AudioError
 *
 * @param {String} message - текст ошибки
 *
 * @extends Error
 *
 * @constructor
 */
var AudioError = function(message) {
    ErrorClass.call(this, message);
};
AudioError.prototype = ErrorClass.create("AudioError");

/**
 * Не найдена реализация плеера или все доступные реализации потерпели крах при инициализации.
 * @type {string}
 * @const
 */
AudioError.NO_IMPLEMENTATION = "cannot find suitable implementation";
/**
 * Трек не был предзагружен или во время загрузки произошла ошибка.
 * @type {string}
 * @const
 */
AudioError.NOT_PRELOADED = "track is not preloaded";
/**
 * Действие не доступно из текущего состояния
 * @type {string}
 * @const
 */
AudioError.BAD_STATE = "action is not permited from current state";

/**
 * Flash-плеер был заблокирован
 * @type {string}
 * @const
 */
AudioError.FLASH_BLOCKER = "flash is rejected by flash blocker plugin";
/**
 * Flash-плеер потерпел крах при инициализации по неизвестным причинам
 * @type {string}
 * @const
 */
AudioError.FLASH_UNKNOWN_CRASH = "flash is crashed without reason";
/**
 * Flash-плеер потерпел крах при инициализации из-за таймаута
 * @type {string}
 * @const
 */
AudioError.FLASH_INIT_TIMEOUT = "flash init timed out";
/**
 * Внутренняя ошибка Flash-плеера
 * @type {string}
 * @const
 */
AudioError.FLASH_INTERNAL_ERROR = "flash internal error";
/**
 * Попытка вызвать недоступный экземляр Flash-плеера
 * @type {string}
 * @const
 */
AudioError.FLASH_EMMITER_NOT_FOUND = "flash event emmiter not found";
/**
 * Flash-плеер перестал отвечать на запросы
 * @type {string}
 * @const
 */
AudioError.FLASH_NOT_RESPONDING = "flash player doesn't response";

module.exports = AudioError;

},{"../lib/class/error-class":30}],8:[function(require,module,exports){
require('../export');

var AudioError = require('./audio-error');
var PlaybackError = require('./playback-error');

ya.Audio.AudioError = AudioError;
ya.Audio.PlaybackError = PlaybackError;

},{"../export":10,"./audio-error":7,"./playback-error":9}],9:[function(require,module,exports){
var ErrorClass = require('../lib/class/error-class');

/**
 * Класс ошибки воспроизведения
 * @alias ya.Audio.PlaybackError
 *
 * @param {String} message - текст ошибки
 * @param {String} src - ссылка на трек
 *
 * @extends Error
 *
 * @enum {String}
 * @constructor
 */
var PlaybackError = function(message, src) {
    ErrorClass.call(this, message);

    this.src = src;
};

PlaybackError.prototype = ErrorClass.create("PlaybackError");

/**
 * Отмена соединенния
 * @type {string}
 * @const
 */
PlaybackError.CONNECTION_ABORTED = "Connection aborted";
/**
 * Сетевая ошибка
 * @type {string}
 * @const
 */
PlaybackError.NETWORK_ERROR = "Network error";
/**
 * Ошибка декодирования аудио
 * @type {string}
 * @const
 */
PlaybackError.DECODE_ERROR = "Decode error";
/**
 * Не доступный источник
 * @type {string}
 * @const
 */
PlaybackError.BAD_DATA = "Bad data";

/**
 * Таблица соответствия кодов ошибок html5 плеера
 * @enum {String}
 */
PlaybackError.html5 = {
    1: PlaybackError.CONNECTION_ABORTED,
    2: PlaybackError.NETWORK_ERROR,
    3: PlaybackError.DECODE_ERROR,
    4: PlaybackError.BAD_DATA
};

module.exports = PlaybackError;

},{"../lib/class/error-class":30}],10:[function(require,module,exports){
if (typeof window.ya === "undefined") {
    window.ya = {};
}
var ya = window.ya;

if (typeof ya.Audio === "undefined") {
    ya.Audio = {};
}

var config = require('./config');
var AudioPlayer = require('./audio-player');
var Proxy = require('./lib/class/proxy');

ya.Audio = Proxy.createClass(AudioPlayer);
ya.Audio.config = config;

module.exports = ya.Audio;

},{"./audio-player":4,"./config":6,"./lib/class/proxy":31}],11:[function(require,module,exports){
var config = require('../config');
var swfobject = require('../lib/browser/swfobject');
var detect = require('../lib/browser/detect');
var Logger = require('../logger/logger');
var logger = new Logger('AudioFlash');
var FlashManager = require('./flash-manager');
var FlashInterface = require('./flash-interface');
var Events = require('../lib/async/events');

var playerId = 1;

var flashManager;

var flashVersion = swfobject.getFlashPlayerVersion();
detect.flashVersion = flashVersion.major + "." + flashVersion.minor + "." + flashVersion.release;

exports.available = swfobject.hasFlashPlayerVersion(config.flash.version);
logger.info(this, "detection", exports.available);

/**
 * @class Класс flash аудио-плеера
 * @extends IAudioImplementation
 *
 * @fires IAudioImplementation#play
 * @fires IAudioImplementation#ended
 * @fires IAudioImplementation#volumechange
 * @fires IAudioImplementation#crashed
 * @fires IAudioImplementation#swap
 *
 * @fires IAudioImplementation#stop
 * @fires IAudioImplementation#pause
 * @fires IAudioImplementation#progress
 * @fires IAudioImplementation#loading
 * @fires IAudioImplementation#loaded
 * @fires IAudioImplementation#error
 *
 * @param {HMTLElement} [overlay] - место для встраивания плеера (актуально только для flash-плеера)
 * @param {Boolean} [force=false] - создать новый экзепляр FlashManager
 * @constructor
 * @private
 */
var AudioFlash = function(overlay, force) {
    this.name = playerId++;
    logger.debug(this, "constructor");

    if (!flashManager || force) {
        flashManager = new FlashManager(overlay);
    }

    Events.call(this);

    this.whenReady = flashManager.createPlayer(this);
    this.whenReady.then(function(data) {
        logger.info(this, "ready", data);
    }.bind(this), function(e) {
        logger.error(this, "failed", e);
    }.bind(this));
};
Events.mixin(AudioFlash);

AudioFlash.type = AudioFlash.prototype.type = "flash";

Object.keys(FlashInterface.prototype).filter(function(key) {
    return FlashInterface.prototype.hasOwnProperty(key) && key[0] !== "_";
}).map(function(method) {
    AudioFlash.prototype[method] = function() {
        if (!/^get/.test(method)) {
            logger.debug(this, method);
        }

        if (!this.hasOwnProperty("id")) {
            logger.warn(this, "player is not ready");
            return null;
        }

        var args = [].slice.call(arguments);
        args.unshift(this.id);
        return flashManager.flash[method].apply(flashManager.flash, args);
    }
});

/**
 * Проиграть трек
 * @method AudioFlash#play
 * @param {String} src - ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 */

/**
 * Поставить трек на паузу
 * @method AudioFlash#pause
 */

/**
 * Снять трек с паузы
 * @method AudioFlash#resume
 */

/**
 * Остановить воспроизведение и загрузку трека
 * @method AudioFlash#stop
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 */

/**
 * Предзагрузить трек
 * @method AudioFlash#preload
 * @param {String} src - Ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 */

/**
 * Проверить что трек предзагружается
 * @method AudioFlash#isPreloaded
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */

/**
 * Проверить что трек предзагружается
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */

/**
 * Проверить что трек начал предзагружаться
 * @method AudioFlash#isPreloading
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */

/**
 * Запустить воспроизведение предзагруженного трека
 * @method AudioFlash#playPreloaded
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean} -- доступность данного действия
 */

/**
 * Получить позицию воспроизведения
 * @method AudioFlash#getPosition
 * @returns {number}
 */

/**
 * Установить текущую позицию воспроизведения
 * @method AudioFlash#setPosition
 * @param {number} position
 */

/**
 * Получить длительность трека
 * @method AudioFlash#getDuration
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */

/**
 * Получить длительность загруженной части трека
 * @method AudioFlash#getLoaded
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */

/**
 * Получить текущее значение громкости
 * @method AudioFlash#getVolume
 * @returns {number}
 */

/**
 * Установить значение громкости
 * @method AudioFlash#setVolume
 * @param {number} volume
 */

/**
 * Получить ссылку на трек
 * @method AudioFlash#getSrc
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {String|Boolean} -- Ссылка на трек или false, если нет загружаемого трека
 */

/**
 * Проверить доступен ли программный контроль громкости
 * @returns {boolean}
 */
AudioFlash.prototype.isDeviceVolume = function() {
    return true;
};

/**
 * Вспомогательная функция для отображения состояния плеера в логе.
 * @private
 */
AudioFlash.prototype._logger = function() {
    try {
        if (!this.hasOwnProperty("id")) {
            return {
                main: "not ready",
                preloader: "not ready"
            };
        }
        return {
            main: this.getSrc(0),
            preloader: this.getSrc(1)
        };
    } catch(e) {
        return "";
    }
};

exports.AudioImplementation = AudioFlash;

},{"../config":6,"../lib/async/events":24,"../lib/browser/detect":27,"../lib/browser/swfobject":28,"../logger/logger":37,"./flash-interface":12,"./flash-manager":13}],12:[function(require,module,exports){
var config = require('../config');
var Logger = require('../logger/logger');
var logger = new Logger('FlashInterface');

/**
 * @class Описание внешнего интерфейса flash-плеера
 * @param {Object} flash - swf-объект
 * @constructor
 * @private
 */
var FlashInterface = function(flash) {
    this.flash = ya.Audio._flash = flash;
};

/**
 * Вызвать метод flash-плеера
 * @param {String} fn - название метода
 * @returns {*}
 * @private
 */
FlashInterface.prototype._callFlash = function(fn) {
    //logger.debug(this, fn, arguments);

    try {
        return this.flash.call.apply(this.flash, arguments);
    } catch(e) {
        logger.error(this, "_callFlashError", e);
        return null;
    }
};

/**
 * Проверка обратной связи с flash-плеером
 * @throws Ошибка доступа к flash-плееру
 * @private
 */
FlashInterface.prototype._heartBeat = function() {
    this._callFlash("heartBeat", -1);
};

/**
 * Добавить новый плеер
 * @returns {int} -- id нового плеера
 * @private
 */
FlashInterface.prototype._addPlayer = function() {
    return this._callFlash("addPlayer", -1);
};

/**
 * Установить громкость
 * @param {int} id - id плеера
 * @param {Number} volume - желаемая громкость
 */
FlashInterface.prototype.setVolume = function(id, volume) {
    this._callFlash("setVolume", -1, volume);
};

/**
 * Получить значение громкости
 * @returns {Number}
 */
FlashInterface.prototype.getVolume = function() {
    return this._callFlash("getVolume", -1);
};

/**
 * Запустить воспроизведение трека
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {Number} duration - длительность трека
 */
FlashInterface.prototype.play = function(id, src, duration) {
    this._callFlash("play", id, src, duration);
};

/**
 * Остановить воспроизведение и загрузку трека
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 */
FlashInterface.prototype.stop = function(id, offset) {
    this._callFlash("stop", id, offset || 0);
};

/**
 * Поставить трек на паузу
 * @param {int} id - id плеера
 */
FlashInterface.prototype.pause = function(id) {
    this._callFlash("pause", id);
};

/**
 * Снять трек с паузы
 * @param {int} id - id плеера
 */
FlashInterface.prototype.resume = function(id) {
    this._callFlash("resume", id);
};

/**
 * Предзагрузить трек
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {Number} duration - длительность трека
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @returns {Boolean} -- возможность данного действия
 */
FlashInterface.prototype.preload = function(id, src, duration, offset) {
    return this._callFlash("preload", id, src, duration, offset == null ? 1 : 0);
};

/**
 * Проверить что трек предзагружается
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @returns {Boolean}
 */
FlashInterface.prototype.isPreloaded = function(id, src, offset) {
    return this._callFlash("isPreloaded", id, src, offset == null ? 1 : 0);
};

/**
 * Проверить что трек начал предзагружаться
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @returns {Boolean}
 */
FlashInterface.prototype.isPreloading = function(id, src, offset) {
    return this._callFlash("isPreloading", id, src, offset == null ? 1 : 0);
};

/**
 * Запустить воспроизведение предзагруженного трека
 * @param {int} id - id плеера
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean} -- доступность данного действия
 */
FlashInterface.prototype.playPreloaded = function(id, offset) {
    return this._callFlash("playPreloaded", id, offset == null ? 1 : 0);
};

/**
 * Получить позицию воспроизведения
 * @param {int} id - id плеера
 * @returns {Number}
 */
FlashInterface.prototype.getPosition = function(id) {
    return this._callFlash("getPosition", id);
};

/**
 * Установить текущую позицию воспроизведения
 * @param {int} id - id плеера
 * @param {number} position
 */
FlashInterface.prototype.setPosition = function(id, position) {
    this._callFlash("setPosition", id, position);
};

/**
 * Получить длительность трека
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {Number}
 */
FlashInterface.prototype.getDuration = function(id, offset) {
    return this._callFlash("getDuration", id, offset || 0);
};

/**
 * Получить длительность загруженной части трека
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {Number}
 */
FlashInterface.prototype.getLoaded = function(id, offset) {
    return this._callFlash("getLoaded", id, offset || 0);
};

/**
 * Получить ссылку на трек
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {String}
 */
FlashInterface.prototype.getSrc = function(id, offset) {
    return this._callFlash("getSrc", id, offset || 0);
};

module.exports = FlashInterface;

},{"../config":6,"../logger/logger":37}],13:[function(require,module,exports){
var Logger = require('../logger/logger');
var logger = new Logger('FlashBridge');

var config = require('../config');

var AudioStatic = require('../audio-static');
var flashLoader = require('./loader');
var FlashInterface = require('./flash-interface');

var Deferred = require('../lib/async/deferred');

var AudioError = require('../error/audio-error');
var LoaderError = require('../lib/net/error/loader-error');

/**
 * @class Загрузка flash-плеера и обработка событий
 * @param {HTMLElement} overlay - объект для загрузки и показа flash-плеера
 * @constructor
 * @private
 */
var FlashManager = function(overlay) { // singleton!
    logger.debug(this, "constructor", overlay);

    this.state = "init";
    this.overlay = overlay;
    this.emmiters = [];

    var deferred = this.deferred = new Deferred();
    /**
     * Обещание, которое разрешается при завершении инициализации
     * @type {Promise}
     */
    this.whenReady = this.deferred.promise();

    var callbackPath = config.flash.callback.split(".");
    var callbackName = callbackPath.pop();
    var callbackCont = window;
    callbackPath.forEach(function(part) {
        if (!callbackCont[part]) {
            callbackCont[part] = {};
        }
        callbackCont = callbackCont[part];
    });
    callbackCont[callbackName] = this._onEvent.bind(this);

    this.__loadTimeout = setTimeout(this._onLoadTimeout, config.flash.loadTimeout);
    flashLoader(config.flash.path + "/"
        + config.flash.name, config.flash.version, config.flash.playerID, this._onLoad.bind(this), {}, overlay);

    if (overlay) {
        var timeout;
        overlay.addEventListener("mousedown", function() { //KNOWLEDGE: only mousedown event and only wmode: transparent
            timeout = timeout || setTimeout(function() {
                    deferred.reject(new AudioError(AudioError.FLASH_NOT_RESPONDING));
                }, config.flash.clickTimeout);
        }, true);
    }

    this.whenReady.then(function(result) {
        timeout = timeout && clearTimeout(timeout);
        logger.info(this, "ready", result);
    }.bind(this), function(e) {
        flashManager = null; // если обломались удаляем экземпляр менеджера, чтобы можно было было пытаться снова
        logger.error(this, "failed", e);
    }.bind(this));
};

FlashManager.EVENT_INIT = "init";
FlashManager.EVENT_FAIL = "failed";

/**
 * Обработчик события загрузки плеера
 * @param data
 * @private
 */
FlashManager.prototype._onLoad = function(data) {
    logger.debug(this, "_onLoad", data);

    clearTimeout(this.__loadTimeout);
    delete this.__loadTimeout;

    if (data.success) {
        this.flash = new FlashInterface(data.ref);

        if (this.state === "ready") {
            this.deferred.resolve(data.ref);
        } else if (!this.overlay) {
            this.__initTimeout = setTimeout(this._onInitTimeout.bind(this), config.flash.initTimeout);
        }
    } else {
        this.state = "failed";
        this.deferred.reject(new AudioError(data.__fbn ? AudioError.FLASH_BLOCKER : AudioError.FLASH_UNKNOWN_CRASH));
    }
};

/**
 * Обработчик таймаута загрузки
 * @private
 */
FlashManager.prototype._onLoadTimeout = function() {
    this.state = "failed";
    this.deferred.reject(new LoaderError(LoaderError.TIMEOUT));
};

/**
 * Обработчик таймаута инициализации
 * @private
 */
FlashManager.prototype._onInitTimeout = function() {
    this.state = "failed";
    this.deferred.reject(new AudioError(AudioError.FLASH_INIT_TIMEOUT));
};

/**
 * Обработчик успешности инициализации
 * @private
 */
FlashManager.prototype._onInit = function() {
    logger.debug(this, "_onInit");

    this.state = "ready";

    if (this.__initTimeout) {
        clearTimeout(this.__initTimeout);
        delete this.__initTimeout;
    }

    if (this.flash) {
        this.deferred.resolve(this.flash);
        this.__heartbeat = setInterval(this._onHeartBeat.bind(this), 1000);
    }
};

/**
 * Обработчик событий, создаваемых flash-плеером
 * @param {String} event
 * @param {int} id - id плеера
 * @param {int} offset - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @param {*} data - данные переданные вместе с событием
 * @private
 */
FlashManager.prototype._onEvent = function(event, id, offset, data) {
    if (event === "debug") {
        console.debug("flashDEBUG", id, offset, data);
    }

    if (this.state === "failed") {
        logger.warn(this, "onEventFailed", event, id, offset, data);
        return;
    }

    logger.debug(this, "onEvent", event, id, offset);

    if (event === FlashManager.EVENT_INIT) {
        return this._onInit();
    }

    if (event === FlashManager.EVENT_FAIL) {
        logger.warn(this, "failed", AudioError.FLASH_INTERNAL_ERROR);
        this.deferred.reject(new AudioError(AudioError.FLASH_INTERNAL_ERROR));
        return;
    }

    if (id == -1) {
        this.emmiters.forEach(function(emmiter) {
            emmiter.trigger(event, offset, data);
        });
    } else if (this.emmiters[id]) {
        this.emmiters[id].trigger(event, offset, data);
    } else {
        logger.error(this, AudioError.FLASH_EMMITER_NOT_FOUND, id);
    }
};

/**
 * Проверка доступности flash-плеера
 * @private
 */
FlashManager.prototype._onHeartBeat = function() {
    try {
        this.flash._heartBeat();
    } catch(e) {
        logger.error(this, "crashed", e);
        this._onEvent(AudioStatic.EVENT_CRASHED, -1, e);
    }
};

/**
 * Создание нового плеера
 * @param {AudioFlash} audioFlash - flash аудио-плеер, который будет обслуживать созданный плеер
 * @returns {Promise} -- обещание, которое разрешается после завершения создания плеера
 */
FlashManager.prototype.createPlayer = function(audioFlash) {
    logger.debug(this, "createPlayer");

    var promise = this.whenReady.then(function() {
        audioFlash.id = this.flash._addPlayer();
        this.emmiters[audioFlash.id] = audioFlash;
        return audioFlash.id;
    }.bind(this));

    promise.then(function(playerId) {
        logger.debug(this, "createPlayerSuccess", playerId);
    }.bind(this), function(err) {
        logger.error(this, "createPlayerError", err);
    }.bind(this));

    return promise;
};

module.exports = FlashManager;

},{"../audio-static":5,"../config":6,"../error/audio-error":7,"../lib/async/deferred":23,"../lib/net/error/loader-error":34,"../logger/logger":37,"./flash-interface":12,"./loader":16}],14:[function(require,module,exports){
/**
 * @ignore
 * @file
 * This is a wrapper for swfobject that detects FlashBlock in browser.
 *
 * Wrapper detects:
 *   - Chrome
 *     - FlashBlock (https://chrome.google.com/webstore/detail/cdngiadmnkhgemkimkhiilgffbjijcie)
 *     - FlashBlock (https://chrome.google.com/webstore/detail/gofhjkjmkpinhpoiabjplobcaignabnl)
 *     - FlashFree (https://chrome.google.com/webstore/detail/ebmieckllmmifjjbipnppinpiohpfahm)
 *   - Firefox Flashblock (https://addons.mozilla.org/ru/firefox/addon/flashblock/)
 *   - Opera >= 11.5 "Enable plugins on demand" setting
 *   - Safari ClickToFlash Extension (http://hoyois.github.com/safariextensions/clicktoplugin/)
 *   - Safari ClickToFlash Plugin (for Safari < 5.0.6) (http://rentzsch.github.com/clicktoflash/)
 *
 * Tested on:
 *   - Chrome 12
 *     - FlashBlock by Lex1 1.2.11.12
 *     - FlashBlock by josorek 0.9.31
 *     - FlashFree 1.1.3
 *   - Firefox 5.0.1 + Flashblock 1.5.15.1
 *   - Opera 11.5
 *   - Safari 5.1 + ClickToFlash (2.3.2)
 *
 * Also this wrapper can remove blocked swf and let you downgrade to other options.
 *
 * Feel free to contact me via email.
 *
 * Copyright 2011, Alexey Androsov
 * Dual licensed under the MIT (http://www.opensource.org/licenses/mit-license.php) or GPL Version 3 (http://www.gnu.org/licenses/gpl.html) licenses.
 *
 * Thanks to flashblockdetector project (http://code.google.com/p/flashblockdetector)
 *
 * @requires swfobject
 * @author Alexey Androsov <doochik@ya.ru>
 * @version 1.0
 */

var swfobject = require('../lib/browser/swfobject');

function remove(node) {
    node.parentNode.removeChild(node);
}

/**
 * Модуль загрузки флеш-плеера с возможностью отслеживания блокировщиков
 * @namespace
 * @private
 */
var FlashBlockNotifier = {

    /**
     * CSS-class for swf wrapper.
     * @protected
     * @default fbn-swf-wrapper
     * @type String
     */
    __SWF_WRAPPER_CLASS: 'fbn-swf-wrapper',

    /**
     * Timeout for flash block detect
     * @default 500
     * @protected
     * @type Number
     */
    __TIMEOUT: 500,

    __TESTS: [
        // Chome FlashBlock extension (https://chrome.google.com/webstore/detail/cdngiadmnkhgemkimkhiilgffbjijcie)
        // Chome FlashBlock extension (https://chrome.google.com/webstore/detail/gofhjkjmkpinhpoiabjplobcaignabnl)
        function(swfNode, wrapperNode) {
            // we expect that swf is the only child of wrapper
            return wrapperNode.childNodes.length > 1
        }, // older Safari ClickToFlash (http://rentzsch.github.com/clicktoflash/)
        function(swfNode) {
            // IE has no swfNode.type
            return swfNode.type && swfNode.type != 'application/x-shockwave-flash'
        }, // FlashBlock for Firefox (https://addons.mozilla.org/ru/firefox/addon/flashblock/)
        // Chrome FlashFree (https://chrome.google.com/webstore/detail/ebmieckllmmifjjbipnppinpiohpfahm)
        function(swfNode) {
            // swf have been detached from DOM
            return !swfNode.parentNode;
        }, // Safari ClickToFlash Extension (http://hoyois.github.com/safariextensions/clicktoplugin/)
        function(swfNode) {
            return swfNode.parentNode.className.indexOf('CTFnodisplay') > -1;
        }
    ],

    /**
     * Embed SWF info page. This function has same options as swfobject.embedSWF except last param removeBlockedSWF.
     * @see http://code.google.com/p/swfobject/wiki/api
     * @param swfUrlStr
     * @param replaceElemIdStr
     * @param widthStr
     * @param heightStr
     * @param swfVersionStr
     * @param xiSwfUrlStr
     * @param flashvarsObj
     * @param parObj
     * @param attObj
     * @param callbackFn
     * @param {Boolean} [removeBlockedSWF=true] Remove swf if blocked
     */
    embedSWF: function(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj,
                       parObj, attObj, callbackFn, removeBlockedSWF) {
        // var swfobject = window['swfobject'];

        if (!swfobject) {
            return;
        }

        swfobject.addDomLoadEvent(function() {
            var replaceElement = document.getElementById(replaceElemIdStr);
            if (!replaceElement) {
                return;
            }

            // We need to create div-wrapper because some flash block plugins replace swf with another content.
            // Also some flash requires wrapper to work properly.
            var wrapper = document.createElement('div');
            wrapper.className = FlashBlockNotifier.__SWF_WRAPPER_CLASS;

            replaceElement.parentNode.replaceChild(wrapper, replaceElement);
            wrapper.appendChild(replaceElement);

            swfobject.embedSWF(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj, parObj, attObj, function(e) {
                // e.success === false means that browser don't have flash or flash is too old
                // @see http://code.google.com/p/swfobject/wiki/api
                if (!e || e.success === false) {
                    callbackFn(e);

                } else {
                    var swfElement = e['ref'];
                    // Opera 11.5 and above replaces flash with SVG button
                    // msie (and canary chrome 32.0) crashes on swfElement['getSVGDocument']()
                    var replacedBySVG = false;
                    try {
                        replacedBySVG = swfElement && swfElement['getSVGDocument'] && swfElement['getSVGDocument']();
                    } catch(err) {
                    }
                    if (replacedBySVG) {
                        onFailure(e);

                    } else {
                        //set timeout to let FlashBlock plugin detect swf and replace it some contents
                        window.setTimeout(function() {
                            var TESTS = FlashBlockNotifier.__TESTS;
                            for (var i = 0, j = TESTS.length; i < j; i++) {
                                if (TESTS[i](swfElement, wrapper)) {
                                    onFailure(e);
                                    return;
                                }
                            }
                            callbackFn(e);
                        }, FlashBlockNotifier.__TIMEOUT);
                    }
                }

                function onFailure(e) {
                    if (removeBlockedSWF !== false) {
                        //remove swf
                        swfobject.removeSWF(replaceElemIdStr);
                        //remove wrapper
                        remove(wrapper);

                        //remove extension artefacts

                        //ClickToFlash artefacts
                        var ctf = document.getElementById('CTFstack');
                        if (ctf) {
                            remove(ctf);
                        }

                        //Chrome FlashBlock artefact
                        var lastBodyChild = document.body.lastChild;
                        if (lastBodyChild && lastBodyChild.className == 'ujs_flashblock_placeholder') {
                            remove(lastBodyChild);
                        }
                    }
                    e.success = false;
                    e.__fbn = true;
                    callbackFn(e);
                }
            });
        });
    }
};

module.exports = FlashBlockNotifier;

},{"../lib/browser/swfobject":28}],15:[function(require,module,exports){
var swfobject = require('../lib/browser/swfobject');

/**
 * Модуль загрузки флеш-плеера
 * @namespace
 * @private
 */
var FlashEmbedder = {

    /**
     * CSS-class for swf wrapper.
     * @protected
     * @default femb-swf-wrapper
     * @type String
     */
    __SWF_WRAPPER_CLASS: 'femb-swf-wrapper',

    /**
     * Timeout for flash block detect
     * @default 500
     * @protected
     * @type Number
     */
    __TIMEOUT: 500,

    /**
     * Embed SWF info page. This function has same options as swfobject.embedSWF
     * @see http://code.google.com/p/swfobject/wiki/api
     * @param swfUrlStr
     * @param replaceElemIdStr
     * @param widthStr
     * @param heightStr
     * @param swfVersionStr
     * @param xiSwfUrlStr
     * @param flashvarsObj
     * @param parObj
     * @param attObj
     * @param callbackFn
     */
    embedSWF: function(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj,
                       parObj, attObj, callbackFn) {
        swfobject.addDomLoadEvent(function() {
            var replaceElement = document.getElementById(replaceElemIdStr);
            if (!replaceElement) {
                return;
            }

            // We need to create div-wrapper because some flash block plugins replace swf with another content.
            // Also some flash requires wrapper to work properly.
            var wrapper = document.createElement('div');
            wrapper.className = FlashEmbedder.__SWF_WRAPPER_CLASS;

            replaceElement.parentNode.replaceChild(wrapper, replaceElement);
            wrapper.appendChild(replaceElement);

            swfobject.embedSWF(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj, parObj, attObj, function(e) {
                // e.success === false means that browser don't have flash or flash is too old
                // @see http://code.google.com/p/swfobject/wiki/api
                if (!e || e.success === false) {
                    callbackFn(e);
                } else {
                    var swfElement = e['ref'];
                    // Opera 11.5 and above replaces flash with SVG button
                    // msie (and canary chrome 32.0) crashes on swfElement['getSVGDocument']()
                    var replacedBySVG = false;
                    try {
                        replacedBySVG = swfElement && swfElement['getSVGDocument'] && swfElement['getSVGDocument']();
                    } catch(err) {
                    }
                    if (replacedBySVG) {
                        onFailure(e);

                    } else {
                        //set timeout to let FlashBlock plugin detect swf and replace it some contents
                        window.setTimeout(function() {
                            callbackFn(e);
                        }, FlashEmbedder.__TIMEOUT);
                    }
                }

                function onFailure(e) {
                    e.success = false;
                    callbackFn(e);
                }
            });
        });
    }
};

module.exports = FlashEmbedder;

},{"../lib/browser/swfobject":28}],16:[function(require,module,exports){
var swfobject = require('../lib/browser/swfobject');
var FlashBlockNotifier = require('./flashblocknotifier');
var FlashEmbedder = require('./flashembedder');
var detect = require('../lib/browser/detect');

var winSafari = detect.platform.os === 'windows' && detect.browser.name === 'safari';

var CONTAINER_CLASS = "ya-flash-player-wrapper";

/**
 * Загрузчик флеш-плеера
 *
 * @alias FlashManager~flashLoader
 *
 * @param {string} url - Ссылка на плеера
 * @param {string} minVersion - минимальная версия плеера
 * @param {string|number} id - идентификатор нового плеера
 * @param {function} loadCallback - колбек для события загрузки
 * @param {object} flashVars - данные передаваемые во флеш
 * @param {HTMLElement} container - контейнер для видимого флеш-плеера
 * @param {string} sizeX - размер по горизонтали
 * @param {string} sizeY - размер по вертикали
 *
 * @returns {HTMLElement} -- Контейнер флеш-плеера
 */
module.exports = function(url, minVersion, id, loadCallback, flashVars, container, sizeX, sizeY) {
    var $flashPlayer = document.createElement("div");
    $flashPlayer.id = "wrapper_" + id;
    $flashPlayer.innerHTML = '<div id="' + id + '"></div>';

    sizeX = sizeX || "1000";
    sizeY = sizeY || "1000";

    var embedder,
        flashSizeX,
        flashSizeY,
        options;

    if (container && !winSafari) {
        embedder = FlashEmbedder;
        flashSizeX = sizeX; flashSizeY = sizeY;
        options = { allowscriptaccess: "always", wmode: "transparent" };

        $flashPlayer.className = CONTAINER_CLASS;
        $flashPlayer.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden;';
        container.appendChild($flashPlayer);
    } else {
        embedder = FlashBlockNotifier;
        flashSizeX = flashSizeY = "1";
        options = { allowscriptaccess: "always" };

        $flashPlayer.style.cssText = 'position: absolute; left: -1px; top: -1px; width: 0px; height: 0px; overflow: hidden;';
        document.body.appendChild($flashPlayer);
    }

    embedder.embedSWF(
        url,
        id,
        flashSizeX,
        flashSizeY,
        minVersion,
        "",
        flashVars,
        options,
        {},
        loadCallback
    );

    return $flashPlayer;
};

},{"../lib/browser/detect":27,"../lib/browser/swfobject":28,"./flashblocknotifier":14,"./flashembedder":15}],17:[function(require,module,exports){
module.exports = [
    { // сохраняется в localstorage
        "id": "custom",
        "preamp": 0,
        "bands": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    {
        "id": "default",
        "preamp": 0,
        "bands": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    {
        "id": "Classical",
        "preamp": -0.5,
        "bands": [-0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -3.5, -3.5, -3.5, -4.5]
    },
    {
        "id": "Club",
        "preamp": -3.359999895095825,
        "bands": [-0.5, -0.5, 4, 2.5, 2.5, 2.5, 1.5, -0.5, -0.5, -0.5]
    },
    {
        "id": "Dance",
        "preamp": -2.1599998474121094,
        "bands": [4.5, 3.5, 1, -0.5, -0.5, -2.5, -3.5, -3.5, -0.5, -0.5]
    },
    {
        "id": "Full Bass",
        "preamp": -3.5999999046325684,
        "bands": [4, 4.5, 4.5, 2.5, 0.5, -2, -4, -5, -5.5, -5.5]
    },
    {
        "id": "Full Bass & Treble",
        "preamp": -5.039999961853027,
        "bands": [3.5, 2.5, -0.5, -3.5, -2, 0.5, 4, 5.5, 6, 6]
    },
    {
        "id": "Full Treble",
        "preamp": -6,
        "bands": [-4.5, -4.5, -4.5, -2, 1, 5.5, 8, 8, 8, 8]
    },
    {
        "id": "Laptop Speakers / Headphone",
        "preamp": -4.079999923706055,
        "bands": [2, 5.5, 2.5, -1.5, -1, 0.5, 2, 4.5, 6, 7]
    },
    {
        "id": "Large Hall",
        "preamp": -3.5999999046325684,
        "bands": [5, 5, 2.5, 2.5, -0.5, -2, -2, -2, -0.5, -0.5]
    },
    {
        "id": "Live",
        "preamp": -2.6399998664855957,
        "bands": [-2, -0.5, 2, 2.5, 2.5, 2.5, 2, 1, 1, 1]
    },
    {
        "id": "Party",
        "preamp": -2.6399998664855957,
        "bands": [3.5, 3.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 3.5, 3.5]
    },
    {
        "id": "Pop",
        "preamp": -3.119999885559082,
        "bands": [-0.5, 2, 3.5, 4, 2.5, -0.5, -1, -1, -0.5, -0.5]
    },
    {
        "id": "Reggae",
        "preamp": -4.079999923706055,
        "bands": [-0.5, -0.5, -0.5, -2.5, -0.5, 3, 3, -0.5, -0.5, -0.5]
    },
    {
        "id": "Rock",
        "preamp": -5.039999961853027,
        "bands": [4, 2, -2.5, -4, -1.5, 2, 4, 5.5, 5.5, 5.5]
    },
    {
        "id": "Ska",
        "preamp": -5.519999980926514,
        "bands": [-1, -2, -2, -0.5, 2, 2.5, 4, 4.5, 5.5, 4.5]
    },
    {
        "id": "Soft",
        "preamp": -4.799999713897705,
        "bands": [2, 0.5, -0.5, -1, -0.5, 2, 4, 4.5, 5.5, 6]
    },
    {
        "id": "Soft Rock",
        "preamp": -2.6399998664855957,
        "bands": [2, 2, 1, -0.5, -2, -2.5, -1.5, -0.5, 1, 4]
    },
    {
        "id": "Techno",
        "preamp": -3.8399999141693115,
        "bands": [4, 2.5, -0.5, -2.5, -2, -0.5, 4, 4.5, 4.5, 4]
    }
];

},{}],18:[function(require,module,exports){
var Events = require('../../lib/async/events');

/**
 * Описание настроек эквалайзера
 * @typedef {Object} ya.Audio.fx.Equalizer~EqualizerPreset
 *
 * @property {String} [id] - идентификатор настроек
 * @property {Number} preamp - предусилитель
 * @property {Array.<Number>} - значения для полос эквалайзера
 */

/**
 * Событие изменения полосы пропускания ({@link ya.Audio.fx.Equalizer.EVENT_CHANGE})
 * @event ya.Audio.fx.Equalizer#change
 * @param {Number} freq - частота полосы пропускания
 * @param {Number} value - значение усиления
 */

/**
 * Эквалайзер
 * @alias ya.Audio.fx.Equalizer
 * @param {AudioContext} audioContext - контекст Web Audio API
 * @param {Array.<Number>} bands - список частот для полос эквалайзера
 *
 * @extends Events
 *
 * @fires ya.Audio.fx.Equalizer#change
 *
 * @constructor
 */
var Equalizer = function(audioContext, bands) {
    Events.call(this);

    this.preamp = new EqualizerBand(audioContext, "highshelf", 0);
    this.preamp.on("*", this._onBandEvent.bind(this, this.preamp));

    var prev;
    this.bands = bands.map(function(frequency, idx) {
        var band = new EqualizerBand(
            audioContext,

            idx == 0 ? 'lowshelf'
                : idx + 1 < bands.length ? "peaking"
                : "highshelf",

            frequency
        );
        band.on("*", this._onBandEvent.bind(this, band));

        if (!prev) {
            this.preamp.filter.connect(band.filter);
        } else {
            prev.filter.connect(band.filter);
        }

        prev = band;
        return band;
    }.bind(this));

    this.input = this.preamp.filter;
    this.output = this.bands[this.bands.length - 1].filter;
};

Events.mixin(Equalizer);

/** @type {string}
 * @const
 */
Equalizer.EVENT_CHANGE = "change";

/** @type {Array.<Number>}
 * @const
 */
Equalizer.DEFAULT_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

/** @type {Object.<String, ya.Audio.fx.Equalizer~EqualizerPreset>}
 * @const
 */
Equalizer.DEFAULT_PRESETS = require('./default.presets.js');

/**
 * Обработка события полосы эквалайзера
 * @param {EqualizerBand} band - полоса эквалайзера
 * @param {String} event - событие
 * @param {*} data - данные события
 * @private
 */
Equalizer.prototype._onBandEvent = function(band, event, data) {
    this.trigger(event, band.getFreq(), data);
};

/**
 * Загрузить настройки
 * @param {ya.Audio.fx.Equalizer~EqualizerPreset} preset - настройки
 */
Equalizer.prototype.loadPreset = function(preset) {
    preset.bands.forEach(function(value, idx) {
        this.bands[idx].setValue(value);
    }.bind(this));
    this.preamp.setValue(preset.preamp);
};

/**
 * Сохранить текущие настройки
 * @returns {ya.Audio.fx.Equalizer~EqualizerPreset}
 */
Equalizer.prototype.savePreset = function() {
    return {
        preamp: this.preamp.getValue(),
        bands: this.bands.map(function(band) { return band.getValue(); })
    };
};

//TODO: проверить предположение (скорее всего нужна карта весов для различных частот или даже некая функция)
/**
 * **Экспериментально** - вычиляет оптимальное значние предусиления
 * @experimental
 * @returns {number}
 */
Equalizer.prototype.guessPreamp = function() {
    var v = 0;
    for (var k = 0, l = this.bands.length; k < l; k++) {
        v += this.bands[k].getValue();
    }

    return -v / 2;
};

// =================================================================

//  Фильтр эквалайзера

// =================================================================
/**
 * Событие изменения значения усиления ({@link ya.Audio.fx.Equalizer.EVENT_CHANGE})
 * @event ya.Audio.fx.Equalizer~EqualizerBand#change
 * @param {Number} value - новое значение
 */

/**
 * Полоса пропускания эквалайзера
 * @alias ya.Audio.fx.Equalizer~EqualizerBand
 *
 * @extends Events
 *
 * @param {AudioContext} audioContext - контекст Web Audio API
 * @param {String} type - тип фильтра
 * @param {Number} frequency - частота фильтра
 *
 * @fires ya.Audio.fx.Equalizer~EqualizerBand#change
 *
 * @constructor
 */
var EqualizerBand = function(audioContext, type, frequency) {
    Events.call(this);

    this.type = type;

    this.filter = audioContext.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = frequency;
    this.filter.Q.value = 1;
    this.filter.gain.value = 0;
};
Events.mixin(EqualizerBand);

/**
 * Получить частоту полосы пропускания
 * @returns {Number}
 */
EqualizerBand.prototype.getFreq = function() {
    return this.filter.frequency.value;
};

/**
 * Получить значение усиления
 * @returns {Number}
 */
EqualizerBand.prototype.getValue = function() {
    return this.filter.gain.value;
};

/**
 * Установить значение усиления
 * @param value
 */
EqualizerBand.prototype.setValue = function(value) {
    this.filter.gain.value = value;
    this.trigger(Equalizer.EVENT_CHANGE, value);
};

module.exports = Equalizer;

},{"../../lib/async/events":24,"./default.presets.js":17}],19:[function(require,module,exports){
require('../export');

ya.Audio.fx.Equalizer = require('./equalizer');

},{"../export":20,"./equalizer":18}],20:[function(require,module,exports){
require('../export');

ya.Audio.fx = {};

},{"../export":10}],21:[function(require,module,exports){
var Logger = require('../logger/logger');
var logger = new Logger('AudioHTML5');

var detect = require('../lib/browser/detect');
var Events = require('../lib/async/events');
var AudioStatic = require('../audio-static');
var PlaybackError = require('../error/playback-error');

var playerId = 1;

exports.available = (function() {
    // ------------------------------------------------------------------------------ Базовая проверка поддержки браузером
    var html5_available = true;
    try {
        //some browsers doesn't understand new Audio()
        var audio = document.createElement('audio');
        var canPlay = audio.canPlayType("audio/mpeg");
        if (!canPlay || canPlay === 'no') {

            logger.warn(this, "HTML5 detection failed with reason", canPlay);
            html5_available = false;
        }
    } catch(e) {
        logger.warn(this, "HTML5 detection failed with error", e);
        html5_available = false;
    }

    logger.info(this, "detection", html5_available);
    return html5_available;
})();

try {
    var audioContext = new AudioContext();
    logger.info(this, "WenAudioAPI context created");
} catch(e) {
    audioContext = null;
    logger.info(this, "WenAudioAPI not detected");
}

/**
 * @class Класс html5 аудио-плеера
 * @extends IAudioImplementation
 *
 * @fires IAudioImplementation#play
 * @fires IAudioImplementation#ended
 * @fires IAudioImplementation#volumechange
 * @fires IAudioImplementation#crashed
 * @fires IAudioImplementation#swap
 *
 * @fires IAudioImplementation#stop
 * @fires IAudioImplementation#pause
 * @fires IAudioImplementation#progress
 * @fires IAudioImplementation#loading
 * @fires IAudioImplementation#loaded
 * @fires IAudioImplementation#error
 *
 * @constructor
 * @private
 */
var AudioHTML5 = function() {
    this.name = playerId++;
    logger.debug(this, "constructor");

    Events.call(this);
    this.on("*", function(event) {
        logger.debug(this, "onEvent", event);
    }.bind(this));

    this.webAudioApi = false;

    this.activeLoader = 0;

    this.loaders = [];
    this.listeners = [];

    this._addLoader();
    this._addLoader();

    this._setActive(0);
};
Events.mixin(AudioHTML5);
AudioHTML5.type = AudioHTML5.prototype.type = "html5";

/**
 * Нативное событие начала воспроизведения
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_PLAY = "play";
/**
 * Нативное событие паузы
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_PAUSE = "pause";
/**
 * Нативное событие обновление позиции воспроизведения
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_TIMEUPDATE = "timeupdate";
/**
 * Нативное событие завершения трека
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_ENDED = "ended";
/**
 * Нативное событие изменения длительности
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_DURATION = "durationchange";
/**
 * Нативное событие изменения длительности загруженной части
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_LOADING = "progress";
/**
 * Нативное событие доступности мета-данных трека
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_META = "loadedmetadata";
/**
 * Нативное событие возможности начать воспроизведение
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_CANPLAY = "canplay";
/**
 * Нативное событие ошибки
 * @type {string}
 * @const
 */
AudioHTML5.EVENT_NATIVE_ERROR = "error";

/**
 * Добавить загрузчик аудио-файлов
 * @private
 */
AudioHTML5.prototype._addLoader = function() {
    logger.debug(this, "_addLoader");

    var self = this;

    var loader = document.createElement('audio');
    var listener = new Events();

    loader.loop = false; // for IE
    loader.preload = loader.autobuffer = "auto"; // 100%

    loader.startPlay = function() { //INFO: эта конструкция нужна, чтобы не менять логику при resume
        loader.removeEventListener(AudioHTML5.EVENT_NATIVE_META, loader.startPlay);
        loader.removeEventListener(AudioHTML5.EVENT_NATIVE_CANPLAY, loader.startPlay);

        try {
            loader.play();
            logger.debug(self, "startPlay");
        } catch(e) {
            logger.error(self, "crashed", e);
            listener.trigger(AudioStatic.EVENT_CRASHED, e);
        }
    };

    var lastUpdate = 0;
    var updateProgress = function() {
        var currentTime = +new Date();
        if (currentTime - lastUpdate < 30) {
            return;
        }

        lastUpdate = currentTime;
        listener.trigger(AudioStatic.EVENT_PROGRESS);
    };

    loader.addEventListener(AudioHTML5.EVENT_NATIVE_PAUSE, listener.trigger.bind(listener, AudioStatic.EVENT_PAUSE));
    loader.addEventListener(AudioHTML5.EVENT_NATIVE_PLAY, listener.trigger.bind(listener, AudioStatic.EVENT_PLAY));

    loader.addEventListener(AudioHTML5.EVENT_NATIVE_ENDED, function() {
        listener.trigger(AudioStatic.EVENT_PROGRESS);
        listener.trigger(AudioStatic.EVENT_ENDED);
    });

    loader.addEventListener(AudioHTML5.EVENT_NATIVE_TIMEUPDATE, updateProgress);
    loader.addEventListener(AudioHTML5.EVENT_NATIVE_DURATION, updateProgress);
    loader.addEventListener(AudioHTML5.EVENT_NATIVE_LOADING, function() {
        updateProgress();

        if (loader.buffered.length) {
            var loaded = loader.buffered.end(0) - loader.buffered.start(0);

            if (loader.notLoading && loaded) {
                loader.notLoading = false;
                listener.trigger(AudioStatic.EVENT_LOADING);
            }

            if (loaded >= loaded.duration - 0.1) {
                listener.trigger(AudioStatic.EVENT_LOADED);
            }
        }
    });

    loader.addEventListener(AudioHTML5.EVENT_NATIVE_ERROR, function(e) {
        if (!loader.fake) {
            var error = new PlaybackError(loader.error
                    ? PlaybackError.html5[loader.error.code]
                    : e instanceof Error ? e.message : e,
                loader.src);

            listener.trigger(AudioStatic.EVENT_ERROR, error);
        }
    });

    listener.on("*", function(event, data) {
        var offset = (self.loaders.length + loader.index - self.activeLoader) % self.loaders.length;
        self.trigger(event, offset, data);
    });

    loader.index = this.loaders.push(loader) - 1;
    this.listeners.push(listener);

    if (this.webAudioApi) {
        this._addSource(loader);
    }
};

/**
 * Создать (если необходимо) и подключить источник звука для Web Audio API
 * @param {Audio} loader - загрузчик аудио
 * @param {AudioNode} source - экземпляр источника звука
 * @private
 */
AudioHTML5.prototype._addSource = function(loader, source) {
    logger.debug(this, "_addSource", loader);

    if (!source) {
        source = audioContext.createMediaElementSource(loader);
        this.sources.push(source);
    } else {
        source.disconnect();
    }

    if (this.preprocessor) {
        source.connect(this.preprocessor);
    } else {
        source.connect(this.audioOutput);
    }
};

/**
 * Установить активный загрузчик
 * @param {int} offset - 0: текущий загрузчик, 1: следующий загрузчик
 * @private
 */
AudioHTML5.prototype._setActive = function(offset) {
    logger.debug(this, "_setActive", offset);

    if (offset !== 0) {
        this.stop();
    }

    this.activeLoader = (this.activeLoader + offset) % this.loaders.length;
    this.trigger(AudioStatic.EVENT_SWAP, offset);
};

/**
 * Получить загрузчик и отписать его от событий старта воспроизведения
 * @param {Boolean} unsubscribe - отписаться от событий
 * @param {int} offset - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {Audio}
 * @private
 */
AudioHTML5.prototype._getLoader = function(unsubscribe, offset) {
    offset = offset || 0;
    var loader = this.loaders[(this.activeLoader + offset) % this.loaders.length];
    if (unsubscribe) {
        loader.removeEventListener(AudioHTML5.EVENT_NATIVE_META, loader.startPlay);
        loader.removeEventListener(AudioHTML5.EVENT_NATIVE_CANPLAY, loader.startPlay);
    }

    return loader;
};

//INFO: эта конструкция нужна, чтобы не менять логику при resume
/**
 * Запуск воспроизведения
 * @param {Audio} loader - загрузчик аудио
 * @private
 */
AudioHTML5.prototype._play = function(loader) {
    logger.debug(this, "_play");

    if (loader.readyState > loader.HAVE_METADATA) {
        loader.startPlay();
    } else {
        // firefox waits too long till 'canplay' or 'canplaythrough'
        // but it can play right after 'loadedmetadata'
        // so we use both events
        loader.addEventListener(AudioHTML5.EVENT_NATIVE_META, loader.startPlay);
        loader.addEventListener(AudioHTML5.EVENT_NATIVE_CANPLAY, loader.startPlay);
    }
};

/**
 * Переключение режима использования Web Audio API. Доступен только при html5-реализации плеера.
 *
 * **Внимание!** - после включения режима Web Audio API он не отключается полностью, т.к. для этого требуется
 * реинициализация плеера, которой требуется клик пользователя. При отключении из графа обработки исключаются
 * все ноды кроме нод-источников и ноды вывода, управление громкостью переключается на элементы audio, без
 * использования GainNode
 * @param {Boolean} state - запрашиваемый статус
 * @returns {Boolean} -- итоговый статус плеера
 */
AudioHTML5.prototype.toggleWebAudioAPI = function(state) {
    if (!audioContext) {
        logger.warn(this, "toggleWebAudioAPIError", state);
        return false;
    }

    logger.info(this, "toggleWebAudioAPI", state);

    if (this.webAudioApi == state) {
        return state;
    }

    if (state) {
        this.audioOutput = audioContext.createGain();
        this.audioOutput.gain = this.volume;
        this.audioOutput.connect(audioContext.destination);

        if (this.preprocessor) {
            this.preprocessor.output.connect(this.audioOutput);
        }

        this.sources = this.sources || [];
        this.loaders.forEach(function(loader, idx) {
            loader.volume = 1;
            var prepared = loader.crossOrigin;
            loader.crossOrigin = "anonymous";
            this._addSource(loader, this.sources[idx]);

            if (!prepared) { // INFO: после того как мы включили webAudioAPI его уже нельзя полностью выключить.
                var pos = loader.currentTime;
                var paused = loader.paused;
                loader.load();
                loader.currentTime = pos;
                if (!paused) {
                    loader.play();
                }
            }
        }.bind(this));

    } else if (this.audioOutput) {
        if (this.preprocessor) {
            this.preprocessor.output.disconnect();
        }

        this.audioOutput.disconnect();
        delete this.audioOutput;

        this.sources.forEach(function(source) {
            source.disconnect();
        });
        //delete this.sources;

        this.loaders.forEach(function(loader, idx) {
            loader.volume = this.volume;

            var source = this.sources[idx];
            if (source) { // INFO: после того как мы включили webAudioAPI его уже нельзя полностью выключить.
                source.connect(audioContext.destination);
            }
        }.bind(this));
    }

    this.webAudioApi = state;

    return state;
};

/**
 * Подключение аудио препроцессора. Вход препроцессора подключается к аудио-элементу у которого выставлена
 * 100% громкость. Выход препроцессора подключается к GainNode, которая регулирует итоговую громкость
 * @param {ya.Audio~AudioPreprocessor} preprocessor - препроцессор
 * @returns {boolean} -- статус успеха
 */
AudioHTML5.prototype.setAudioPreprocessor = function(preprocessor) {
    if (!this.webAudioApi) {
        logger.warn(this, "setAudioPreprocessorError", preprocessor);
        return;
    }

    logger.info(this, "setAudioPreprocessor");

    if (this.preprocessor === preprocessor) {
        return;
    }

    if (this.preprocessor) {
        this.preprocessor.output.disconnect();
    }

    this.preprocessor = preprocessor;

    if (!preprocessor) {
        this.sources.forEach(function(source) {
            source.disconnect();
            source.connect(this.audioOutput);
        }.bind(this));
        return;
    }

    this.sources.forEach(function(source) {
        source.disconnect();
        source.connect(preprocessor.input);
    });
    preprocessor.output.connect(this.audioOutput);
};

/**
 * Проиграть трек
 * @param {String} src - ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 */
AudioHTML5.prototype.play = function(src, duration) {
    logger.info(this, "play", src);

    var loader = this._getLoader(true);

    loader.fake = false;
    loader.src = src;
    loader._src = src;
    loader.notLoading = true;
    loader.load();

    this._play(loader);
};

/** Поставить трек на паузу */
AudioHTML5.prototype.pause = function() {
    logger.info(this, "pause");
    var loader = this._getLoader(true);
    loader.pause();
};

/** Снять трек с паузы */
AudioHTML5.prototype.resume = function() {
    logger.info(this, "resume");
    var loader = this._getLoader(true);
    this._play(loader);
};

/**
 * Остановить воспроизведение и загрузку трека
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 */
AudioHTML5.prototype.stop = function(offset) {
    logger.info(this, "stop");
    var loader = this._getLoader(true, offset || 0);

    loader.fake = true;
    loader.src = "";
    loader._src = false;
    loader.notLoading = true;
    loader.load();

    this.trigger(AudioStatic.EVENT_STOP);
};

/**
 * Предзагрузить трек
 * @param {String} src - Ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 */
AudioHTML5.prototype.preload = function(src, duration, offset) {
    logger.info(this, "preload", src, offset);
    offset = offset == null ? 1 : 0;
    var loader = this._getLoader(true, offset);

    loader.src = src;
    loader._src = src;
    loader.notLoading = true;
    loader.load();
};

/**
 * Проверить что трек предзагружается
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */
AudioHTML5.prototype.isPreloaded = function(src, offset) {
    offset = offset == null ? 1 : 0;
    var loader = this._getLoader(false, offset);
    return loader._src === src && !loader.notLoading;
};

/**
 * Проверить что трек начал предзагружаться
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */
AudioHTML5.prototype.isPreloading = function(src, offset) {
    offset = offset == null ? 1 : 0;
    var loader = this._getLoader(false, offset);
    return loader._src === src;
};

/**
 * Запустить воспроизведение предзагруженного трека
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean} -- доступность данного действия
 */
AudioHTML5.prototype.playPreloaded = function(offset) {
    logger.info(this, "playPreloaded", offset);
    offset = offset == null ? 1 : 0;
    var loader = this._getLoader(false, offset);

    if (!loader._src) {
        return false;
    }

    this._setActive(offset);
    this._play(this._getLoader(true));

    return true;
};

/**
 * Получить позицию воспроизведения
 * @returns {number}
 */
AudioHTML5.prototype.getPosition = function() {
    return this._getLoader().currentTime;
};

/**
 * Установить текущую позицию воспроизведения
 * @param {number} position
 */
AudioHTML5.prototype.setPosition = function(position) {
    logger.info(this, "setPosition", position);
    this._getLoader().currentTime = position - 0.001;
};

/**
 * Получить длительность трека
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */
AudioHTML5.prototype.getDuration = function(offset) {
    return this._getLoader(false, offset).duration;
};

/**
 * Получить длительность загруженной части трека
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */
AudioHTML5.prototype.getLoaded = function(offset) {
    var loader = this._getLoader(false, offset);

    if (loader.buffered.length) {
        return loader.buffered.end(0) - loader.buffered.start(0);
    }
    return 0;
};

/**
 * Получить текущее значение громкости
 * @returns {number}
 */
AudioHTML5.prototype.getVolume = function() {
    return this.volume;
};

/**
 * Установить значение громкости
 * @param {number} volume
 */
AudioHTML5.prototype.setVolume = function(volume) {
    logger.info(this, "setVolume", volume);
    this.volume = volume;

    if (this.webAudioApi) {
        this.audioOutput.gain.value = volume;
    } else {
        this.loaders.forEach(function(loader) {
            loader.volume = volume;
        });
    }

    this.trigger(AudioStatic.EVENT_VOLUME);
};

/**
 * Получить ссылку на трек
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {String|Boolean} -- Ссылка на трек или false, если нет загружаемого трека
 */
AudioHTML5.prototype.getSrc = function(offset) {
    return this._getLoader(false, offset)._src;
};

/**
 * Проверить доступен ли программный контроль громкости
 * @returns {boolean}
 */
AudioHTML5.prototype.isDeviceVolume = function() {
    return detect.onlyDeviceVolume;
};

/**
 * Вспомогательная функция для отображения состояния плеера в логе.
 * @private
 */
AudioHTML5.prototype._logger = function() {
    try {
        return {
            main: this.getSrc(0),
            preloader: this.getSrc(1)
        };
    } catch(e) {
        return "";
    }
};

exports.audioContext = audioContext;
exports.AudioImplementation = AudioHTML5;

},{"../audio-static":5,"../error/playback-error":9,"../lib/async/events":24,"../lib/browser/detect":27,"../logger/logger":37}],22:[function(require,module,exports){
var YandexAudio = require('./export');
require('./error/export');
require('./lib/net/error/export');
require('./logger/export');
require('./fx/equalizer/export');

module.exports = YandexAudio;

},{"./error/export":8,"./export":10,"./fx/equalizer/export":19,"./lib/net/error/export":33,"./logger/export":36}],23:[function(require,module,exports){
var Promise = require('./promise');
var noop = require('../noop');

/**
 * @class Отложенное действие
 * @constructor
 * @private
 */
var Deferred = function() {
    var self = this;

    var _promise = new Promise(function(resolve, reject) {
        /**
         * Разрешить обещание
         * @method Deferred#resolve
         * @param {*} data - передать данные в обещание
         */
        self.resolve = resolve;

        /**
         * Отклонить обещание
         * @method Deferred#reject
         * @param {Error} error - передать ошибку
         */
        self.reject = reject;
    });

    var promise = _promise.then(function(data) {
        self.resolved = true;
        self.pending = false;
        return data;
    }, function(err) {
        self.rejected = true;
        self.pending = false;
        throw err;
    });
    promise["catch"](noop); // Don't throw errors to console

    /**
     * Выполнилось ли обещание
     * @type {boolean}
     */
    this.pending = true;

    /**
     * Отклонилось ли обещание
     * @type {boolean}
     */
    this.rejected = false;

    /**
     * Получить обещание
     * @method Deferred#promise
     * @returns {Promise}
     */
    this.promise = function() { return promise; };
};

/**
 * Ожидание выполнения списка обещаний
 * @param {...*} args - обещания, которые требуется ожидать
 * @returns AbortablePromise
 */
Deferred.when = function() {
    var deferred = new Deferred();

    var list = [].slice.call(arguments);
    var pending = list.length;

    var resolve = function() {
        pending--;

        if (pending <= 0) {
            deferred.resolve();
        }
    };

    list.forEach(function(promise) {
        promise.then(resolve, deferred.reject);
    });
    list = null;

    deferred.promise.abort = deferred.reject;

    return deferred.promise();
};

module.exports = Deferred;

},{"../noop":35,"./promise":25}],24:[function(require,module,exports){
var merge = require('../data/merge');

var LISTENERS_NAME = "_listeners";
var MUTE_OPTION = "_muted";

/**
 * Диспетчер событий
 * @constructor
 */
var Events = function() {
    /** Контейнер для списков слушателей событий
     * @alias Events#_listeners
     * @type {Object.<String, Array.<Function>>}
     * @private
     */
    this[LISTENERS_NAME] = {};

    /** Флаг включения/выключения событий
     * @alias Events#_mutes
     * @type {Boolean}
     * @private
     */
    this[MUTE_OPTION] = false;
};

/**
 * Расширить произвольный класс свойствами диспетчера событий
 * @param {Function} classConstructor - конструктор класса
 * @returns {Function} -- тот же конструктор класса, расширенный свойствами диспетчера событий
 */
Events.mixin = function(classConstructor) {
    merge(classConstructor.prototype, Events.prototype, true);
    return classConstructor;
};

/**
 * Расширить произвольный объект свойствами диспетчера событий
 * @param {Object} object - объект
 * @returns {Object} -- тот же объект, расширенный свойствами диспетчера событий
 */
Events.eventize = function(object) {
    merge(object, Events.prototype, true);
    Events.call(object);
    return object;
};

/**
 * Подписаться на событие
 * @param {String} event - имя события
 * @param {function} callback - обработчик события
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.on = function(event, callback) {
    if (!this[LISTENERS_NAME][event]) {
        this[LISTENERS_NAME][event] = [];
    }

    this[LISTENERS_NAME][event].push(callback);
    return this;
};

/**
 * Отписаться от события
 * @param {String} event - имя события
 * @param {function} callback - обработчик события
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.off = function(event, callback) {
    if (!this[LISTENERS_NAME][event]) {
        return this;
    }

    if (!callback) {
        delete this[LISTENERS_NAME][event];
        return this;
    }

    var callbacks = this[LISTENERS_NAME][event];
    for (var k = 0, l = callbacks.length; k < l; k++) {
        if (callbacks[k] === callback || callbacks[k].callback === callback) {
            callbacks.splice(k, 1);
            if (!callbacks.length) {
                delete this[LISTENERS_NAME][event];
            }
            break;
        }
    }

    return this;
};

/**
 * Подписаться на событие, отписаться сразу после первого возникновения события
 * @param {String} event - имя события
 * @param {function} callback - обработчик события
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.once = function(event, callback) {
    var self = this;

    var wrapper = function() {
        self.off(event, wrapper);
        callback.apply(this, arguments);
    };

    wrapper.callback = callback;
    self.on(event, wrapper);

    return this;
};

/**
 * Запустить событие
 * @param {String} event - имя события
 * @param {...args} args - параметры для передачи вместе с событием
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.trigger = function(event, args) {
    if (this[MUTE_OPTION]) {
        return this;
    }

    args = [].slice.call(arguments, 1);

    if (event !== "*") {
        Events.prototype.trigger.apply(this, ["*", event].concat(args));
    }

    if (!this[LISTENERS_NAME][event]) {
        return this;
    }

    var callbacks = [].concat(this[LISTENERS_NAME][event]);
    for (var k = 0, l = callbacks.length; k < l; k++) {
        callbacks[k].apply(null, args);
    }

    return this;
};

/**
 * Отписаться от всех слушателей событий
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.clearListeners = function() {
    for (var key in this[LISTENERS_NAME]) {
        if (this[LISTENERS_NAME].hasOwnProperty(key)) {
            delete this[LISTENERS_NAME][key];
        }
    }

    return this;
};

/**
 * Делегировать все события другому диспетчеру событий
 * @param {Events} acceptor - получатель событий
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.pipeEvents = function(acceptor) {
    this.on("*", Events.prototype.trigger.bind(acceptor));
    return this;
};

/**
 * Остановить запуск событий
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.muteEvents = function() {
    this[MUTE_OPTION] = true;
    return this;
};

/**
 * Возобновить запуск событий
 * @returns {Events} -- цепочный метод, возвращает ссылку на контекст
 */
Events.prototype.unmuteEvents = function() {
    delete this[MUTE_OPTION];
    return this;
};

module.exports = Events;

},{"../data/merge":32}],25:[function(require,module,exports){
var vow = require('vow');
var detect = require('../browser/detect');

/**
 * {@link https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Promise|ES-6 Promise}
 * @constructor
 */
var Promise;
if (typeof window.Promise !== "function"
    || detect.browser.name === "msie" || detect.browser.name === "edge" // мелкие мягкие как всегда ничего не умеют делать правильно
) {
    Promise = vow.Promise;
} else {
    Promise = window.Promise;
}

module.exports = Promise;

/**
 * Создать обещание разрешённое переданными данными
 * @method Promise.resolve
 * @param {*} data - данные, которыми разрешить обещание
 * @static
 * @returns {Promise}
 */

/**
 * Создать обещание отклонённое переданными данными
 * @method Promise.reject
 * @param {*} data - данные, которыми отклонить обещание
 * @static
 * @returns {Promise}
 */

/**
 * Создать обещание, которое выполнится тогда, когда будут выполнены все переданные обещания.
 * @method Promise.all
 * @param {Array.<Promise>} promises - список обещаний
 * @static
 * @returns {Promise}
 */

/**
 * Создать обещание, которое выполнится тогда, когда будет выполнено хотя бы одно из переданных обещаний.
 * @method Promise.race
 * @param {Array.<Promise>} promises - список обещаний
 * @static
 * @returns {Promise}
 */

/**
 * Назначить обработчики разрешения и отклонения обещания
 * @method Promise#then
 * @param {function} callback - обработчик успеха
 * @param {null|function} [errback] - обработчик ошибки
 * @returns {Promise} -- новое обещание из результатов обработчика
 */

/**
 * Назначить обработчик отклонения обещания
 * @method Promise#catch
 * @param {function} errback -  обработчик ошибки
 * @returns {Promise} -- новое обещание из результатов обработчика
 */

//------------------------------------------------------------------------- AbortablePromise
/**
 * Обещание с возможностью отмены связанного с ним действия.
 * @class AbortablePromise
 * @extends Promise
 */

/**
 * Отмена действия связанного с обещаением
 * @abstract
 * @method AbortablePromise#abort
 * @param {String|Error} reason - причина отмены действия
 */

},{"../browser/detect":27,"vow":2}],26:[function(require,module,exports){
var noop = require('../noop');
var Promise = require('./promise');

module.exports = function(data) {
    var promise = Promise.reject(data);
    promise["catch"](noop);
    return promise;
};

},{"../noop":35,"./promise":25}],27:[function(require,module,exports){
var ua = navigator.userAgent.toLowerCase();

// ------------------------------------------------------------------------------ Browser detection
// Useragent RegExp
var rwebkit = /(webkit)[ \/]([\w.]+)/;
var ryabro = /(yabrowser)[ \/]([\w.]+)/;
var ropera = /(opera)(?:.*version)?[ \/]([\w.]+)/;
var rmsie = /(msie) ([\w.]+)/;
var redge = /(edge)\/([\w.]+)/;
var rmozilla = /(mozilla)(?:.*? rv:([\w.]+))?/;
var rsafari = /^((?!chrome).)*version\/([\d\w\.]+).*(safari)/;

var match = rsafari.exec(ua) || ryabro.exec(ua) || redge.exec(ua) || rwebkit.exec(ua) || ropera.exec(ua) || rmsie.exec(ua) || ua.indexOf("compatible") < 0
    && rmozilla.exec(ua)
    || [];

var browser = {name: match[1] || "", version: match[2] || "0"};

if (match[3] === "safari") {
    browser.name = match[3];
}

if (browser.name === 'msie') {
    if (document.documentMode) { // IE8 or later
        browser.documentMode = document.documentMode;
    } else { // IE 5-7
        browser.documentMode = 5; // Assume quirks mode unless proven otherwise
        if (document.compatMode) {
            if (document.compatMode === "CSS1Compat") {
                browser.documentMode = 7; // standards mode
            }
        }
    }
}

// ------------------------------------------------------------------------------ Platform detection
// Useragent RegExp
var rplatform = /(ipad|iphone|ipod|android|blackberry|playbook|windows ce|webos)/;
var rtablet = /(ipad|playbook)/;
var randroid = /(android)/;
var rmobile = /(mobile)/;

platform = rplatform.exec(ua) || [];
var tablet = rtablet.exec(ua) || !rmobile.exec(ua) && randroid.exec(ua) || [];

if (platform[1]) {
    platform[1] = platform[1].replace(/\s/g, "_"); // Change whitespace to underscore. Enables dot notation.
}

var platform = {
    type: platform[1] || "",
    tablet: !!tablet[1],
    mobile: platform[1] && !tablet[1] || false
};
if (!platform.type) {
    platform.type = 'pc';
}

platform.os = platform.type;
if (platform.type === 'ipad' || platform.type === 'iphone' || platform.type === 'ipod') {
    platform.os = 'ios';
} else if (platform.type === 'android') {
    platform.os = 'android';
} else if (navigator.appVersion.indexOf("Win") !== -1) {
    platform.os = "windows";
    platform.version = navigator.userAgent.match(/win[^ ]* ([^;]*)/i);
    platform.version = platform.version && platform.version[1];
} else if (navigator.appVersion.indexOf("Mac") !== -1) {
    platform.os = "macos";
} else if (navigator.appVersion.indexOf("X11") !== -1) {
    platform.os = "unix";
} else if (navigator.appVersion.indexOf("Linux") !== -1) {
    platform.os = "linux";
}

// ------------------------------------------------------------------------------ Детектирование блокировки громкости
var noVolume = true;
try {
    var audio = document.createElement('audio');
    audio.volume = 0.63;
    noVolume = Math.abs(audio.volume - 0.63) > 0.01;
} catch(e) {
    noVolume = true;
}

// ------------------------------------------------------------------------------ Экспорт
/**
 * Информация об окружении
 * @namespace
 * @private
 */
var detect = {
    /**
     * Информация о браузере
     * @type {object}
     * @property {string} name - название браузера
     * @property {string} version - версия
     * @property {number} [documentMode] - версия документа
     */
    browser: browser,

    /**
     * Информация о платформе
     * @type {object}
     * @property {string} os - тип операционной системы
     * @property {string} type - тип платформы
     * @property {boolean} tablet - планшет
     * @property {boolean} mobile - мобильный
     */
    platform: platform,

    /**
     * Настройка громкости
     * @type {boolean}
     */
    onlyDeviceVolume: noVolume
};

module.exports = detect;

},{}],28:[function(require,module,exports){
/**
 * @license SWFObject v2.2 <http://code.google.com/p/swfobject/>
 * is released under the MIT License <http://www.opensource.org/licenses/mit-license.php>
 * @private
*/
var swfobject = function() {
	var UNDEF = "undefined",
		OBJECT = "object",
		SHOCKWAVE_FLASH = "Shockwave Flash",
		SHOCKWAVE_FLASH_AX = "ShockwaveFlash.ShockwaveFlash",
		FLASH_MIME_TYPE = "application/x-shockwave-flash",
		EXPRESS_INSTALL_ID = "SWFObjectExprInst",
		ON_READY_STATE_CHANGE = "onreadystatechange",
		win = window,
		doc = document,
		nav = navigator,
		plugin = false,
		domLoadFnArr = [main],
		regObjArr = [],
		objIdArr = [],
		listenersArr = [],
		storedAltContent,
		storedAltContentId,
		storedCallbackFn,
		storedCallbackObj,
		isDomLoaded = false,
		isExpressInstallActive = false,
		dynamicStylesheet,
		dynamicStylesheetMedia,
		autoHideShow = true,
	/* Centralized function for browser feature detection
		- User agent string detection is only used when no good alternative is possible
		- Is executed directly for optimal performance
	*/
	ua = function() {
		var w3cdom = typeof doc.getElementById != UNDEF && typeof doc.getElementsByTagName != UNDEF && typeof doc.createElement != UNDEF,
			u = nav.userAgent.toLowerCase(),
			p = nav.platform.toLowerCase(),
			windows = p ? /win/.test(p) : /win/.test(u),
			mac = p ? /mac/.test(p) : /mac/.test(u),
			webkit = /webkit/.test(u) ? parseFloat(u.replace(/^.*webkit\/(\d+(\.\d+)?).*$/, "$1")) : false, // returns either the webkit version or false if not webkit
			ie = !+"\v1", // feature detection based on Andrea Giammarchi's solution: http://webreflection.blogspot.com/2009/01/32-bytes-to-know-if-your-browser-is-ie.html
			playerVersion = [0,0,0],
			d = null;
		if (typeof nav.plugins != UNDEF && typeof nav.plugins[SHOCKWAVE_FLASH] == OBJECT) {
			d = nav.plugins[SHOCKWAVE_FLASH].description;
			if (d && !(typeof nav.mimeTypes != UNDEF && nav.mimeTypes[FLASH_MIME_TYPE] && !nav.mimeTypes[FLASH_MIME_TYPE].enabledPlugin)) { // navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin indicates whether plug-ins are enabled or disabled in Safari 3+
				plugin = true;
				ie = false; // cascaded feature detection for Internet Explorer
				d = d.replace(/^.*\s+(\S+\s+\S+$)/, "$1");
				playerVersion[0] = parseInt(d.replace(/^(.*)\..*$/, "$1"), 10);
				playerVersion[1] = parseInt(d.replace(/^.*\.(.*)\s.*$/, "$1"), 10);
				playerVersion[2] = /[a-zA-Z]/.test(d) ? parseInt(d.replace(/^.*[a-zA-Z]+(.*)$/, "$1"), 10) : 0;
			}
		}
		else if (typeof win.ActiveXObject != UNDEF) {
			try {
				var a = new ActiveXObject(SHOCKWAVE_FLASH_AX);
				if (a) { // a will return null when ActiveX is disabled
					d = a.GetVariable("$version");
					if (d) {
						ie = true; // cascaded feature detection for Internet Explorer
						d = d.split(" ")[1].split(",");
						playerVersion = [parseInt(d[0], 10), parseInt(d[1], 10), parseInt(d[2], 10)];
					}
				}
			}
			catch(e) {}
		}
		return { w3:w3cdom, pv:playerVersion, wk:webkit, ie:ie, win:windows, mac:mac };
	}(),
	/* Cross-browser onDomLoad
		- Will fire an event as soon as the DOM of a web page is loaded
		- Internet Explorer workaround based on Diego Perini's solution: http://javascript.nwbox.com/IEContentLoaded/
		- Regular onload serves as fallback
	*/
	onDomLoad = function() {
		if (!ua.w3) { return; }
		if ((typeof doc.readyState != UNDEF && doc.readyState == "complete") || (typeof doc.readyState == UNDEF && (doc.getElementsByTagName("body")[0] || doc.body))) { // function is fired after onload, e.g. when script is inserted dynamically
			callDomLoadFunctions();
		}
		if (!isDomLoaded) {
			if (typeof doc.addEventListener != UNDEF) {
				doc.addEventListener("DOMContentLoaded", callDomLoadFunctions, false);
			}
			if (ua.ie && ua.win) {
				doc.attachEvent(ON_READY_STATE_CHANGE, function() {
					if (doc.readyState == "complete") {
						doc.detachEvent(ON_READY_STATE_CHANGE, arguments.callee);
						callDomLoadFunctions();
					}
				});
				if (win == top) { // if not inside an iframe
					(function(){
						if (isDomLoaded) { return; }
						try {
							doc.documentElement.doScroll("left");
						}
						catch(e) {
							setTimeout(arguments.callee, 0);
							return;
						}
						callDomLoadFunctions();
					})();
				}
			}
			if (ua.wk) {
				(function(){
					if (isDomLoaded) { return; }
					if (!/loaded|complete/.test(doc.readyState)) {
						setTimeout(arguments.callee, 0);
						return;
					}
					callDomLoadFunctions();
				})();
			}
			addLoadEvent(callDomLoadFunctions);
		}
	}();
	function callDomLoadFunctions() {
		if (isDomLoaded) { return; }
		try { // test if we can really add/remove elements to/from the DOM; we don't want to fire it too early
			var t = doc.getElementsByTagName("body")[0].appendChild(createElement("span"));
			t.parentNode.removeChild(t);
		}
		catch (e) { return; }
		isDomLoaded = true;
		var dl = domLoadFnArr.length;
		for (var i = 0; i < dl; i++) {
			domLoadFnArr[i]();
		}
	}
	function addDomLoadEvent(fn) {
		if (isDomLoaded) {
			fn();
		}
		else {
			domLoadFnArr[domLoadFnArr.length] = fn; // Array.push() is only available in IE5.5+
		}
	}
	/* Cross-browser onload
		- Based on James Edwards' solution: http://brothercake.com/site/resources/scripts/onload/
		- Will fire an event as soon as a web page including all of its assets are loaded
	 */
	function addLoadEvent(fn) {
		if (typeof win.addEventListener != UNDEF) {
			win.addEventListener("load", fn, false);
		}
		else if (typeof doc.addEventListener != UNDEF) {
			doc.addEventListener("load", fn, false);
		}
		else if (typeof win.attachEvent != UNDEF) {
			addListener(win, "onload", fn);
		}
		else if (typeof win.onload == "function") {
			var fnOld = win.onload;
			win.onload = function() {
				fnOld();
				fn();
			};
		}
		else {
			win.onload = fn;
		}
	}
	/* Main function
		- Will preferably execute onDomLoad, otherwise onload (as a fallback)
	*/
	function main() {
		if (plugin) {
			testPlayerVersion();
		}
		else {
			matchVersions();
		}
	}
	/* Detect the Flash Player version for non-Internet Explorer browsers
		- Detecting the plug-in version via the object element is more precise than using the plugins collection item's description:
		  a. Both release and build numbers can be detected
		  b. Avoid wrong descriptions by corrupt installers provided by Adobe
		  c. Avoid wrong descriptions by multiple Flash Player entries in the plugin Array, caused by incorrect browser imports
		- Disadvantage of this method is that it depends on the availability of the DOM, while the plugins collection is immediately available
	*/
	function testPlayerVersion() {
		var b = doc.getElementsByTagName("body")[0];
		var o = createElement(OBJECT);
		o.setAttribute("type", FLASH_MIME_TYPE);
		var t = b.appendChild(o);
		if (t) {
			var counter = 0;
			(function(){
				if (typeof t.GetVariable != UNDEF) {
					var d = t.GetVariable("$version");
					if (d) {
						d = d.split(" ")[1].split(",");
						ua.pv = [parseInt(d[0], 10), parseInt(d[1], 10), parseInt(d[2], 10)];
					}
				}
				else if (counter < 10) {
					counter++;
					setTimeout(arguments.callee, 10);
					return;
				}
				b.removeChild(o);
				t = null;
				matchVersions();
			})();
		}
		else {
			matchVersions();
		}
	}
	/* Perform Flash Player and SWF version matching; static publishing only
	*/
	function matchVersions() {
		var rl = regObjArr.length;
		if (rl > 0) {
			for (var i = 0; i < rl; i++) { // for each registered object element
				var id = regObjArr[i].id;
				var cb = regObjArr[i].callbackFn;
				var cbObj = {success:false, id:id};
				if (ua.pv[0] > 0) {
					var obj = getElementById(id);
					if (obj) {
						if (hasPlayerVersion(regObjArr[i].swfVersion) && !(ua.wk && ua.wk < 312)) { // Flash Player version >= published SWF version: Houston, we have a match!
							setVisibility(id, true);
							if (cb) {
								cbObj.success = true;
								cbObj.ref = getObjectById(id);
								cb(cbObj);
							}
						}
						else if (regObjArr[i].expressInstall && canExpressInstall()) { // show the Adobe Express Install dialog if set by the web page author and if supported
							var att = {};
							att.data = regObjArr[i].expressInstall;
							att.width = obj.getAttribute("width") || "0";
							att.height = obj.getAttribute("height") || "0";
							if (obj.getAttribute("class")) { att.styleclass = obj.getAttribute("class"); }
							if (obj.getAttribute("align")) { att.align = obj.getAttribute("align"); }
							// parse HTML object param element's name-value pairs
							var par = {};
							var p = obj.getElementsByTagName("param");
							var pl = p.length;
							for (var j = 0; j < pl; j++) {
								if (p[j].getAttribute("name").toLowerCase() != "movie") {
									par[p[j].getAttribute("name")] = p[j].getAttribute("value");
								}
							}
							showExpressInstall(att, par, id, cb);
						}
						else { // Flash Player and SWF version mismatch or an older Webkit engine that ignores the HTML object element's nested param elements: display alternative content instead of SWF
							displayAltContent(obj);
							if (cb) { cb(cbObj); }
						}
					}
				}
				else {	// if no Flash Player is installed or the fp version cannot be detected we let the HTML object element do its job (either show a SWF or alternative content)
					setVisibility(id, true);
					if (cb) {
						var o = getObjectById(id); // test whether there is an HTML object element or not
						if (o && typeof o.SetVariable != UNDEF) {
							cbObj.success = true;
							cbObj.ref = o;
						}
						cb(cbObj);
					}
				}
			}
		}
	}
	function getObjectById(objectIdStr) {
		var r = null;
		var o = getElementById(objectIdStr);
		if (o && o.nodeName == "OBJECT") {
			if (typeof o.SetVariable != UNDEF) {
				r = o;
			}
			else {
				var n = o.getElementsByTagName(OBJECT)[0];
				if (n) {
					r = n;
				}
			}
		}
		return r;
	}
	/* Requirements for Adobe Express Install
		- only one instance can be active at a time
		- fp 6.0.65 or higher
		- Win/Mac OS only
		- no Webkit engines older than version 312
	*/
	function canExpressInstall() {
		return !isExpressInstallActive && hasPlayerVersion("6.0.65") && (ua.win || ua.mac) && !(ua.wk && ua.wk < 312);
	}
	/* Show the Adobe Express Install dialog
		- Reference: http://www.adobe.com/cfusion/knowledgebase/index.cfm?id=6a253b75
	*/
	function showExpressInstall(att, par, replaceElemIdStr, callbackFn) {
		isExpressInstallActive = true;
		storedCallbackFn = callbackFn || null;
		storedCallbackObj = {success:false, id:replaceElemIdStr};
		var obj = getElementById(replaceElemIdStr);
		if (obj) {
			if (obj.nodeName == "OBJECT") { // static publishing
				storedAltContent = abstractAltContent(obj);
				storedAltContentId = null;
			}
			else { // dynamic publishing
				storedAltContent = obj;
				storedAltContentId = replaceElemIdStr;
			}
			att.id = EXPRESS_INSTALL_ID;
			if (typeof att.width == UNDEF || (!/%$/.test(att.width) && parseInt(att.width, 10) < 310)) { att.width = "310"; }
			if (typeof att.height == UNDEF || (!/%$/.test(att.height) && parseInt(att.height, 10) < 137)) { att.height = "137"; }
			doc.title = doc.title.slice(0, 47) + " - Flash Player Installation";
			var pt = ua.ie && ua.win ? "ActiveX" : "PlugIn",
				fv = "MMredirectURL=" + win.location.toString().replace(/&/g,"%26") + "&MMplayerType=" + pt + "&MMdoctitle=" + doc.title;
			if (typeof par.flashvars != UNDEF) {
				par.flashvars += "&" + fv;
			}
			else {
				par.flashvars = fv;
			}
			// IE only: when a SWF is loading (AND: not available in cache) wait for the readyState of the object element to become 4 before removing it,
			// because you cannot properly cancel a loading SWF file without breaking browser load references, also obj.onreadystatechange doesn't work
			if (ua.ie && ua.win && obj.readyState != 4) {
				var newObj = createElement("div");
				replaceElemIdStr += "SWFObjectNew";
				newObj.setAttribute("id", replaceElemIdStr);
				obj.parentNode.insertBefore(newObj, obj); // insert placeholder div that will be replaced by the object element that loads expressinstall.swf
				obj.style.display = "none";
				(function(){
					if (obj.readyState == 4) {
						obj.parentNode.removeChild(obj);
					}
					else {
						setTimeout(arguments.callee, 10);
					}
				})();
			}
			createSWF(att, par, replaceElemIdStr);
		}
	}
	/* Functions to abstract and display alternative content
	*/
	function displayAltContent(obj) {
		if (ua.ie && ua.win && obj.readyState != 4) {
			// IE only: when a SWF is loading (AND: not available in cache) wait for the readyState of the object element to become 4 before removing it,
			// because you cannot properly cancel a loading SWF file without breaking browser load references, also obj.onreadystatechange doesn't work
			var el = createElement("div");
			obj.parentNode.insertBefore(el, obj); // insert placeholder div that will be replaced by the alternative content
			el.parentNode.replaceChild(abstractAltContent(obj), el);
			obj.style.display = "none";
			(function(){
				if (obj.readyState == 4) {
					obj.parentNode.removeChild(obj);
				}
				else {
					setTimeout(arguments.callee, 10);
				}
			})();
		}
		else {
			obj.parentNode.replaceChild(abstractAltContent(obj), obj);
		}
	}
	function abstractAltContent(obj) {
		var ac = createElement("div");
		if (ua.win && ua.ie) {
			ac.innerHTML = obj.innerHTML;
		}
		else {
			var nestedObj = obj.getElementsByTagName(OBJECT)[0];
			if (nestedObj) {
				var c = nestedObj.childNodes;
				if (c) {
					var cl = c.length;
					for (var i = 0; i < cl; i++) {
						if (!(c[i].nodeType == 1 && c[i].nodeName == "PARAM") && !(c[i].nodeType == 8)) {
							ac.appendChild(c[i].cloneNode(true));
						}
					}
				}
			}
		}
		return ac;
	}
	/* Cross-browser dynamic SWF creation
	*/
	function createSWF(attObj, parObj, id) {
		var r, el = getElementById(id);
		if (ua.wk && ua.wk < 312) { return r; }
		if (el) {
			if (typeof attObj.id == UNDEF) { // if no 'id' is defined for the object element, it will inherit the 'id' from the alternative content
				attObj.id = id;
			}
			if (ua.ie && ua.win) { // Internet Explorer + the HTML object element + W3C DOM methods do not combine: fall back to outerHTML
				var att = "";
				for (var i in attObj) {
					if (attObj[i] != Object.prototype[i]) { // filter out prototype additions from other potential libraries
						if (i.toLowerCase() == "data") {
							parObj.movie = attObj[i];
						}
						else if (i.toLowerCase() == "styleclass") { // 'class' is an ECMA4 reserved keyword
							att += ' class="' + attObj[i] + '"';
						}
						else if (i.toLowerCase() != "classid") {
							att += ' ' + i + '="' + attObj[i] + '"';
						}
					}
				}
				var par = "";
				for (var j in parObj) {
					if (parObj[j] != Object.prototype[j]) { // filter out prototype additions from other potential libraries
						par += '<param name="' + j + '" value="' + parObj[j] + '" />';
					}
				}
				el.outerHTML = '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"' + att + '>' + par + '</object>';
				objIdArr[objIdArr.length] = attObj.id; // stored to fix object 'leaks' on unload (dynamic publishing only)
				r = getElementById(attObj.id);
			}
			else { // well-behaving browsers
				var o = createElement(OBJECT);
				o.setAttribute("type", FLASH_MIME_TYPE);
				for (var m in attObj) {
					if (attObj[m] != Object.prototype[m]) { // filter out prototype additions from other potential libraries
						if (m.toLowerCase() == "styleclass") { // 'class' is an ECMA4 reserved keyword
							o.setAttribute("class", attObj[m]);
						}
						else if (m.toLowerCase() != "classid") { // filter out IE specific attribute
							o.setAttribute(m, attObj[m]);
						}
					}
				}
				for (var n in parObj) {
					if (parObj[n] != Object.prototype[n] && n.toLowerCase() != "movie") { // filter out prototype additions from other potential libraries and IE specific param element
						createObjParam(o, n, parObj[n]);
					}
				}
				el.parentNode.replaceChild(o, el);
				r = o;
			}
		}
		return r;
	}
	function createObjParam(el, pName, pValue) {
		var p = createElement("param");
		p.setAttribute("name", pName);
		p.setAttribute("value", pValue);
		el.appendChild(p);
	}
	/* Cross-browser SWF removal
		- Especially needed to safely and completely remove a SWF in Internet Explorer
	*/
	function removeSWF(id) {
		var obj = getElementById(id);
		if (obj && obj.nodeName == "OBJECT") {
			if (ua.ie && ua.win) {
				obj.style.display = "none";
				(function(){
					if (obj.readyState == 4) {
						removeObjectInIE(id);
					}
					else {
						setTimeout(arguments.callee, 10);
					}
				})();
			}
			else {
				obj.parentNode.removeChild(obj);
			}
		}
	}
	function removeObjectInIE(id) {
		var obj = getElementById(id);
		if (obj) {
			for (var i in obj) {
				if (typeof obj[i] == "function") {
					obj[i] = null;
				}
			}
			obj.parentNode.removeChild(obj);
		}
	}
	/* Functions to optimize JavaScript compression
	*/
	function getElementById(id) {
		var el = null;
		try {
			el = doc.getElementById(id);
		}
		catch (e) {}
		return el;
	}
	function createElement(el) {
		return doc.createElement(el);
	}
	/* Updated attachEvent function for Internet Explorer
		- Stores attachEvent information in an Array, so on unload the detachEvent functions can be called to avoid memory leaks
	*/
	function addListener(target, eventType, fn) {
		target.attachEvent(eventType, fn);
		listenersArr[listenersArr.length] = [target, eventType, fn];
	}
	/* Flash Player and SWF content version matching
	*/
	function hasPlayerVersion(rv) {
		var pv = ua.pv, v = rv.split(".");
		v[0] = parseInt(v[0], 10);
		v[1] = parseInt(v[1], 10) || 0; // supports short notation, e.g. "9" instead of "9.0.0"
		v[2] = parseInt(v[2], 10) || 0;
		return (pv[0] > v[0] || (pv[0] == v[0] && pv[1] > v[1]) || (pv[0] == v[0] && pv[1] == v[1] && pv[2] >= v[2])) ? true : false;
	}
	/* Cross-browser dynamic CSS creation
		- Based on Bobby van der Sluis' solution: http://www.bobbyvandersluis.com/articles/dynamicCSS.php
	*/
	function createCSS(sel, decl, media, newStyle) {
		if (ua.ie && ua.mac) { return; }
		var h = doc.getElementsByTagName("head")[0];
		if (!h) { return; } // to also support badly authored HTML pages that lack a head element
		var m = (media && typeof media == "string") ? media : "screen";
		if (newStyle) {
			dynamicStylesheet = null;
			dynamicStylesheetMedia = null;
		}
		if (!dynamicStylesheet || dynamicStylesheetMedia != m) {
			// create dynamic stylesheet + get a global reference to it
			var s = createElement("style");
			s.setAttribute("type", "text/css");
			s.setAttribute("media", m);
			dynamicStylesheet = h.appendChild(s);
			if (ua.ie && ua.win && typeof doc.styleSheets != UNDEF && doc.styleSheets.length > 0) {
				dynamicStylesheet = doc.styleSheets[doc.styleSheets.length - 1];
			}
			dynamicStylesheetMedia = m;
		}
		// add style rule
		if (ua.ie && ua.win) {
			if (dynamicStylesheet && typeof dynamicStylesheet.addRule == OBJECT) {
				dynamicStylesheet.addRule(sel, decl);
			}
		}
		else {
			if (dynamicStylesheet && typeof doc.createTextNode != UNDEF) {
				dynamicStylesheet.appendChild(doc.createTextNode(sel + " {" + decl + "}"));
			}
		}
	}
	function setVisibility(id, isVisible) {
		if (!autoHideShow) { return; }
		var v = isVisible ? "visible" : "hidden";
		if (isDomLoaded && getElementById(id)) {
			getElementById(id).style.visibility = v;
		}
		else {
			createCSS("#" + id, "visibility:" + v);
		}
	}
	/* Filter to avoid XSS attacks
	*/
	function urlEncodeIfNecessary(s) {
		var regex = /[\\\"<>\.;]/;
		var hasBadChars = regex.exec(s) != null;
		return hasBadChars && typeof encodeURIComponent != UNDEF ? encodeURIComponent(s) : s;
	}
	/* Release memory to avoid memory leaks caused by closures, fix hanging audio/video threads and force open sockets/NetConnections to disconnect (Internet Explorer only)
	*/
	var cleanup = function() {
		if (ua.ie && ua.win) {
			window.attachEvent("onunload", function() {
				// remove listeners to avoid memory leaks
				var ll = listenersArr.length;
				for (var i = 0; i < ll; i++) {
					listenersArr[i][0].detachEvent(listenersArr[i][1], listenersArr[i][2]);
				}
				// cleanup dynamically embedded objects to fix audio/video threads and force open sockets and NetConnections to disconnect
				var il = objIdArr.length;
				for (var j = 0; j < il; j++) {
					removeSWF(objIdArr[j]);
				}
				// cleanup library's main closures to avoid memory leaks
				for (var k in ua) {
					ua[k] = null;
				}
				ua = null;
				for (var l in swfobject) {
					swfobject[l] = null;
				}
				swfobject = null;
			});
		}
	}();
	return {
		/* Public API
			- Reference: http://code.google.com/p/swfobject/wiki/documentation
		*/
		registerObject: function(objectIdStr, swfVersionStr, xiSwfUrlStr, callbackFn) {
			if (ua.w3 && objectIdStr && swfVersionStr) {
				var regObj = {};
				regObj.id = objectIdStr;
				regObj.swfVersion = swfVersionStr;
				regObj.expressInstall = xiSwfUrlStr;
				regObj.callbackFn = callbackFn;
				regObjArr[regObjArr.length] = regObj;
				setVisibility(objectIdStr, false);
			}
			else if (callbackFn) {
				callbackFn({success:false, id:objectIdStr});
			}
		},
		getObjectById: function(objectIdStr) {
			if (ua.w3) {
				return getObjectById(objectIdStr);
			}
		},
		embedSWF: function(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj, parObj, attObj, callbackFn) {
			var callbackObj = {success:false, id:replaceElemIdStr};
			if (ua.w3 && !(ua.wk && ua.wk < 312) && swfUrlStr && replaceElemIdStr && widthStr && heightStr && swfVersionStr) {
				setVisibility(replaceElemIdStr, false);
				addDomLoadEvent(function() {
					widthStr += ""; // auto-convert to string
					heightStr += "";
					var att = {};
					if (attObj && typeof attObj === OBJECT) {
						for (var i in attObj) { // copy object to avoid the use of references, because web authors often reuse attObj for multiple SWFs
							att[i] = attObj[i];
						}
					}
					att.data = swfUrlStr;
					att.width = widthStr;
					att.height = heightStr;
					var par = {};
					if (parObj && typeof parObj === OBJECT) {
						for (var j in parObj) { // copy object to avoid the use of references, because web authors often reuse parObj for multiple SWFs
							par[j] = parObj[j];
						}
					}
					if (flashvarsObj && typeof flashvarsObj === OBJECT) {
						for (var k in flashvarsObj) { // copy object to avoid the use of references, because web authors often reuse flashvarsObj for multiple SWFs
							if (typeof par.flashvars != UNDEF) {
								par.flashvars += "&" + k + "=" + flashvarsObj[k];
							}
							else {
								par.flashvars = k + "=" + flashvarsObj[k];
							}
						}
					}
					if (hasPlayerVersion(swfVersionStr)) { // create SWF
						var obj = createSWF(att, par, replaceElemIdStr);
						if (att.id == replaceElemIdStr) {
							setVisibility(replaceElemIdStr, true);
						}
						callbackObj.success = true;
						callbackObj.ref = obj;
					}
					else if (xiSwfUrlStr && canExpressInstall()) { // show Adobe Express Install
						att.data = xiSwfUrlStr;
						showExpressInstall(att, par, replaceElemIdStr, callbackFn);
						return;
					}
					else { // show alternative content
						setVisibility(replaceElemIdStr, true);
					}
					if (callbackFn) { callbackFn(callbackObj); }
				});
			}
			else if (callbackFn) { callbackFn(callbackObj);	}
		},
		switchOffAutoHideShow: function() {
			autoHideShow = false;
		},
		ua: ua,
		getFlashPlayerVersion: function() {
			return { major:ua.pv[0], minor:ua.pv[1], release:ua.pv[2] };
		},
		hasFlashPlayerVersion: hasPlayerVersion,
		createSWF: function(attObj, parObj, replaceElemIdStr) {
			if (ua.w3) {
				return createSWF(attObj, parObj, replaceElemIdStr);
			}
			else {
				return undefined;
			}
		},
		showExpressInstall: function(att, par, replaceElemIdStr, callbackFn) {
			if (ua.w3 && canExpressInstall()) {
				showExpressInstall(att, par, replaceElemIdStr, callbackFn);
			}
		},
		removeSWF: function(objElemIdStr) {
			if (ua.w3) {
				removeSWF(objElemIdStr);
			}
		},
		createCSS: function(selStr, declStr, mediaStr, newStyleBoolean) {
			if (ua.w3) {
				createCSS(selStr, declStr, mediaStr, newStyleBoolean);
			}
		},
		addDomLoadEvent: addDomLoadEvent,
		addLoadEvent: addLoadEvent,
		getQueryParamValue: function(param) {
			var q = doc.location.search || doc.location.hash;
			if (q) {
				if (/\?/.test(q)) { q = q.split("?")[1]; } // strip question mark
				if (param == null) {
					return urlEncodeIfNecessary(q);
				}
				var pairs = q.split("&");
				for (var i = 0; i < pairs.length; i++) {
					if (pairs[i].substring(0, pairs[i].indexOf("=")) == param) {
						return urlEncodeIfNecessary(pairs[i].substring((pairs[i].indexOf("=") + 1)));
					}
				}
			}
			return "";
		},
		// For internal usage only
		expressInstallCallback: function() {
			if (isExpressInstallActive) {
				var obj = getElementById(EXPRESS_INSTALL_ID);
				if (obj && storedAltContent) {
					obj.parentNode.replaceChild(storedAltContent, obj);
					if (storedAltContentId) {
						setVisibility(storedAltContentId, true);
						if (ua.ie && ua.win) { storedAltContent.style.display = "block"; }
					}
					if (storedCallbackFn) { storedCallbackFn(storedCallbackObj); }
				}
				isExpressInstallActive = false;
			}
		}
	};
}();
module.exports = swfobject;

},{}],29:[function(require,module,exports){
/**
 * Создаёт экземпляр класса, но не запускает его конструктор
 * @param {function} OriginalClass - класс
 * @returns {OriginalClass}
 * @private
 */
var clearInstance = function(OriginalClass) {
    var ClearClass = function(){};
    ClearClass.prototype = OriginalClass.prototype;
    return new ClearClass();
};

module.exports = clearInstance;

},{}],30:[function(require,module,exports){
var clearInstance = require('./clear-instance');

/**
 * Classic Error acts like a fabric: Error.call(this, message) just create new object.
 * ErrorClass acts more like a class: ErrorClass.call(this, message) modify 'this' object.
 * @param {String} [message] - error message
 * @param {Number} [id] - error id
 * @extends Error
 * @constructor
 * @private
 */
var ErrorClass = function(message, id) {
    var err = new Error(message, id);
    err.name = this.name;

    this.message = err.message;
    this.stack = err.stack;
};

/**
 * Sugar. Just create inheritance from ErrorClass and define name property
 * @param {String} name - name of error type
 * @returns {ErrorClass}
 */
ErrorClass.create = function(name) {
    var errClass = clearInstance(ErrorClass);
    errClass.name = name;
    return errClass;
};

ErrorClass.prototype = clearInstance(Error);
ErrorClass.prototype.name = "ErrorClass";

module.exports = ErrorClass;

},{"./clear-instance":29}],31:[function(require,module,exports){
var Events = require('../async/events');

/**
 * @class Прокси-класс. Выдаёт наружу лишь публичные методы объекта и статические свойства.
 * Не копирует методы из Object.prototype. Все методы имеют привязку контекста к проксируемому объекту.
 *
 * @param {Object} [object] - объект, который требуется проксировать
 * @constructor
 * @private
 */
var Proxy = function(object) {
    if (object) {
        for (var key in object) {
            if (key[0] === "_"
                || typeof object[key] !== "function"
                || object[key] === Object.prototype[key]
                || object.hasOwnProperty(key)
                || Events.prototype.hasOwnProperty(key)) {
                continue;
            }

            this[key] = object[key].bind(object);
        }

        if (object.pipeEvents) {
            Events.call(this);

            this.on = Events.prototype.on;
            this.once = Events.prototype.once;
            this.off = Events.prototype.off;
            this.clearListeners = Events.prototype.clearListeners;

            object.pipeEvents(this);
        }
    }
};

/**
 * Экспортирует статические свойства из одного объекта в другой, исключая указанные, приватные и прототип
 * @param {Object} from - откуда копировать
 * @param {Object} to - куда копировать
 * @param {Array.<String>} [exclude] - свойства которые требуется исключить
 */
Proxy.exportStatic = function(from, to, exclude) {
    exclude = exclude || [];

    Object.keys(from).forEach(function(key) {
        if (!from.hasOwnProperty(key)
            || key[0] === "_"
            || key === "prototype"
            || exclude.indexOf(key) !== -1) {
            return;
        }

        to[key] = from[key];
    });
};

/**
 * Создание прокси-пласса привязанного к указанному классу. Можно назначить родительский класс.
 * У родительского класса появляется приватный метод _proxy, который выдаёт прокси-объект для
 * данного экземляра. Также появляется свойство __proxy, содержащее ссылку на созданный прокси-объект
 *
 * @param {function} OriginalClass - оригинальный класс
 * @param {function} ParentProxyClass - родительский класс
 * @returns {function} -- конструтор проксированного класса
 */
Proxy.createClass = function(OriginalClass, ParentProxyClass) {

    var ProxyClass = function() {
        var OriginalClassConstructor = function() {};
        OriginalClassConstructor.prototype = OriginalClass.prototype;

        var original = new OriginalClassConstructor();
        OriginalClass.apply(original, arguments);

        return original._proxy();
    };

    var ParentProxyClassConstructor = function() {};
    ParentProxyClassConstructor.prototype = (ParentProxyClass || Proxy).prototype;
    ProxyClass.prototype = new ParentProxyClassConstructor();

    var val;
    for (var k in OriginalClass.prototype) {
        val = OriginalClass.prototype[k];
        if (Object.prototype[k] == val || typeof val === "function" || k[0] === "_") {
            continue;
        }
        ProxyClass.prototype[k] = val;
    }

    var createProxy = function(original) {
        var proto = Proxy.prototype;
        Proxy.prototype = ProxyClass.prototype;
        var proxy = new Proxy(original);
        Proxy.prototype = proto;
        return proxy;
    };

    OriginalClass.prototype._proxy = function() {
        if (!this.__proxy) {
            this.__proxy = createProxy(this);
        }

        return this.__proxy;
    };

    Proxy.exportStatic(OriginalClass, ProxyClass);

    return ProxyClass;
};

module.exports = Proxy;

},{"../async/events":24}],32:[function(require,module,exports){
/**
 * Скопировать свойства всех перечисленных объектов в один.
 * @param {Object} initial - если последний аргумент true, то новый объект не создаётся, а используется данный
 * @param {...Object|Boolean} args - список объектов из которых копировать свойства. Последний аргумент может быть либо
 * объектом, либо true.
 * @returns {Object}
 * @private
 */
var merge = function (initial) {
    var args = [].slice.call(arguments, 1);
    var object;
    var key;

    if (args[args.length - 1] === true) {
        object = initial;
        args.pop();
    } else {
        object = {};
        for (key in initial) {
            if (initial.hasOwnProperty(key)) {
                object[key] = initial[key];
            }
        }
    }

    for (var k = 0, l = args.length; k < l; k++) {
        for (key in args[k]) {
            if (args[k].hasOwnProperty(key)) {
                object[key] = args[k][key];
            }
        }
    }

    return object;
};

module.exports = merge;

},{}],33:[function(require,module,exports){
require('../../../export');

var LoaderError = require('./loader-error');

ya.Audio.LoaderError = LoaderError;

},{"../../../export":10,"./loader-error":34}],34:[function(require,module,exports){
var ErrorClass = require('../../class/error-class');

/**
 * Класс ошибок загрузчика
 * @alias ya.Audio.LoaderError
 *
 * @param {String} message - текст ошибкки
 *
 * @extends Error
 *
 * @constructor
 */
var LoaderError = function(message) {
    ErrorClass.call(this, message);
};
LoaderError.prototype = ErrorClass.create("LoaderError");

/**
 * Таймаут загрузки
 * @type {string}
 * @const
 */
LoaderError.TIMEOUT = "request timeout";
/**
 * Ошибка запроса на загрузку
 * @type {string}
 * @const
 */
LoaderError.FAILED = "request failed";

module.exports = LoaderError;

},{"../../class/error-class":30}],35:[function(require,module,exports){
module.exports = function() {};

},{}],36:[function(require,module,exports){
require("../export");

var Logger = require('./logger');

ya.Audio.Logger = Logger;

},{"../export":10,"./logger":37}],37:[function(require,module,exports){
var LEVELS = ["debug", "log", "info", "warn", "error", "trace"];
var noop = require('../lib/noop');

/**
 * Настраиваемые логгер для аудио-плеера
 * @alias ya.Audio.Logger
 * @param {String} channel - имя канала, за который будет отвечать экземляр логгера
 * @constructor
 */
var Logger = function(channel) {
    this.channel = channel;
};

/**
 * Список игнорируемых каналов
 * @type {Array.<String>}
 */
Logger.ignores = [];

/**
 * Список отображаемых в консоли уровней лога
 * @type {Array.<String>}
 */
Logger.logLevels = [];

/**
 * Запись в лог с уровнем **debug**
 * @method ya.Audio.Logger#debug
 * @param {Object} context - контекст вызова
 * @param {...*} [args] - дополнительные аргументы
 */
Logger.prototype.debug = noop;

/**
 * Запись в лог с уровнем **log**
 * @method ya.Audio.Logger#log
 * @param {Object} context - контекст вызова
 * @param {...*} [args] - дополнительные аргументы
 */
Logger.prototype.log = noop;

/**
 * Запись в лог с уровнем **info**
 * @method ya.Audio.Logger#info
 * @param {Object} context - контекст вызова
 * @param {...*} [args] - дополнительные аргументы
 */
Logger.prototype.info = noop;

/**
 * Запись в лог с уровнем **warn**
 * @method ya.Audio.Logger#warn
 * @param {Object} context - контекст вызова
 * @param {...*} [args] - дополнительные аргументы
 */
Logger.prototype.warn = noop;

/**
 * Запись в лог с уровнем **error**
 * @method ya.Audio.Logger#error
 * @param {Object} context - контекст вызова
 * @param {...*} [args] - дополнительные аргументы
 */
Logger.prototype.error = noop;

/**
 * Запись в лог с уровнем **trace**
 * @method ya.Audio.Logger#trace
 * @param {Object} context - контекст вызова
 * @param {...*} [args] - дополнительные аргументы
 */
Logger.prototype.trace = noop;

/**
 * Сделать запись в лог
 * @param {String} level - уровень лога
 * @param {String} channel - канал
 * @param {Object} context - контекст вызова
 * @param {...*} [args] - дополнительные аргументы
 */
Logger.log = function(level, channel, context) {
    var data = [].slice.call(arguments, 3).map(function(dumpItem) {
        return dumpItem && dumpItem._logger && dumpItem._logger() || dumpItem;
    });

    var logEntry = {
        timestamp: +new Date(),
        level: level,
        channel: channel,
        context: context,
        message: data
    };

    if (Logger.ignores[channel] || Logger.logLevels.indexOf(level) === -1) {
        return;
    }

    Logger._dumpEntry(logEntry);
};

/**
 * Запись в логе
 * @typedef {Object} ya.Audio.Logger~LogEntry
 *
 * @property {Number} timestamp - время в timestamp формате
 * @property {String} level - уровень лога
 * @property {String} channel - канал
 * @property {Object} context - контекст вызова
 * @property {Array} message - дополнительные аргументы
 *
 * @private
 */

/**
 * Записать сообщение лога в консоль
 * @param {ya.Audio.Logger~LogEntry} logEntry - сообщение лога
 * @private
 */
Logger._dumpEntry = function(logEntry) {
    try {
        var level = logEntry.level;

        var name = logEntry.context && (logEntry.context.taskName || logEntry.context.name);
        var context = logEntry.context && (logEntry.context._logger ? logEntry.context._logger() : "");

        if (typeof console[level] !== "function") {
            console.log.apply(console, [
                level.toUpperCase(),
                Logger._formatTimestamp(logEntry.timestamp),
                "[" + logEntry.channel + (name ? ":" + name : "") + "]",
                context
            ].concat(logEntry.message));
        } else {
            console[level].apply(console, [
                Logger._formatTimestamp(logEntry.timestamp),
                "[" + logEntry.channel + (name ? ":" + name : "") + "]",
                context
            ].concat(logEntry.message));
        }
    } catch(e) {
    }
};

/**
 * Вспомогательная функция форматирования даты для вывода в коносоль
 * @param timestamp
 * @returns {string}
 * @private
 */
Logger._formatTimestamp = function(timestamp) {
    var date = new Date(timestamp);
    var ms = date.getMilliseconds();
    ms = ms > 100 ? ms : ms > 10 ? "0" + ms : "00" + ms;
    return date.toLocaleTimeString() + "." + ms;
};

LEVELS.forEach(function(level) {
    Logger.prototype[level] = function() {
        var args = [].slice.call(arguments);
        args.unshift(this.channel);
        args.unshift(level);
        Logger.log.apply(Logger, args);
    };
});

module.exports = Logger;

},{"../lib/noop":35}],38:[function(require,module,exports){
var Modules = require('ym');
var YandexAudio = require("./index.js");

var modules;
if (window.modules) {
    modules = window.modules;
} else {
    modules = window.modules = Modules.create();
}

modules.define('YandexAudio', function(provide) {
    provide(YandexAudio);
});

},{"./index.js":22,"ym":3}]},{},[38])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3Zvdy9saWIvdm93LmpzIiwibm9kZV9tb2R1bGVzL3ltL21vZHVsZXMuanMiLCJzcmMvYXVkaW8tcGxheWVyLmpzIiwic3JjL2F1ZGlvLXN0YXRpYy5qcyIsInNyYy9jb25maWcuanMiLCJzcmMvZXJyb3IvYXVkaW8tZXJyb3IuanMiLCJzcmMvZXJyb3IvZXhwb3J0LmpzIiwic3JjL2Vycm9yL3BsYXliYWNrLWVycm9yLmpzIiwic3JjL2V4cG9ydC5qcyIsInNyYy9mbGFzaC9hdWRpby1mbGFzaC5qcyIsInNyYy9mbGFzaC9mbGFzaC1pbnRlcmZhY2UuanMiLCJzcmMvZmxhc2gvZmxhc2gtbWFuYWdlci5qcyIsInNyYy9mbGFzaC9mbGFzaGJsb2Nrbm90aWZpZXIuanMiLCJzcmMvZmxhc2gvZmxhc2hlbWJlZGRlci5qcyIsInNyYy9mbGFzaC9sb2FkZXIuanMiLCJzcmMvZngvZXF1YWxpemVyL2RlZmF1bHQucHJlc2V0cy5qcyIsInNyYy9meC9lcXVhbGl6ZXIvZXF1YWxpemVyLmpzIiwic3JjL2Z4L2VxdWFsaXplci9leHBvcnQuanMiLCJzcmMvZngvZXhwb3J0LmpzIiwic3JjL2h0bWw1L2F1ZGlvLWh0bWw1LmpzIiwic3JjL2luZGV4LmpzIiwic3JjL2xpYi9hc3luYy9kZWZlcnJlZC5qcyIsInNyYy9saWIvYXN5bmMvZXZlbnRzLmpzIiwic3JjL2xpYi9hc3luYy9wcm9taXNlLmpzIiwic3JjL2xpYi9hc3luYy9yZWplY3QuanMiLCJzcmMvbGliL2Jyb3dzZXIvZGV0ZWN0LmpzIiwic3JjL2xpYi9icm93c2VyL3N3Zm9iamVjdC5qcyIsInNyYy9saWIvY2xhc3MvY2xlYXItaW5zdGFuY2UuanMiLCJzcmMvbGliL2NsYXNzL2Vycm9yLWNsYXNzLmpzIiwic3JjL2xpYi9jbGFzcy9wcm94eS5qcyIsInNyYy9saWIvZGF0YS9tZXJnZS5qcyIsInNyYy9saWIvbmV0L2Vycm9yL2V4cG9ydC5qcyIsInNyYy9saWIvbmV0L2Vycm9yL2xvYWRlci1lcnJvci5qcyIsInNyYy9saWIvbm9vcC5qcyIsInNyYy9sb2dnZXIvZXhwb3J0LmpzIiwic3JjL2xvZ2dlci9sb2dnZXIuanMiLCJzcmMvbW9kdWxlcy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDaHpDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbGFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0MUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDek5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTUE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDem5CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNodUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiLyoqXG4gKiBAbW9kdWxlIHZvd1xuICogQGF1dGhvciBGaWxhdG92IERtaXRyeSA8ZGZpbGF0b3ZAeWFuZGV4LXRlYW0ucnU+XG4gKiBAdmVyc2lvbiAwLjQuMTBcbiAqIEBsaWNlbnNlXG4gKiBEdWFsIGxpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgYW5kIEdQTCBsaWNlbnNlczpcbiAqICAgKiBodHRwOi8vd3d3Lm9wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlLnBocFxuICogICAqIGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy9ncGwuaHRtbFxuICovXG5cbihmdW5jdGlvbihnbG9iYWwpIHtcblxudmFyIHVuZGVmLFxuICAgIG5leHRUaWNrID0gKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZm5zID0gW10sXG4gICAgICAgICAgICBlbnF1ZXVlRm4gPSBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmbnMucHVzaChmbikgPT09IDE7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2FsbEZucyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBmbnNUb0NhbGwgPSBmbnMsIGkgPSAwLCBsZW4gPSBmbnMubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGZucyA9IFtdO1xuICAgICAgICAgICAgICAgIHdoaWxlKGkgPCBsZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgZm5zVG9DYWxsW2krK10oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIGlmKHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicpIHsgLy8gaWUxMCwgbm9kZWpzID49IDAuMTBcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIGVucXVldWVGbihmbikgJiYgc2V0SW1tZWRpYXRlKGNhbGxGbnMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHR5cGVvZiBwcm9jZXNzID09PSAnb2JqZWN0JyAmJiBwcm9jZXNzLm5leHRUaWNrKSB7IC8vIG5vZGVqcyA8IDAuMTBcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIGVucXVldWVGbihmbikgJiYgcHJvY2Vzcy5uZXh0VGljayhjYWxsRm5zKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgTXV0YXRpb25PYnNlcnZlciA9IGdsb2JhbC5NdXRhdGlvbk9ic2VydmVyIHx8IGdsb2JhbC5XZWJLaXRNdXRhdGlvbk9ic2VydmVyOyAvLyBtb2Rlcm4gYnJvd3NlcnNcbiAgICAgICAgaWYoTXV0YXRpb25PYnNlcnZlcikge1xuICAgICAgICAgICAgdmFyIG51bSA9IDEsXG4gICAgICAgICAgICAgICAgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcblxuICAgICAgICAgICAgbmV3IE11dGF0aW9uT2JzZXJ2ZXIoY2FsbEZucykub2JzZXJ2ZShub2RlLCB7IGNoYXJhY3RlckRhdGEgOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgICAgICBlbnF1ZXVlRm4oZm4pICYmIChub2RlLmRhdGEgPSAobnVtICo9IC0xKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoZ2xvYmFsLnBvc3RNZXNzYWdlKSB7XG4gICAgICAgICAgICB2YXIgaXNQb3N0TWVzc2FnZUFzeW5jID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmKGdsb2JhbC5hdHRhY2hFdmVudCkge1xuICAgICAgICAgICAgICAgIHZhciBjaGVja0FzeW5jID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Bvc3RNZXNzYWdlQXN5bmMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBnbG9iYWwuYXR0YWNoRXZlbnQoJ29ubWVzc2FnZScsIGNoZWNrQXN5bmMpO1xuICAgICAgICAgICAgICAgIGdsb2JhbC5wb3N0TWVzc2FnZSgnX19jaGVja0FzeW5jJywgJyonKTtcbiAgICAgICAgICAgICAgICBnbG9iYWwuZGV0YWNoRXZlbnQoJ29ubWVzc2FnZScsIGNoZWNrQXN5bmMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihpc1Bvc3RNZXNzYWdlQXN5bmMpIHtcbiAgICAgICAgICAgICAgICB2YXIgbXNnID0gJ19fcHJvbWlzZScgKyArbmV3IERhdGUsXG4gICAgICAgICAgICAgICAgICAgIG9uTWVzc2FnZSA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKGUuZGF0YSA9PT0gbXNnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24gJiYgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsRm5zKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcj9cbiAgICAgICAgICAgICAgICAgICAgZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBvbk1lc3NhZ2UsIHRydWUpIDpcbiAgICAgICAgICAgICAgICAgICAgZ2xvYmFsLmF0dGFjaEV2ZW50KCdvbm1lc3NhZ2UnLCBvbk1lc3NhZ2UpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAgICAgICAgIGVucXVldWVGbihmbikgJiYgZ2xvYmFsLnBvc3RNZXNzYWdlKG1zZywgJyonKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRvYyA9IGdsb2JhbC5kb2N1bWVudDtcbiAgICAgICAgaWYoJ29ucmVhZHlzdGF0ZWNoYW5nZScgaW4gZG9jLmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpKSB7IC8vIGllNi1pZThcbiAgICAgICAgICAgIHZhciBjcmVhdGVTY3JpcHQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNjcmlwdCA9IGRvYy5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgICAgICAgICAgICAgc2NyaXB0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NyaXB0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoc2NyaXB0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjcmlwdCA9IHNjcmlwdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbEZucygpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgKGRvYy5kb2N1bWVudEVsZW1lbnQgfHwgZG9jLmJvZHkpLmFwcGVuZENoaWxkKHNjcmlwdCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgICAgICBlbnF1ZXVlRm4oZm4pICYmIGNyZWF0ZVNjcmlwdCgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihmbikgeyAvLyBvbGQgYnJvd3NlcnNcbiAgICAgICAgICAgIGVucXVldWVGbihmbikgJiYgc2V0VGltZW91dChjYWxsRm5zLCAwKTtcbiAgICAgICAgfTtcbiAgICB9KSgpLFxuICAgIHRocm93RXhjZXB0aW9uID0gZnVuY3Rpb24oZSkge1xuICAgICAgICBuZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH0pO1xuICAgIH0sXG4gICAgaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9LFxuICAgIGlzT2JqZWN0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHJldHVybiBvYmogIT09IG51bGwgJiYgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCc7XG4gICAgfSxcbiAgICB0b1N0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcsXG4gICAgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHJldHVybiB0b1N0ci5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgfSxcbiAgICBnZXRBcnJheUtleXMgPSBmdW5jdGlvbihhcnIpIHtcbiAgICAgICAgdmFyIHJlcyA9IFtdLFxuICAgICAgICAgICAgaSA9IDAsIGxlbiA9IGFyci5sZW5ndGg7XG4gICAgICAgIHdoaWxlKGkgPCBsZW4pIHtcbiAgICAgICAgICAgIHJlcy5wdXNoKGkrKyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9LFxuICAgIGdldE9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbihvYmopIHtcbiAgICAgICAgdmFyIHJlcyA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgaW4gb2JqKSB7XG4gICAgICAgICAgICBvYmouaGFzT3duUHJvcGVydHkoaSkgJiYgcmVzLnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9LFxuICAgIGRlZmluZUN1c3RvbUVycm9yVHlwZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgdmFyIHJlcyA9IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJlcy5wcm90b3R5cGUgPSBuZXcgRXJyb3IoKTtcblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH0sXG4gICAgd3JhcE9uRnVsZmlsbGVkID0gZnVuY3Rpb24ob25GdWxmaWxsZWQsIGlkeCkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICBvbkZ1bGZpbGxlZC5jYWxsKHRoaXMsIHZhbCwgaWR4KTtcbiAgICAgICAgfTtcbiAgICB9O1xuXG4vKipcbiAqIEBjbGFzcyBEZWZlcnJlZFxuICogQGV4cG9ydHMgdm93OkRlZmVycmVkXG4gKiBAZGVzY3JpcHRpb25cbiAqIFRoZSBgRGVmZXJyZWRgIGNsYXNzIGlzIHVzZWQgdG8gZW5jYXBzdWxhdGUgbmV3bHktY3JlYXRlZCBwcm9taXNlIG9iamVjdCBhbG9uZyB3aXRoIGZ1bmN0aW9ucyB0aGF0IHJlc29sdmUsIHJlamVjdCBvciBub3RpZnkgaXQuXG4gKi9cblxuLyoqXG4gKiBAY29uc3RydWN0b3JcbiAqIEBkZXNjcmlwdGlvblxuICogWW91IGNhbiB1c2UgYHZvdy5kZWZlcigpYCBpbnN0ZWFkIG9mIHVzaW5nIHRoaXMgY29uc3RydWN0b3IuXG4gKlxuICogYG5ldyB2b3cuRGVmZXJyZWQoKWAgZ2l2ZXMgdGhlIHNhbWUgcmVzdWx0IGFzIGB2b3cuZGVmZXIoKWAuXG4gKi9cbnZhciBEZWZlcnJlZCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3Byb21pc2UgPSBuZXcgUHJvbWlzZSgpO1xufTtcblxuRGVmZXJyZWQucHJvdG90eXBlID0gLyoqIEBsZW5kcyBEZWZlcnJlZC5wcm90b3R5cGUgKi97XG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIHByb21pc2UgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Byb21pc2U7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlc29sdmVzIHRoZSBjb3JyZXNwb25kaW5nIHByb21pc2Ugd2l0aCB0aGUgZ2l2ZW4gYHZhbHVlYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYGBganNcbiAgICAgKiB2YXIgZGVmZXIgPSB2b3cuZGVmZXIoKSxcbiAgICAgKiAgICAgcHJvbWlzZSA9IGRlZmVyLnByb21pc2UoKTtcbiAgICAgKlxuICAgICAqIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAqICAgICAvLyB2YWx1ZSBpcyBcIidzdWNjZXNzJ1wiIGhlcmVcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIGRlZmVyLnJlc29sdmUoJ3N1Y2Nlc3MnKTtcbiAgICAgKiBgYGBcbiAgICAgKi9cbiAgICByZXNvbHZlIDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fcHJvbWlzZS5pc1Jlc29sdmVkKCkgfHwgdGhpcy5fcHJvbWlzZS5fcmVzb2x2ZSh2YWx1ZSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlamVjdHMgdGhlIGNvcnJlc3BvbmRpbmcgcHJvbWlzZSB3aXRoIHRoZSBnaXZlbiBgcmVhc29uYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gcmVhc29uXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIGRlZmVyID0gdm93LmRlZmVyKCksXG4gICAgICogICAgIHByb21pc2UgPSBkZWZlci5wcm9taXNlKCk7XG4gICAgICpcbiAgICAgKiBwcm9taXNlLmZhaWwoZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICogICAgIC8vIHJlYXNvbiBpcyBcIidzb21ldGhpbmcgaXMgd3JvbmcnXCIgaGVyZVxuICAgICAqIH0pO1xuICAgICAqXG4gICAgICogZGVmZXIucmVqZWN0KCdzb21ldGhpbmcgaXMgd3JvbmcnKTtcbiAgICAgKiBgYGBcbiAgICAgKi9cbiAgICByZWplY3QgOiBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgaWYodGhpcy5fcHJvbWlzZS5pc1Jlc29sdmVkKCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHZvdy5pc1Byb21pc2UocmVhc29uKSkge1xuICAgICAgICAgICAgcmVhc29uID0gcmVhc29uLnRoZW4oZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlZmVyID0gdm93LmRlZmVyKCk7XG4gICAgICAgICAgICAgICAgZGVmZXIucmVqZWN0KHZhbCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5fcHJvbWlzZS5fcmVzb2x2ZShyZWFzb24pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fcHJvbWlzZS5fcmVqZWN0KHJlYXNvbik7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTm90aWZpZXMgdGhlIGNvcnJlc3BvbmRpbmcgcHJvbWlzZSB3aXRoIHRoZSBnaXZlbiBgdmFsdWVgLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBgYGBqc1xuICAgICAqIHZhciBkZWZlciA9IHZvdy5kZWZlcigpLFxuICAgICAqICAgICBwcm9taXNlID0gZGVmZXIucHJvbWlzZSgpO1xuICAgICAqXG4gICAgICogcHJvbWlzZS5wcm9ncmVzcyhmdW5jdGlvbih2YWx1ZSkge1xuICAgICAqICAgICAvLyB2YWx1ZSBpcyBcIicyMCUnXCIsIFwiJzQwJSdcIiBoZXJlXG4gICAgICogfSk7XG4gICAgICpcbiAgICAgKiBkZWZlci5ub3RpZnkoJzIwJScpO1xuICAgICAqIGRlZmVyLm5vdGlmeSgnNDAlJyk7XG4gICAgICogYGBgXG4gICAgICovXG4gICAgbm90aWZ5IDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fcHJvbWlzZS5pc1Jlc29sdmVkKCkgfHwgdGhpcy5fcHJvbWlzZS5fbm90aWZ5KHZhbHVlKTtcbiAgICB9XG59O1xuXG52YXIgUFJPTUlTRV9TVEFUVVMgPSB7XG4gICAgUEVORElORyAgIDogMCxcbiAgICBSRVNPTFZFRCAgOiAxLFxuICAgIEZVTEZJTExFRCA6IDIsXG4gICAgUkVKRUNURUQgIDogM1xufTtcblxuLyoqXG4gKiBAY2xhc3MgUHJvbWlzZVxuICogQGV4cG9ydHMgdm93OlByb21pc2VcbiAqIEBkZXNjcmlwdGlvblxuICogVGhlIGBQcm9taXNlYCBjbGFzcyBpcyB1c2VkIHdoZW4geW91IHdhbnQgdG8gZ2l2ZSB0byB0aGUgY2FsbGVyIHNvbWV0aGluZyB0byBzdWJzY3JpYmUgdG8sXG4gKiBidXQgbm90IHRoZSBhYmlsaXR5IHRvIHJlc29sdmUgb3IgcmVqZWN0IHRoZSBkZWZlcnJlZC5cbiAqL1xuXG4vKipcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtGdW5jdGlvbn0gcmVzb2x2ZXIgU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9kb21lbmljL3Byb21pc2VzLXVud3JhcHBpbmcvYmxvYi9tYXN0ZXIvUkVBRE1FLm1kI3RoZS1wcm9taXNlLWNvbnN0cnVjdG9yIGZvciBkZXRhaWxzLlxuICogQGRlc2NyaXB0aW9uXG4gKiBZb3Ugc2hvdWxkIHVzZSB0aGlzIGNvbnN0cnVjdG9yIGRpcmVjdGx5IG9ubHkgaWYgeW91IGFyZSBnb2luZyB0byB1c2UgYHZvd2AgYXMgRE9NIFByb21pc2VzIGltcGxlbWVudGF0aW9uLlxuICogSW4gb3RoZXIgY2FzZSB5b3Ugc2hvdWxkIHVzZSBgdm93LmRlZmVyKClgIGFuZCBgZGVmZXIucHJvbWlzZSgpYCBtZXRob2RzLlxuICogQGV4YW1wbGVcbiAqIGBgYGpzXG4gKiBmdW5jdGlvbiBmZXRjaEpTT04odXJsKSB7XG4gKiAgICAgcmV0dXJuIG5ldyB2b3cuUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QsIG5vdGlmeSkge1xuICogICAgICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gKiAgICAgICAgIHhoci5vcGVuKCdHRVQnLCB1cmwpO1xuICogICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xuICogICAgICAgICB4aHIuc2VuZCgpO1xuICogICAgICAgICB4aHIub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gKiAgICAgICAgICAgICBpZih4aHIucmVzcG9uc2UpIHtcbiAqICAgICAgICAgICAgICAgICByZXNvbHZlKHhoci5yZXNwb25zZSk7XG4gKiAgICAgICAgICAgICB9XG4gKiAgICAgICAgICAgICBlbHNlIHtcbiAqICAgICAgICAgICAgICAgICByZWplY3QobmV3IFR5cGVFcnJvcigpKTtcbiAqICAgICAgICAgICAgIH1cbiAqICAgICAgICAgfTtcbiAqICAgICB9KTtcbiAqIH1cbiAqIGBgYFxuICovXG52YXIgUHJvbWlzZSA9IGZ1bmN0aW9uKHJlc29sdmVyKSB7XG4gICAgdGhpcy5fdmFsdWUgPSB1bmRlZjtcbiAgICB0aGlzLl9zdGF0dXMgPSBQUk9NSVNFX1NUQVRVUy5QRU5ESU5HO1xuXG4gICAgdGhpcy5fZnVsZmlsbGVkQ2FsbGJhY2tzID0gW107XG4gICAgdGhpcy5fcmVqZWN0ZWRDYWxsYmFja3MgPSBbXTtcbiAgICB0aGlzLl9wcm9ncmVzc0NhbGxiYWNrcyA9IFtdO1xuXG4gICAgaWYocmVzb2x2ZXIpIHsgLy8gTk9URTogc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9kb21lbmljL3Byb21pc2VzLXVud3JhcHBpbmcvYmxvYi9tYXN0ZXIvUkVBRE1FLm1kXG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXMsXG4gICAgICAgICAgICByZXNvbHZlckZuTGVuID0gcmVzb2x2ZXIubGVuZ3RoO1xuXG4gICAgICAgIHJlc29sdmVyKFxuICAgICAgICAgICAgZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgICAgX3RoaXMuaXNSZXNvbHZlZCgpIHx8IF90aGlzLl9yZXNvbHZlKHZhbCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcmVzb2x2ZXJGbkxlbiA+IDE/XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgICAgIF90aGlzLmlzUmVzb2x2ZWQoKSB8fCBfdGhpcy5fcmVqZWN0KHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfSA6XG4gICAgICAgICAgICAgICAgdW5kZWYsXG4gICAgICAgICAgICByZXNvbHZlckZuTGVuID4gMj9cbiAgICAgICAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgX3RoaXMuaXNSZXNvbHZlZCgpIHx8IF90aGlzLl9ub3RpZnkodmFsKTtcbiAgICAgICAgICAgICAgICB9IDpcbiAgICAgICAgICAgICAgICB1bmRlZik7XG4gICAgfVxufTtcblxuUHJvbWlzZS5wcm90b3R5cGUgPSAvKiogQGxlbmRzIFByb21pc2UucHJvdG90eXBlICovIHtcbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB0aGUgZnVsZmlsbGVkIHByb21pc2Ugb3IgdGhlIHJlYXNvbiBpbiBjYXNlIG9mIHJlamVjdGlvbi5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHsqfVxuICAgICAqL1xuICAgIHZhbHVlT2YgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3ZhbHVlO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzUmVzb2x2ZWQgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXR1cyAhPT0gUFJPTUlTRV9TVEFUVVMuUEVORElORztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHByb21pc2UgaXMgZnVsZmlsbGVkLlxuICAgICAqXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgaXNGdWxmaWxsZWQgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXR1cyA9PT0gUFJPTUlTRV9TVEFUVVMuRlVMRklMTEVEO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgcHJvbWlzZSBpcyByZWplY3RlZC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzUmVqZWN0ZWQgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0YXR1cyA9PT0gUFJPTUlTRV9TVEFUVVMuUkVKRUNURUQ7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFkZHMgcmVhY3Rpb25zIHRvIHRoZSBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uRnVsZmlsbGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gZnVsZmlsbGVkXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uUmVqZWN0ZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCByZWFzb24gYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25Qcm9ncmVzc10gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIG5vdGlmaWVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrcyBleGVjdXRpb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9IEEgbmV3IHByb21pc2UsIHNlZSBodHRwczovL2dpdGh1Yi5jb20vcHJvbWlzZXMtYXBsdXMvcHJvbWlzZXMtc3BlYyBmb3IgZGV0YWlsc1xuICAgICAqL1xuICAgIHRoZW4gOiBmdW5jdGlvbihvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Qcm9ncmVzcywgY3R4KSB7XG4gICAgICAgIHZhciBkZWZlciA9IG5ldyBEZWZlcnJlZCgpO1xuICAgICAgICB0aGlzLl9hZGRDYWxsYmFja3MoZGVmZXIsIG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBvblByb2dyZXNzLCBjdHgpO1xuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZSgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIG9ubHkgYSByZWplY3Rpb24gcmVhY3Rpb24uIFRoaXMgbWV0aG9kIGlzIGEgc2hvcnRoYW5kIGZvciBgcHJvbWlzZS50aGVuKHVuZGVmaW5lZCwgb25SZWplY3RlZClgLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZCBDYWxsYmFjayB0aGF0IHdpbGwgYmUgY2FsbGVkIHdpdGggYSBwcm92aWRlZCAncmVhc29uJyBhcyBhcmd1bWVudCBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiByZWplY3RlZFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY3R4XSBDb250ZXh0IG9mIHRoZSBjYWxsYmFjayBleGVjdXRpb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgJ2NhdGNoJyA6IGZ1bmN0aW9uKG9uUmVqZWN0ZWQsIGN0eCkge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKHVuZGVmLCBvblJlamVjdGVkLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIG9ubHkgYSByZWplY3Rpb24gcmVhY3Rpb24uIFRoaXMgbWV0aG9kIGlzIGEgc2hvcnRoYW5kIGZvciBgcHJvbWlzZS50aGVuKG51bGwsIG9uUmVqZWN0ZWQpYC4gSXQncyBhbHNvIGFuIGFsaWFzIGZvciBgY2F0Y2hgLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZCBDYWxsYmFjayB0byBiZSBjYWxsZWQgd2l0aCB0aGUgdmFsdWUgYWZ0ZXIgcHJvbWlzZSBoYXMgYmVlbiByZWplY3RlZFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY3R4XSBDb250ZXh0IG9mIHRoZSBjYWxsYmFjayBleGVjdXRpb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgZmFpbCA6IGZ1bmN0aW9uKG9uUmVqZWN0ZWQsIGN0eCkge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKHVuZGVmLCBvblJlamVjdGVkLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcmVzb2x2aW5nIHJlYWN0aW9uIChmb3IgYm90aCBmdWxmaWxsbWVudCBhbmQgcmVqZWN0aW9uKS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVzb2x2ZWQgQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCB0aGUgcHJvbWlzZSBhcyBhbiBhcmd1bWVudCwgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVzb2x2ZWQuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrIGV4ZWN1dGlvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBhbHdheXMgOiBmdW5jdGlvbihvblJlc29sdmVkLCBjdHgpIHtcbiAgICAgICAgdmFyIF90aGlzID0gdGhpcyxcbiAgICAgICAgICAgIGNiID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uUmVzb2x2ZWQuY2FsbCh0aGlzLCBfdGhpcyk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB0aGlzLnRoZW4oY2IsIGNiLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgcHJvZ3Jlc3MgcmVhY3Rpb24uXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvblByb2dyZXNzIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBjYWxsZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIHdoZW4gdGhlIHByb21pc2UgaGFzIGJlZW4gbm90aWZpZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2sgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIHByb2dyZXNzIDogZnVuY3Rpb24ob25Qcm9ncmVzcywgY3R4KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRoZW4odW5kZWYsIHVuZGVmLCBvblByb2dyZXNzLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBMaWtlIGBwcm9taXNlLnRoZW5gLCBidXQgXCJzcHJlYWRzXCIgdGhlIGFycmF5IGludG8gYSB2YXJpYWRpYyB2YWx1ZSBoYW5kbGVyLlxuICAgICAqIEl0IGlzIHVzZWZ1bCB3aXRoIHRoZSBgdm93LmFsbGAgYW5kIHRoZSBgdm93LmFsbFJlc29sdmVkYCBtZXRob2RzLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uRnVsZmlsbGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gZnVsZmlsbGVkXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uUmVqZWN0ZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCByZWFzb24gYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2tzIGV4ZWN1dGlvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYGBganNcbiAgICAgKiB2YXIgZGVmZXIxID0gdm93LmRlZmVyKCksXG4gICAgICogICAgIGRlZmVyMiA9IHZvdy5kZWZlcigpO1xuICAgICAqXG4gICAgICogdm93LmFsbChbZGVmZXIxLnByb21pc2UoKSwgZGVmZXIyLnByb21pc2UoKV0pLnNwcmVhZChmdW5jdGlvbihhcmcxLCBhcmcyKSB7XG4gICAgICogICAgIC8vIGFyZzEgaXMgXCIxXCIsIGFyZzIgaXMgXCIndHdvJ1wiIGhlcmVcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIGRlZmVyMS5yZXNvbHZlKDEpO1xuICAgICAqIGRlZmVyMi5yZXNvbHZlKCd0d28nKTtcbiAgICAgKiBgYGBcbiAgICAgKi9cbiAgICBzcHJlYWQgOiBmdW5jdGlvbihvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgY3R4KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRoZW4oXG4gICAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25GdWxmaWxsZWQuYXBwbHkodGhpcywgdmFsKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblJlamVjdGVkLFxuICAgICAgICAgICAgY3R4KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTGlrZSBgdGhlbmAsIGJ1dCB0ZXJtaW5hdGVzIGEgY2hhaW4gb2YgcHJvbWlzZXMuXG4gICAgICogSWYgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWQsIHRoaXMgbWV0aG9kIHRocm93cyBpdCdzIFwicmVhc29uXCIgYXMgYW4gZXhjZXB0aW9uIGluIGEgZnV0dXJlIHR1cm4gb2YgdGhlIGV2ZW50IGxvb3AuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25GdWxmaWxsZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCB2YWx1ZSBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiBmdWxmaWxsZWRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25SZWplY3RlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHJlYXNvbiBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiByZWplY3RlZFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblByb2dyZXNzXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gbm90aWZpZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2tzIGV4ZWN1dGlvblxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBgYGBqc1xuICAgICAqIHZhciBkZWZlciA9IHZvdy5kZWZlcigpO1xuICAgICAqIGRlZmVyLnJlamVjdChFcnJvcignSW50ZXJuYWwgZXJyb3InKSk7XG4gICAgICogZGVmZXIucHJvbWlzZSgpLmRvbmUoKTsgLy8gZXhjZXB0aW9uIHRvIGJlIHRocm93blxuICAgICAqIGBgYFxuICAgICAqL1xuICAgIGRvbmUgOiBmdW5jdGlvbihvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Qcm9ncmVzcywgY3R4KSB7XG4gICAgICAgIHRoaXNcbiAgICAgICAgICAgIC50aGVuKG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBvblByb2dyZXNzLCBjdHgpXG4gICAgICAgICAgICAuZmFpbCh0aHJvd0V4Y2VwdGlvbik7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgcHJvbWlzZSB0aGF0IHdpbGwgYmUgZnVsZmlsbGVkIGluIGBkZWxheWAgbWlsbGlzZWNvbmRzIGlmIHRoZSBwcm9taXNlIGlzIGZ1bGZpbGxlZCxcbiAgICAgKiBvciBpbW1lZGlhdGVseSByZWplY3RlZCBpZiB0aGUgcHJvbWlzZSBpcyByZWplY3RlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZWxheVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBkZWxheSA6IGZ1bmN0aW9uKGRlbGF5KSB7XG4gICAgICAgIHZhciB0aW1lcixcbiAgICAgICAgICAgIHByb21pc2UgPSB0aGlzLnRoZW4oZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlZmVyID0gbmV3IERlZmVycmVkKCk7XG4gICAgICAgICAgICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KFxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVyLnJlc29sdmUodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgZGVsYXkpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIHByb21pc2UuYWx3YXlzKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBuZXcgcHJvbWlzZSB0aGF0IHdpbGwgYmUgcmVqZWN0ZWQgaW4gYHRpbWVvdXRgIG1pbGxpc2Vjb25kc1xuICAgICAqIGlmIHRoZSBwcm9taXNlIGlzIG5vdCByZXNvbHZlZCBiZWZvcmVoYW5kLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVvdXRcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIGRlZmVyID0gdm93LmRlZmVyKCksXG4gICAgICogICAgIHByb21pc2VXaXRoVGltZW91dDEgPSBkZWZlci5wcm9taXNlKCkudGltZW91dCg1MCksXG4gICAgICogICAgIHByb21pc2VXaXRoVGltZW91dDIgPSBkZWZlci5wcm9taXNlKCkudGltZW91dCgyMDApO1xuICAgICAqXG4gICAgICogc2V0VGltZW91dChcbiAgICAgKiAgICAgZnVuY3Rpb24oKSB7XG4gICAgICogICAgICAgICBkZWZlci5yZXNvbHZlKCdvaycpO1xuICAgICAqICAgICB9LFxuICAgICAqICAgICAxMDApO1xuICAgICAqXG4gICAgICogcHJvbWlzZVdpdGhUaW1lb3V0MS5mYWlsKGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAqICAgICAvLyBwcm9taXNlV2l0aFRpbWVvdXQgdG8gYmUgcmVqZWN0ZWQgaW4gNTBtc1xuICAgICAqIH0pO1xuICAgICAqXG4gICAgICogcHJvbWlzZVdpdGhUaW1lb3V0Mi50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICogICAgIC8vIHByb21pc2VXaXRoVGltZW91dCB0byBiZSBmdWxmaWxsZWQgd2l0aCBcIidvaydcIiB2YWx1ZVxuICAgICAqIH0pO1xuICAgICAqIGBgYFxuICAgICAqL1xuICAgIHRpbWVvdXQgOiBmdW5jdGlvbih0aW1lb3V0KSB7XG4gICAgICAgIHZhciBkZWZlciA9IG5ldyBEZWZlcnJlZCgpLFxuICAgICAgICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlci5yZWplY3QobmV3IHZvdy5UaW1lZE91dEVycm9yKCd0aW1lZCBvdXQnKSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB0aW1lb3V0KTtcblxuICAgICAgICB0aGlzLnRoZW4oXG4gICAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgICBkZWZlci5yZXNvbHZlKHZhbCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgZGVmZXIucmVqZWN0KHJlYXNvbik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICBkZWZlci5wcm9taXNlKCkuYWx3YXlzKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgX3ZvdyA6IHRydWUsXG5cbiAgICBfcmVzb2x2ZSA6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICBpZih0aGlzLl9zdGF0dXMgPiBQUk9NSVNFX1NUQVRVUy5SRVNPTFZFRCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYodmFsID09PSB0aGlzKSB7XG4gICAgICAgICAgICB0aGlzLl9yZWplY3QoVHlwZUVycm9yKCdDYW5cXCd0IHJlc29sdmUgcHJvbWlzZSB3aXRoIGl0c2VsZicpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3N0YXR1cyA9IFBST01JU0VfU1RBVFVTLlJFU09MVkVEO1xuXG4gICAgICAgIGlmKHZhbCAmJiAhIXZhbC5fdm93KSB7IC8vIHNob3J0cGF0aCBmb3Igdm93LlByb21pc2VcbiAgICAgICAgICAgIHZhbC5pc0Z1bGZpbGxlZCgpP1xuICAgICAgICAgICAgICAgIHRoaXMuX2Z1bGZpbGwodmFsLnZhbHVlT2YoKSkgOlxuICAgICAgICAgICAgICAgIHZhbC5pc1JlamVjdGVkKCk/XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlamVjdCh2YWwudmFsdWVPZigpKSA6XG4gICAgICAgICAgICAgICAgICAgIHZhbC50aGVuKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZnVsZmlsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlamVjdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX25vdGlmeSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoaXNPYmplY3QodmFsKSB8fCBpc0Z1bmN0aW9uKHZhbCkpIHtcbiAgICAgICAgICAgIHZhciB0aGVuO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aGVuID0gdmFsLnRoZW47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVqZWN0KGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoaXNGdW5jdGlvbih0aGVuKSkge1xuICAgICAgICAgICAgICAgIHZhciBfdGhpcyA9IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIGlzUmVzb2x2ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHRoZW4uY2FsbChcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKGlzUmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzUmVzb2x2ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIF90aGlzLl9yZXNvbHZlKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoaXNSZXNvbHZlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNSZXNvbHZlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgX3RoaXMuX3JlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIF90aGlzLl9ub3RpZnkodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzUmVzb2x2ZWQgfHwgdGhpcy5fcmVqZWN0KGUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX2Z1bGZpbGwodmFsKTtcbiAgICB9LFxuXG4gICAgX2Z1bGZpbGwgOiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgaWYodGhpcy5fc3RhdHVzID4gUFJPTUlTRV9TVEFUVVMuUkVTT0xWRUQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3N0YXR1cyA9IFBST01JU0VfU1RBVFVTLkZVTEZJTExFRDtcbiAgICAgICAgdGhpcy5fdmFsdWUgPSB2YWw7XG5cbiAgICAgICAgdGhpcy5fY2FsbENhbGxiYWNrcyh0aGlzLl9mdWxmaWxsZWRDYWxsYmFja3MsIHZhbCk7XG4gICAgICAgIHRoaXMuX2Z1bGZpbGxlZENhbGxiYWNrcyA9IHRoaXMuX3JlamVjdGVkQ2FsbGJhY2tzID0gdGhpcy5fcHJvZ3Jlc3NDYWxsYmFja3MgPSB1bmRlZjtcbiAgICB9LFxuXG4gICAgX3JlamVjdCA6IGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICBpZih0aGlzLl9zdGF0dXMgPiBQUk9NSVNFX1NUQVRVUy5SRVNPTFZFRCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fc3RhdHVzID0gUFJPTUlTRV9TVEFUVVMuUkVKRUNURUQ7XG4gICAgICAgIHRoaXMuX3ZhbHVlID0gcmVhc29uO1xuXG4gICAgICAgIHRoaXMuX2NhbGxDYWxsYmFja3ModGhpcy5fcmVqZWN0ZWRDYWxsYmFja3MsIHJlYXNvbik7XG4gICAgICAgIHRoaXMuX2Z1bGZpbGxlZENhbGxiYWNrcyA9IHRoaXMuX3JlamVjdGVkQ2FsbGJhY2tzID0gdGhpcy5fcHJvZ3Jlc3NDYWxsYmFja3MgPSB1bmRlZjtcbiAgICB9LFxuXG4gICAgX25vdGlmeSA6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICB0aGlzLl9jYWxsQ2FsbGJhY2tzKHRoaXMuX3Byb2dyZXNzQ2FsbGJhY2tzLCB2YWwpO1xuICAgIH0sXG5cbiAgICBfYWRkQ2FsbGJhY2tzIDogZnVuY3Rpb24oZGVmZXIsIG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBvblByb2dyZXNzLCBjdHgpIHtcbiAgICAgICAgaWYob25SZWplY3RlZCAmJiAhaXNGdW5jdGlvbihvblJlamVjdGVkKSkge1xuICAgICAgICAgICAgY3R4ID0gb25SZWplY3RlZDtcbiAgICAgICAgICAgIG9uUmVqZWN0ZWQgPSB1bmRlZjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmKG9uUHJvZ3Jlc3MgJiYgIWlzRnVuY3Rpb24ob25Qcm9ncmVzcykpIHtcbiAgICAgICAgICAgIGN0eCA9IG9uUHJvZ3Jlc3M7XG4gICAgICAgICAgICBvblByb2dyZXNzID0gdW5kZWY7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2I7XG5cbiAgICAgICAgaWYoIXRoaXMuaXNSZWplY3RlZCgpKSB7XG4gICAgICAgICAgICBjYiA9IHsgZGVmZXIgOiBkZWZlciwgZm4gOiBpc0Z1bmN0aW9uKG9uRnVsZmlsbGVkKT8gb25GdWxmaWxsZWQgOiB1bmRlZiwgY3R4IDogY3R4IH07XG4gICAgICAgICAgICB0aGlzLmlzRnVsZmlsbGVkKCk/XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FsbENhbGxiYWNrcyhbY2JdLCB0aGlzLl92YWx1ZSkgOlxuICAgICAgICAgICAgICAgIHRoaXMuX2Z1bGZpbGxlZENhbGxiYWNrcy5wdXNoKGNiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCF0aGlzLmlzRnVsZmlsbGVkKCkpIHtcbiAgICAgICAgICAgIGNiID0geyBkZWZlciA6IGRlZmVyLCBmbiA6IG9uUmVqZWN0ZWQsIGN0eCA6IGN0eCB9O1xuICAgICAgICAgICAgdGhpcy5pc1JlamVjdGVkKCk/XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FsbENhbGxiYWNrcyhbY2JdLCB0aGlzLl92YWx1ZSkgOlxuICAgICAgICAgICAgICAgIHRoaXMuX3JlamVjdGVkQ2FsbGJhY2tzLnB1c2goY2IpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYodGhpcy5fc3RhdHVzIDw9IFBST01JU0VfU1RBVFVTLlJFU09MVkVEKSB7XG4gICAgICAgICAgICB0aGlzLl9wcm9ncmVzc0NhbGxiYWNrcy5wdXNoKHsgZGVmZXIgOiBkZWZlciwgZm4gOiBvblByb2dyZXNzLCBjdHggOiBjdHggfSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgX2NhbGxDYWxsYmFja3MgOiBmdW5jdGlvbihjYWxsYmFja3MsIGFyZykge1xuICAgICAgICB2YXIgbGVuID0gY2FsbGJhY2tzLmxlbmd0aDtcbiAgICAgICAgaWYoIWxlbikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGlzUmVzb2x2ZWQgPSB0aGlzLmlzUmVzb2x2ZWQoKSxcbiAgICAgICAgICAgIGlzRnVsZmlsbGVkID0gdGhpcy5pc0Z1bGZpbGxlZCgpO1xuXG4gICAgICAgIG5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGkgPSAwLCBjYiwgZGVmZXIsIGZuO1xuICAgICAgICAgICAgd2hpbGUoaSA8IGxlbikge1xuICAgICAgICAgICAgICAgIGNiID0gY2FsbGJhY2tzW2krK107XG4gICAgICAgICAgICAgICAgZGVmZXIgPSBjYi5kZWZlcjtcbiAgICAgICAgICAgICAgICBmbiA9IGNiLmZuO1xuXG4gICAgICAgICAgICAgICAgaWYoZm4pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN0eCA9IGNiLmN0eCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcztcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcyA9IGN0eD8gZm4uY2FsbChjdHgsIGFyZykgOiBmbihhcmcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVyLnJlamVjdChlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaXNSZXNvbHZlZD9cbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVyLnJlc29sdmUocmVzKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlci5ub3RpZnkocmVzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlzUmVzb2x2ZWQ/XG4gICAgICAgICAgICAgICAgICAgICAgICBpc0Z1bGZpbGxlZD9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlci5yZXNvbHZlKGFyZykgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVyLnJlamVjdChhcmcpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVyLm5vdGlmeShhcmcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufTtcblxuLyoqIEBsZW5kcyBQcm9taXNlICovXG52YXIgc3RhdGljTWV0aG9kcyA9IHtcbiAgICAvKipcbiAgICAgKiBDb2VyY2VzIHRoZSBnaXZlbiBgdmFsdWVgIHRvIGEgcHJvbWlzZSwgb3IgcmV0dXJucyB0aGUgYHZhbHVlYCBpZiBpdCdzIGFscmVhZHkgYSBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBjYXN0IDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZvdy5jYXN0KHZhbHVlKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UsIHRoYXQgd2lsbCBiZSBmdWxmaWxsZWQgb25seSBhZnRlciBhbGwgdGhlIGl0ZW1zIGluIGBpdGVyYWJsZWAgYXJlIGZ1bGZpbGxlZC5cbiAgICAgKiBJZiBhbnkgb2YgdGhlIGBpdGVyYWJsZWAgaXRlbXMgZ2V0cyByZWplY3RlZCwgdGhlbiB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheXxPYmplY3R9IGl0ZXJhYmxlXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIGFsbCA6IGZ1bmN0aW9uKGl0ZXJhYmxlKSB7XG4gICAgICAgIHJldHVybiB2b3cuYWxsKGl0ZXJhYmxlKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UsIHRoYXQgd2lsbCBiZSBmdWxmaWxsZWQgb25seSB3aGVuIGFueSBvZiB0aGUgaXRlbXMgaW4gYGl0ZXJhYmxlYCBhcmUgZnVsZmlsbGVkLlxuICAgICAqIElmIGFueSBvZiB0aGUgYGl0ZXJhYmxlYCBpdGVtcyBnZXRzIHJlamVjdGVkLCB0aGVuIHRoZSByZXR1cm5lZCBwcm9taXNlIHdpbGwgYmUgcmVqZWN0ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBpdGVyYWJsZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICByYWNlIDogZnVuY3Rpb24oaXRlcmFibGUpIHtcbiAgICAgICAgcmV0dXJuIHZvdy5hbnlSZXNvbHZlZChpdGVyYWJsZSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgaGFzIGFscmVhZHkgYmVlbiByZXNvbHZlZCB3aXRoIHRoZSBnaXZlbiBgdmFsdWVgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgYSBwcm9taXNlLCB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGhhdmUgYHZhbHVlYCdzIHN0YXRlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICByZXNvbHZlIDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZvdy5yZXNvbHZlKHZhbHVlKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIHJlamVjdGVkIHdpdGggdGhlIGdpdmVuIGByZWFzb25gLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSByZWFzb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgcmVqZWN0IDogZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIHJldHVybiB2b3cucmVqZWN0KHJlYXNvbik7XG4gICAgfVxufTtcblxuZm9yKHZhciBwcm9wIGluIHN0YXRpY01ldGhvZHMpIHtcbiAgICBzdGF0aWNNZXRob2RzLmhhc093blByb3BlcnR5KHByb3ApICYmXG4gICAgICAgIChQcm9taXNlW3Byb3BdID0gc3RhdGljTWV0aG9kc1twcm9wXSk7XG59XG5cbnZhciB2b3cgPSAvKiogQGV4cG9ydHMgdm93ICovIHtcbiAgICBEZWZlcnJlZCA6IERlZmVycmVkLFxuXG4gICAgUHJvbWlzZSA6IFByb21pc2UsXG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IGRlZmVycmVkLiBUaGlzIG1ldGhvZCBpcyBhIGZhY3RvcnkgbWV0aG9kIGZvciBgdm93OkRlZmVycmVkYCBjbGFzcy5cbiAgICAgKiBJdCdzIGVxdWl2YWxlbnQgdG8gYG5ldyB2b3cuRGVmZXJyZWQoKWAuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7dm93OkRlZmVycmVkfVxuICAgICAqL1xuICAgIGRlZmVyIDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBuZXcgRGVmZXJyZWQoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU3RhdGljIGVxdWl2YWxlbnQgdG8gYHByb21pc2UudGhlbmAuXG4gICAgICogSWYgYHZhbHVlYCBpcyBub3QgYSBwcm9taXNlLCB0aGVuIGB2YWx1ZWAgaXMgdHJlYXRlZCBhcyBhIGZ1bGZpbGxlZCBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvbkZ1bGZpbGxlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIGZ1bGZpbGxlZFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblJlamVjdGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgcmVhc29uIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlamVjdGVkXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uUHJvZ3Jlc3NdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCB2YWx1ZSBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiBub3RpZmllZFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY3R4XSBDb250ZXh0IG9mIHRoZSBjYWxsYmFja3MgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIHdoZW4gOiBmdW5jdGlvbih2YWx1ZSwgb25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MsIGN0eCkge1xuICAgICAgICByZXR1cm4gdm93LmNhc3QodmFsdWUpLnRoZW4ob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MsIGN0eCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLmZhaWxgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGVkIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCByZWFzb24gYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2sgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIGZhaWwgOiBmdW5jdGlvbih2YWx1ZSwgb25SZWplY3RlZCwgY3R4KSB7XG4gICAgICAgIHJldHVybiB2b3cud2hlbih2YWx1ZSwgdW5kZWYsIG9uUmVqZWN0ZWQsIGN0eCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLmFsd2F5c2AuXG4gICAgICogSWYgYHZhbHVlYCBpcyBub3QgYSBwcm9taXNlLCB0aGVuIGB2YWx1ZWAgaXMgdHJlYXRlZCBhcyBhIGZ1bGZpbGxlZCBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVzb2x2ZWQgQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCB0aGUgcHJvbWlzZSBhcyBhbiBhcmd1bWVudCwgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVzb2x2ZWQuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrIGV4ZWN1dGlvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBhbHdheXMgOiBmdW5jdGlvbih2YWx1ZSwgb25SZXNvbHZlZCwgY3R4KSB7XG4gICAgICAgIHJldHVybiB2b3cud2hlbih2YWx1ZSkuYWx3YXlzKG9uUmVzb2x2ZWQsIGN0eCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLnByb2dyZXNzYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gb25Qcm9ncmVzcyBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gbm90aWZpZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2sgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIHByb2dyZXNzIDogZnVuY3Rpb24odmFsdWUsIG9uUHJvZ3Jlc3MsIGN0eCkge1xuICAgICAgICByZXR1cm4gdm93LndoZW4odmFsdWUpLnByb2dyZXNzKG9uUHJvZ3Jlc3MsIGN0eCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLnNwcmVhZGAuXG4gICAgICogSWYgYHZhbHVlYCBpcyBub3QgYSBwcm9taXNlLCB0aGVuIGB2YWx1ZWAgaXMgdHJlYXRlZCBhcyBhIGZ1bGZpbGxlZCBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvbkZ1bGZpbGxlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIGZ1bGZpbGxlZFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblJlamVjdGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgcmVhc29uIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlamVjdGVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrcyBleGVjdXRpb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgc3ByZWFkIDogZnVuY3Rpb24odmFsdWUsIG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBjdHgpIHtcbiAgICAgICAgcmV0dXJuIHZvdy53aGVuKHZhbHVlKS5zcHJlYWQob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIGN0eCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLmRvbmVgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25GdWxmaWxsZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCB2YWx1ZSBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiBmdWxmaWxsZWRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25SZWplY3RlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHJlYXNvbiBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiByZWplY3RlZFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblByb2dyZXNzXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gbm90aWZpZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2tzIGV4ZWN1dGlvblxuICAgICAqL1xuICAgIGRvbmUgOiBmdW5jdGlvbih2YWx1ZSwgb25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MsIGN0eCkge1xuICAgICAgICB2b3cud2hlbih2YWx1ZSkuZG9uZShvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Qcm9ncmVzcywgY3R4KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIGB2YWx1ZWAgaXMgYSBwcm9taXNlLWxpa2Ugb2JqZWN0XG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGBgYGpzXG4gICAgICogdm93LmlzUHJvbWlzZSgnc29tZXRoaW5nJyk7IC8vIHJldHVybnMgZmFsc2VcbiAgICAgKiB2b3cuaXNQcm9taXNlKHZvdy5kZWZlcigpLnByb21pc2UoKSk7IC8vIHJldHVybnMgdHJ1ZVxuICAgICAqIHZvdy5pc1Byb21pc2UoeyB0aGVuIDogZnVuY3Rpb24oKSB7IH0pOyAvLyByZXR1cm5zIHRydWVcbiAgICAgKiBgYGBcbiAgICAgKi9cbiAgICBpc1Byb21pc2UgOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gaXNPYmplY3QodmFsdWUpICYmIGlzRnVuY3Rpb24odmFsdWUudGhlbik7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENvZXJjZXMgdGhlIGdpdmVuIGB2YWx1ZWAgdG8gYSBwcm9taXNlLCBvciByZXR1cm5zIHRoZSBgdmFsdWVgIGlmIGl0J3MgYWxyZWFkeSBhIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIGNhc3QgOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWUgJiYgISF2YWx1ZS5fdm93P1xuICAgICAgICAgICAgdmFsdWUgOlxuICAgICAgICAgICAgdm93LnJlc29sdmUodmFsdWUpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS52YWx1ZU9mYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHJldHVybnMgeyp9XG4gICAgICovXG4gICAgdmFsdWVPZiA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZSAmJiBpc0Z1bmN0aW9uKHZhbHVlLnZhbHVlT2YpPyB2YWx1ZS52YWx1ZU9mKCkgOiB2YWx1ZTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU3RhdGljIGVxdWl2YWxlbnQgdG8gYHByb21pc2UuaXNGdWxmaWxsZWRgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBpc0Z1bGZpbGxlZCA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZSAmJiBpc0Z1bmN0aW9uKHZhbHVlLmlzRnVsZmlsbGVkKT8gdmFsdWUuaXNGdWxmaWxsZWQoKSA6IHRydWU7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLmlzUmVqZWN0ZWRgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBpc1JlamVjdGVkIDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlICYmIGlzRnVuY3Rpb24odmFsdWUuaXNSZWplY3RlZCk/IHZhbHVlLmlzUmVqZWN0ZWQoKSA6IGZhbHNlO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS5pc1Jlc29sdmVkYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgaXNSZXNvbHZlZCA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZSAmJiBpc0Z1bmN0aW9uKHZhbHVlLmlzUmVzb2x2ZWQpPyB2YWx1ZS5pc1Jlc29sdmVkKCkgOiB0cnVlO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gcmVzb2x2ZWQgd2l0aCB0aGUgZ2l2ZW4gYHZhbHVlYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIGEgcHJvbWlzZSwgdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBoYXZlIGB2YWx1ZWAncyBzdGF0ZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgcmVzb2x2ZSA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHZhciByZXMgPSB2b3cuZGVmZXIoKTtcbiAgICAgICAgcmVzLnJlc29sdmUodmFsdWUpO1xuICAgICAgICByZXR1cm4gcmVzLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGZ1bGZpbGxlZCB3aXRoIHRoZSBnaXZlbiBgdmFsdWVgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgYSBwcm9taXNlLCB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIGZ1bGZpbGxlZCB3aXRoIHRoZSBmdWxmaWxsL3JlamVjdGlvbiB2YWx1ZSBvZiBgdmFsdWVgLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBmdWxmaWxsIDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gdm93LmRlZmVyKCksXG4gICAgICAgICAgICBwcm9taXNlID0gZGVmZXIucHJvbWlzZSgpO1xuXG4gICAgICAgIGRlZmVyLnJlc29sdmUodmFsdWUpO1xuXG4gICAgICAgIHJldHVybiBwcm9taXNlLmlzRnVsZmlsbGVkKCk/XG4gICAgICAgICAgICBwcm9taXNlIDpcbiAgICAgICAgICAgIHByb21pc2UudGhlbihudWxsLCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVhc29uO1xuICAgICAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgaGFzIGFscmVhZHkgYmVlbiByZWplY3RlZCB3aXRoIHRoZSBnaXZlbiBgcmVhc29uYC5cbiAgICAgKiBJZiBgcmVhc29uYCBpcyBhIHByb21pc2UsIHRoZSByZXR1cm5lZCBwcm9taXNlIHdpbGwgYmUgcmVqZWN0ZWQgd2l0aCB0aGUgZnVsZmlsbC9yZWplY3Rpb24gdmFsdWUgb2YgYHJlYXNvbmAuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHJlYXNvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICByZWplY3QgOiBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgdmFyIGRlZmVyID0gdm93LmRlZmVyKCk7XG4gICAgICAgIGRlZmVyLnJlamVjdChyZWFzb24pO1xuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZSgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBJbnZva2VzIHRoZSBnaXZlbiBmdW5jdGlvbiBgZm5gIHdpdGggYXJndW1lbnRzIGBhcmdzYFxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAgICAgKiBAcGFyYW0gey4uLip9IFthcmdzXVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYGBganNcbiAgICAgKiB2YXIgcHJvbWlzZTEgPSB2b3cuaW52b2tlKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICogICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICogICAgIH0sICdvaycpLFxuICAgICAqICAgICBwcm9taXNlMiA9IHZvdy5pbnZva2UoZnVuY3Rpb24oKSB7XG4gICAgICogICAgICAgICB0aHJvdyBFcnJvcigpO1xuICAgICAqICAgICB9KTtcbiAgICAgKlxuICAgICAqIHByb21pc2UxLmlzRnVsZmlsbGVkKCk7IC8vIHRydWVcbiAgICAgKiBwcm9taXNlMS52YWx1ZU9mKCk7IC8vICdvaydcbiAgICAgKiBwcm9taXNlMi5pc1JlamVjdGVkKCk7IC8vIHRydWVcbiAgICAgKiBwcm9taXNlMi52YWx1ZU9mKCk7IC8vIGluc3RhbmNlIG9mIEVycm9yXG4gICAgICogYGBgXG4gICAgICovXG4gICAgaW52b2tlIDogZnVuY3Rpb24oZm4sIGFyZ3MpIHtcbiAgICAgICAgdmFyIGxlbiA9IE1hdGgubWF4KGFyZ3VtZW50cy5sZW5ndGggLSAxLCAwKSxcbiAgICAgICAgICAgIGNhbGxBcmdzO1xuICAgICAgICBpZihsZW4pIHsgLy8gb3B0aW1pemF0aW9uIGZvciBWOFxuICAgICAgICAgICAgY2FsbEFyZ3MgPSBBcnJheShsZW4pO1xuICAgICAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICAgICAgd2hpbGUoaSA8IGxlbikge1xuICAgICAgICAgICAgICAgIGNhbGxBcmdzW2krK10gPSBhcmd1bWVudHNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIHZvdy5yZXNvbHZlKGNhbGxBcmdzP1xuICAgICAgICAgICAgICAgIGZuLmFwcGx5KGdsb2JhbCwgY2FsbEFyZ3MpIDpcbiAgICAgICAgICAgICAgICBmbi5jYWxsKGdsb2JhbCkpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoKGUpIHtcbiAgICAgICAgICAgIHJldHVybiB2b3cucmVqZWN0KGUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlLCB0aGF0IHdpbGwgYmUgZnVsZmlsbGVkIG9ubHkgYWZ0ZXIgYWxsIHRoZSBpdGVtcyBpbiBgaXRlcmFibGVgIGFyZSBmdWxmaWxsZWQuXG4gICAgICogSWYgYW55IG9mIHRoZSBgaXRlcmFibGVgIGl0ZW1zIGdldHMgcmVqZWN0ZWQsIHRoZSBwcm9taXNlIHdpbGwgYmUgcmVqZWN0ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fE9iamVjdH0gaXRlcmFibGVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIHdpdGggYXJyYXk6XG4gICAgICogYGBganNcbiAgICAgKiB2YXIgZGVmZXIxID0gdm93LmRlZmVyKCksXG4gICAgICogICAgIGRlZmVyMiA9IHZvdy5kZWZlcigpO1xuICAgICAqXG4gICAgICogdm93LmFsbChbZGVmZXIxLnByb21pc2UoKSwgZGVmZXIyLnByb21pc2UoKSwgM10pXG4gICAgICogICAgIC50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICogICAgICAgICAgLy8gdmFsdWUgaXMgXCJbMSwgMiwgM11cIiBoZXJlXG4gICAgICogICAgIH0pO1xuICAgICAqXG4gICAgICogZGVmZXIxLnJlc29sdmUoMSk7XG4gICAgICogZGVmZXIyLnJlc29sdmUoMik7XG4gICAgICogYGBgXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIHdpdGggb2JqZWN0OlxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIGRlZmVyMSA9IHZvdy5kZWZlcigpLFxuICAgICAqICAgICBkZWZlcjIgPSB2b3cuZGVmZXIoKTtcbiAgICAgKlxuICAgICAqIHZvdy5hbGwoeyBwMSA6IGRlZmVyMS5wcm9taXNlKCksIHAyIDogZGVmZXIyLnByb21pc2UoKSwgcDMgOiAzIH0pXG4gICAgICogICAgIC50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICogICAgICAgICAgLy8gdmFsdWUgaXMgXCJ7IHAxIDogMSwgcDIgOiAyLCBwMyA6IDMgfVwiIGhlcmVcbiAgICAgKiAgICAgfSk7XG4gICAgICpcbiAgICAgKiBkZWZlcjEucmVzb2x2ZSgxKTtcbiAgICAgKiBkZWZlcjIucmVzb2x2ZSgyKTtcbiAgICAgKiBgYGBcbiAgICAgKi9cbiAgICBhbGwgOiBmdW5jdGlvbihpdGVyYWJsZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSBuZXcgRGVmZXJyZWQoKSxcbiAgICAgICAgICAgIGlzUHJvbWlzZXNBcnJheSA9IGlzQXJyYXkoaXRlcmFibGUpLFxuICAgICAgICAgICAga2V5cyA9IGlzUHJvbWlzZXNBcnJheT9cbiAgICAgICAgICAgICAgICBnZXRBcnJheUtleXMoaXRlcmFibGUpIDpcbiAgICAgICAgICAgICAgICBnZXRPYmplY3RLZXlzKGl0ZXJhYmxlKSxcbiAgICAgICAgICAgIGxlbiA9IGtleXMubGVuZ3RoLFxuICAgICAgICAgICAgcmVzID0gaXNQcm9taXNlc0FycmF5PyBbXSA6IHt9O1xuXG4gICAgICAgIGlmKCFsZW4pIHtcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUocmVzKTtcbiAgICAgICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IGxlbjtcbiAgICAgICAgdm93Ll9mb3JFYWNoKFxuICAgICAgICAgICAgaXRlcmFibGUsXG4gICAgICAgICAgICBmdW5jdGlvbih2YWx1ZSwgaWR4KSB7XG4gICAgICAgICAgICAgICAgcmVzW2tleXNbaWR4XV0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBpZighLS1pKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZmVyLnJlc29sdmUocmVzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZGVmZXIucmVqZWN0LFxuICAgICAgICAgICAgZGVmZXIubm90aWZ5LFxuICAgICAgICAgICAgZGVmZXIsXG4gICAgICAgICAgICBrZXlzKTtcblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZSgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgcHJvbWlzZSwgdGhhdCB3aWxsIGJlIGZ1bGZpbGxlZCBvbmx5IGFmdGVyIGFsbCB0aGUgaXRlbXMgaW4gYGl0ZXJhYmxlYCBhcmUgcmVzb2x2ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fE9iamVjdH0gaXRlcmFibGVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIGRlZmVyMSA9IHZvdy5kZWZlcigpLFxuICAgICAqICAgICBkZWZlcjIgPSB2b3cuZGVmZXIoKTtcbiAgICAgKlxuICAgICAqIHZvdy5hbGxSZXNvbHZlZChbZGVmZXIxLnByb21pc2UoKSwgZGVmZXIyLnByb21pc2UoKV0pLnNwcmVhZChmdW5jdGlvbihwcm9taXNlMSwgcHJvbWlzZTIpIHtcbiAgICAgKiAgICAgcHJvbWlzZTEuaXNSZWplY3RlZCgpOyAvLyByZXR1cm5zIHRydWVcbiAgICAgKiAgICAgcHJvbWlzZTEudmFsdWVPZigpOyAvLyByZXR1cm5zIFwiJ2Vycm9yJ1wiXG4gICAgICogICAgIHByb21pc2UyLmlzRnVsZmlsbGVkKCk7IC8vIHJldHVybnMgdHJ1ZVxuICAgICAqICAgICBwcm9taXNlMi52YWx1ZU9mKCk7IC8vIHJldHVybnMgXCInb2snXCJcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIGRlZmVyMS5yZWplY3QoJ2Vycm9yJyk7XG4gICAgICogZGVmZXIyLnJlc29sdmUoJ29rJyk7XG4gICAgICogYGBgXG4gICAgICovXG4gICAgYWxsUmVzb2x2ZWQgOiBmdW5jdGlvbihpdGVyYWJsZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSBuZXcgRGVmZXJyZWQoKSxcbiAgICAgICAgICAgIGlzUHJvbWlzZXNBcnJheSA9IGlzQXJyYXkoaXRlcmFibGUpLFxuICAgICAgICAgICAga2V5cyA9IGlzUHJvbWlzZXNBcnJheT9cbiAgICAgICAgICAgICAgICBnZXRBcnJheUtleXMoaXRlcmFibGUpIDpcbiAgICAgICAgICAgICAgICBnZXRPYmplY3RLZXlzKGl0ZXJhYmxlKSxcbiAgICAgICAgICAgIGkgPSBrZXlzLmxlbmd0aCxcbiAgICAgICAgICAgIHJlcyA9IGlzUHJvbWlzZXNBcnJheT8gW10gOiB7fTtcblxuICAgICAgICBpZighaSkge1xuICAgICAgICAgICAgZGVmZXIucmVzb2x2ZShyZXMpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvblJlc29sdmVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgLS1pIHx8IGRlZmVyLnJlc29sdmUoaXRlcmFibGUpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICB2b3cuX2ZvckVhY2goXG4gICAgICAgICAgICBpdGVyYWJsZSxcbiAgICAgICAgICAgIG9uUmVzb2x2ZWQsXG4gICAgICAgICAgICBvblJlc29sdmVkLFxuICAgICAgICAgICAgZGVmZXIubm90aWZ5LFxuICAgICAgICAgICAgZGVmZXIsXG4gICAgICAgICAgICBrZXlzKTtcblxuICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZSgpO1xuICAgIH0sXG5cbiAgICBhbGxQYXRpZW50bHkgOiBmdW5jdGlvbihpdGVyYWJsZSkge1xuICAgICAgICByZXR1cm4gdm93LmFsbFJlc29sdmVkKGl0ZXJhYmxlKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGlzUHJvbWlzZXNBcnJheSA9IGlzQXJyYXkoaXRlcmFibGUpLFxuICAgICAgICAgICAgICAgIGtleXMgPSBpc1Byb21pc2VzQXJyYXk/XG4gICAgICAgICAgICAgICAgICAgIGdldEFycmF5S2V5cyhpdGVyYWJsZSkgOlxuICAgICAgICAgICAgICAgICAgICBnZXRPYmplY3RLZXlzKGl0ZXJhYmxlKSxcbiAgICAgICAgICAgICAgICByZWplY3RlZFByb21pc2VzLCBmdWxmaWxsZWRQcm9taXNlcyxcbiAgICAgICAgICAgICAgICBsZW4gPSBrZXlzLmxlbmd0aCwgaSA9IDAsIGtleSwgcHJvbWlzZTtcblxuICAgICAgICAgICAgaWYoIWxlbikge1xuICAgICAgICAgICAgICAgIHJldHVybiBpc1Byb21pc2VzQXJyYXk/IFtdIDoge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdoaWxlKGkgPCBsZW4pIHtcbiAgICAgICAgICAgICAgICBrZXkgPSBrZXlzW2krK107XG4gICAgICAgICAgICAgICAgcHJvbWlzZSA9IGl0ZXJhYmxlW2tleV07XG4gICAgICAgICAgICAgICAgaWYodm93LmlzUmVqZWN0ZWQocHJvbWlzZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0ZWRQcm9taXNlcyB8fCAocmVqZWN0ZWRQcm9taXNlcyA9IGlzUHJvbWlzZXNBcnJheT8gW10gOiB7fSk7XG4gICAgICAgICAgICAgICAgICAgIGlzUHJvbWlzZXNBcnJheT9cbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdGVkUHJvbWlzZXMucHVzaChwcm9taXNlLnZhbHVlT2YoKSkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0ZWRQcm9taXNlc1trZXldID0gcHJvbWlzZS52YWx1ZU9mKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYoIXJlamVjdGVkUHJvbWlzZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgKGZ1bGZpbGxlZFByb21pc2VzIHx8IChmdWxmaWxsZWRQcm9taXNlcyA9IGlzUHJvbWlzZXNBcnJheT8gW10gOiB7fSkpW2tleV0gPSB2b3cudmFsdWVPZihwcm9taXNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKHJlamVjdGVkUHJvbWlzZXMpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyByZWplY3RlZFByb21pc2VzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZnVsZmlsbGVkUHJvbWlzZXM7XG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgcHJvbWlzZSwgdGhhdCB3aWxsIGJlIGZ1bGZpbGxlZCBpZiBhbnkgb2YgdGhlIGl0ZW1zIGluIGBpdGVyYWJsZWAgaXMgZnVsZmlsbGVkLlxuICAgICAqIElmIGFsbCBvZiB0aGUgYGl0ZXJhYmxlYCBpdGVtcyBnZXQgcmVqZWN0ZWQsIHRoZSBwcm9taXNlIHdpbGwgYmUgcmVqZWN0ZWQgKHdpdGggdGhlIHJlYXNvbiBvZiB0aGUgZmlyc3QgcmVqZWN0ZWQgaXRlbSkuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBpdGVyYWJsZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBhbnkgOiBmdW5jdGlvbihpdGVyYWJsZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSBuZXcgRGVmZXJyZWQoKSxcbiAgICAgICAgICAgIGxlbiA9IGl0ZXJhYmxlLmxlbmd0aDtcblxuICAgICAgICBpZighbGVuKSB7XG4gICAgICAgICAgICBkZWZlci5yZWplY3QoRXJyb3IoKSk7XG4gICAgICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSAwLCByZWFzb247XG4gICAgICAgIHZvdy5fZm9yRWFjaChcbiAgICAgICAgICAgIGl0ZXJhYmxlLFxuICAgICAgICAgICAgZGVmZXIucmVzb2x2ZSxcbiAgICAgICAgICAgIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBpIHx8IChyZWFzb24gPSBlKTtcbiAgICAgICAgICAgICAgICArK2kgPT09IGxlbiAmJiBkZWZlci5yZWplY3QocmVhc29uKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWZlci5ub3RpZnksXG4gICAgICAgICAgICBkZWZlcik7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UsIHRoYXQgd2lsbCBiZSBmdWxmaWxsZWQgb25seSB3aGVuIGFueSBvZiB0aGUgaXRlbXMgaW4gYGl0ZXJhYmxlYCBpcyBmdWxmaWxsZWQuXG4gICAgICogSWYgYW55IG9mIHRoZSBgaXRlcmFibGVgIGl0ZW1zIGdldHMgcmVqZWN0ZWQsIHRoZSBwcm9taXNlIHdpbGwgYmUgcmVqZWN0ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBpdGVyYWJsZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBhbnlSZXNvbHZlZCA6IGZ1bmN0aW9uKGl0ZXJhYmxlKSB7XG4gICAgICAgIHZhciBkZWZlciA9IG5ldyBEZWZlcnJlZCgpLFxuICAgICAgICAgICAgbGVuID0gaXRlcmFibGUubGVuZ3RoO1xuXG4gICAgICAgIGlmKCFsZW4pIHtcbiAgICAgICAgICAgIGRlZmVyLnJlamVjdChFcnJvcigpKTtcbiAgICAgICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2b3cuX2ZvckVhY2goXG4gICAgICAgICAgICBpdGVyYWJsZSxcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUsXG4gICAgICAgICAgICBkZWZlci5yZWplY3QsXG4gICAgICAgICAgICBkZWZlci5ub3RpZnksXG4gICAgICAgICAgICBkZWZlcik7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU3RhdGljIGVxdWl2YWxlbnQgdG8gYHByb21pc2UuZGVsYXlgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZGVsYXlcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgZGVsYXkgOiBmdW5jdGlvbih2YWx1ZSwgZGVsYXkpIHtcbiAgICAgICAgcmV0dXJuIHZvdy5yZXNvbHZlKHZhbHVlKS5kZWxheShkZWxheSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLnRpbWVvdXRgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZW91dFxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICB0aW1lb3V0IDogZnVuY3Rpb24odmFsdWUsIHRpbWVvdXQpIHtcbiAgICAgICAgcmV0dXJuIHZvdy5yZXNvbHZlKHZhbHVlKS50aW1lb3V0KHRpbWVvdXQpO1xuICAgIH0sXG5cbiAgICBfZm9yRWFjaCA6IGZ1bmN0aW9uKHByb21pc2VzLCBvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Qcm9ncmVzcywgY3R4LCBrZXlzKSB7XG4gICAgICAgIHZhciBsZW4gPSBrZXlzPyBrZXlzLmxlbmd0aCA6IHByb21pc2VzLmxlbmd0aCxcbiAgICAgICAgICAgIGkgPSAwO1xuXG4gICAgICAgIHdoaWxlKGkgPCBsZW4pIHtcbiAgICAgICAgICAgIHZvdy53aGVuKFxuICAgICAgICAgICAgICAgIHByb21pc2VzW2tleXM/IGtleXNbaV0gOiBpXSxcbiAgICAgICAgICAgICAgICB3cmFwT25GdWxmaWxsZWQob25GdWxmaWxsZWQsIGkpLFxuICAgICAgICAgICAgICAgIG9uUmVqZWN0ZWQsXG4gICAgICAgICAgICAgICAgb25Qcm9ncmVzcyxcbiAgICAgICAgICAgICAgICBjdHgpO1xuICAgICAgICAgICAgKytpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIFRpbWVkT3V0RXJyb3IgOiBkZWZpbmVDdXN0b21FcnJvclR5cGUoJ1RpbWVkT3V0Jylcbn07XG5cbnZhciBkZWZpbmVBc0dsb2JhbCA9IHRydWU7XG5pZih0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB2b3c7XG4gICAgZGVmaW5lQXNHbG9iYWwgPSBmYWxzZTtcbn1cblxuaWYodHlwZW9mIG1vZHVsZXMgPT09ICdvYmplY3QnICYmIGlzRnVuY3Rpb24obW9kdWxlcy5kZWZpbmUpKSB7XG4gICAgbW9kdWxlcy5kZWZpbmUoJ3ZvdycsIGZ1bmN0aW9uKHByb3ZpZGUpIHtcbiAgICAgICAgcHJvdmlkZSh2b3cpO1xuICAgIH0pO1xuICAgIGRlZmluZUFzR2xvYmFsID0gZmFsc2U7XG59XG5cbmlmKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICBkZWZpbmUoZnVuY3Rpb24ocmVxdWlyZSwgZXhwb3J0cywgbW9kdWxlKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gdm93O1xuICAgIH0pO1xuICAgIGRlZmluZUFzR2xvYmFsID0gZmFsc2U7XG59XG5cbmRlZmluZUFzR2xvYmFsICYmIChnbG9iYWwudm93ID0gdm93KTtcblxufSkodGhpcyk7XG4iLCIvKipcbiAqIE1vZHVsZXNcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMgRmlsYXRvdiBEbWl0cnkgKGRmaWxhdG92QHlhbmRleC10ZWFtLnJ1KVxuICogRHVhbCBsaWNlbnNlZCB1bmRlciB0aGUgTUlUIGFuZCBHUEwgbGljZW5zZXM6XG4gKiBodHRwOi8vd3d3Lm9wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlLnBocFxuICogaHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzL2dwbC5odG1sXG4gKlxuICogQHZlcnNpb24gMC4xLjJcbiAqL1xuXG4oZnVuY3Rpb24oZ2xvYmFsKSB7XG5cbnZhciB1bmRlZixcblxuICAgIERFQ0xfU1RBVEVTID0ge1xuICAgICAgICBOT1RfUkVTT0xWRUQgOiAnTk9UX1JFU09MVkVEJyxcbiAgICAgICAgSU5fUkVTT0xWSU5HIDogJ0lOX1JFU09MVklORycsXG4gICAgICAgIFJFU09MVkVEICAgICA6ICdSRVNPTFZFRCdcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBpbnN0YW5jZSBvZiBtb2R1bGFyIHN5c3RlbVxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgICovXG4gICAgY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjdXJPcHRpb25zID0ge1xuICAgICAgICAgICAgICAgIHRyYWNrQ2lyY3VsYXJEZXBlbmRlbmNpZXMgOiB0cnVlLFxuICAgICAgICAgICAgICAgIGFsbG93TXVsdGlwbGVEZWNsYXJhdGlvbnMgOiB0cnVlXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBtb2R1bGVzU3RvcmFnZSA9IHt9LFxuICAgICAgICAgICAgd2FpdEZvck5leHRUaWNrID0gZmFsc2UsXG4gICAgICAgICAgICBwZW5kaW5nUmVxdWlyZXMgPSBbXSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBEZWZpbmVzIG1vZHVsZVxuICAgICAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICAgICAgICAgICAqIEBwYXJhbSB7U3RyaW5nW119IFtkZXBzXVxuICAgICAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gZGVjbEZuXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGRlZmluZSA9IGZ1bmN0aW9uKG5hbWUsIGRlcHMsIGRlY2xGbikge1xuICAgICAgICAgICAgICAgIGlmKCFkZWNsRm4pIHtcbiAgICAgICAgICAgICAgICAgICAgZGVjbEZuID0gZGVwcztcbiAgICAgICAgICAgICAgICAgICAgZGVwcyA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBtb2R1bGUgPSBtb2R1bGVzU3RvcmFnZVtuYW1lXTtcbiAgICAgICAgICAgICAgICBpZighbW9kdWxlKSB7XG4gICAgICAgICAgICAgICAgICAgIG1vZHVsZSA9IG1vZHVsZXNTdG9yYWdlW25hbWVdID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSA6IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWNsIDogdW5kZWZcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtb2R1bGUuZGVjbCA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmFtZSAgICAgICA6IG5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHByZXYgICAgICAgOiBtb2R1bGUuZGVjbCxcbiAgICAgICAgICAgICAgICAgICAgZm4gICAgICAgICA6IGRlY2xGbixcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgICAgICA6IERFQ0xfU1RBVEVTLk5PVF9SRVNPTFZFRCxcbiAgICAgICAgICAgICAgICAgICAgZGVwcyAgICAgICA6IGRlcHMsXG4gICAgICAgICAgICAgICAgICAgIGRlcGVuZGVudHMgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgZXhwb3J0cyAgICA6IHVuZGVmXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogUmVxdWlyZXMgbW9kdWxlc1xuICAgICAgICAgICAgICogQHBhcmFtIHtTdHJpbmd8U3RyaW5nW119IG1vZHVsZXNcbiAgICAgICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiXG4gICAgICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZXJyb3JDYl1cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgcmVxdWlyZSA9IGZ1bmN0aW9uKG1vZHVsZXMsIGNiLCBlcnJvckNiKSB7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIG1vZHVsZXMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIG1vZHVsZXMgPSBbbW9kdWxlc107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYoIXdhaXRGb3JOZXh0VGljaykge1xuICAgICAgICAgICAgICAgICAgICB3YWl0Rm9yTmV4dFRpY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBuZXh0VGljayhvbk5leHRUaWNrKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBwZW5kaW5nUmVxdWlyZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGRlcHMgOiBtb2R1bGVzLFxuICAgICAgICAgICAgICAgICAgICBjYiAgIDogZnVuY3Rpb24oZXhwb3J0cywgZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChlcnJvckNiIHx8IG9uRXJyb3IpKGVycm9yKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2IuYXBwbHkoZ2xvYmFsLCBleHBvcnRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBSZXR1cm5zIHN0YXRlIG9mIG1vZHVsZVxuICAgICAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICAgICAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IHN0YXRlLCBwb3NzaWJsZSB2YWx1ZXMgYXJlIE5PVF9ERUZJTkVELCBOT1RfUkVTT0xWRUQsIElOX1JFU09MVklORywgUkVTT0xWRURcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgZ2V0U3RhdGUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1vZHVsZSA9IG1vZHVsZXNTdG9yYWdlW25hbWVdO1xuICAgICAgICAgICAgICAgIHJldHVybiBtb2R1bGU/XG4gICAgICAgICAgICAgICAgICAgIERFQ0xfU1RBVEVTW21vZHVsZS5kZWNsLnN0YXRlXSA6XG4gICAgICAgICAgICAgICAgICAgICdOT1RfREVGSU5FRCc7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFJldHVybnMgd2hldGhlciB0aGUgbW9kdWxlIGlzIGRlZmluZWRcbiAgICAgICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gICAgICAgICAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgaXNEZWZpbmVkID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAhIW1vZHVsZXNTdG9yYWdlW25hbWVdO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBTZXRzIG9wdGlvbnNcbiAgICAgICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHNldE9wdGlvbnMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgZm9yKHZhciBuYW1lIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShuYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VyT3B0aW9uc1tuYW1lXSA9IG9wdGlvbnNbbmFtZV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBnZXRTdGF0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJlcyA9IHt9LFxuICAgICAgICAgICAgICAgICAgICBtb2R1bGU7XG5cbiAgICAgICAgICAgICAgICBmb3IodmFyIG5hbWUgaW4gbW9kdWxlc1N0b3JhZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYobW9kdWxlc1N0b3JhZ2UuaGFzT3duUHJvcGVydHkobmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZSA9IG1vZHVsZXNTdG9yYWdlW25hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgKHJlc1ttb2R1bGUuZGVjbC5zdGF0ZV0gfHwgKHJlc1ttb2R1bGUuZGVjbC5zdGF0ZV0gPSBbXSkpLnB1c2gobmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgb25OZXh0VGljayA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHdhaXRGb3JOZXh0VGljayA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGFwcGx5UmVxdWlyZXMoKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGFwcGx5UmVxdWlyZXMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVxdWlyZXNUb1Byb2Nlc3MgPSBwZW5kaW5nUmVxdWlyZXMsXG4gICAgICAgICAgICAgICAgICAgIGkgPSAwLCByZXF1aXJlO1xuXG4gICAgICAgICAgICAgICAgcGVuZGluZ1JlcXVpcmVzID0gW107XG5cbiAgICAgICAgICAgICAgICB3aGlsZShyZXF1aXJlID0gcmVxdWlyZXNUb1Byb2Nlc3NbaSsrXSkge1xuICAgICAgICAgICAgICAgICAgICByZXF1aXJlRGVwcyhudWxsLCByZXF1aXJlLmRlcHMsIFtdLCByZXF1aXJlLmNiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICByZXF1aXJlRGVwcyA9IGZ1bmN0aW9uKGZyb21EZWNsLCBkZXBzLCBwYXRoLCBjYikge1xuICAgICAgICAgICAgICAgIHZhciB1bnJlc29sdmVkRGVwc0NudCA9IGRlcHMubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlmKCF1bnJlc29sdmVkRGVwc0NudCkge1xuICAgICAgICAgICAgICAgICAgICBjYihbXSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIGRlY2xzID0gW10sXG4gICAgICAgICAgICAgICAgICAgIG9uRGVjbFJlc29sdmVkID0gZnVuY3Rpb24oXywgZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2IobnVsbCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIS0tdW5yZXNvbHZlZERlcHNDbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZXhwb3J0cyA9IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpID0gMCwgZGVjbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZShkZWNsID0gZGVjbHNbaSsrXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBvcnRzLnB1c2goZGVjbC5leHBvcnRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2IoZXhwb3J0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGkgPSAwLCBsZW4gPSB1bnJlc29sdmVkRGVwc0NudCxcbiAgICAgICAgICAgICAgICAgICAgZGVwLCBkZWNsO1xuXG4gICAgICAgICAgICAgICAgd2hpbGUoaSA8IGxlbikge1xuICAgICAgICAgICAgICAgICAgICBkZXAgPSBkZXBzW2krK107XG4gICAgICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBkZXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZighbW9kdWxlc1N0b3JhZ2VbZGVwXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNiKG51bGwsIGJ1aWxkTW9kdWxlTm90Rm91bmRFcnJvcihkZXAsIGZyb21EZWNsKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWNsID0gbW9kdWxlc1N0b3JhZ2VbZGVwXS5kZWNsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVjbCA9IGRlcDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGRlY2xzLnB1c2goZGVjbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgc3RhcnREZWNsUmVzb2x2aW5nKGRlY2wsIHBhdGgsIG9uRGVjbFJlc29sdmVkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBzdGFydERlY2xSZXNvbHZpbmcgPSBmdW5jdGlvbihkZWNsLCBwYXRoLCBjYikge1xuICAgICAgICAgICAgICAgIGlmKGRlY2wuc3RhdGUgPT09IERFQ0xfU1RBVEVTLlJFU09MVkVEKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKGRlY2wuZXhwb3J0cyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZihkZWNsLnN0YXRlID09PSBERUNMX1NUQVRFUy5JTl9SRVNPTFZJTkcpIHtcbiAgICAgICAgICAgICAgICAgICAgY3VyT3B0aW9ucy50cmFja0NpcmN1bGFyRGVwZW5kZW5jaWVzICYmIGlzRGVwZW5kZW5jZUNpcmN1bGFyKGRlY2wsIHBhdGgpP1xuICAgICAgICAgICAgICAgICAgICAgICAgY2IobnVsbCwgYnVpbGRDaXJjdWxhckRlcGVuZGVuY2VFcnJvcihkZWNsLCBwYXRoKSkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgZGVjbC5kZXBlbmRlbnRzLnB1c2goY2IpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZGVjbC5kZXBlbmRlbnRzLnB1c2goY2IpO1xuXG4gICAgICAgICAgICAgICAgaWYoZGVjbC5wcmV2ICYmICFjdXJPcHRpb25zLmFsbG93TXVsdGlwbGVEZWNsYXJhdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdmlkZUVycm9yKGRlY2wsIGJ1aWxkTXVsdGlwbGVEZWNsYXJhdGlvbkVycm9yKGRlY2wpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGN1ck9wdGlvbnMudHJhY2tDaXJjdWxhckRlcGVuZGVuY2llcyAmJiAocGF0aCA9IHBhdGguc2xpY2UoKSkucHVzaChkZWNsKTtcblxuICAgICAgICAgICAgICAgIHZhciBpc1Byb3ZpZGVkID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGRlcHMgPSBkZWNsLnByZXY/IGRlY2wuZGVwcy5jb25jYXQoW2RlY2wucHJldl0pIDogZGVjbC5kZXBzO1xuXG4gICAgICAgICAgICAgICAgZGVjbC5zdGF0ZSA9IERFQ0xfU1RBVEVTLklOX1JFU09MVklORztcbiAgICAgICAgICAgICAgICByZXF1aXJlRGVwcyhcbiAgICAgICAgICAgICAgICAgICAgZGVjbCxcbiAgICAgICAgICAgICAgICAgICAgZGVwcyxcbiAgICAgICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oZGVwRGVjbHNFeHBvcnRzLCBlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm92aWRlRXJyb3IoZGVjbCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgZGVwRGVjbHNFeHBvcnRzLnVuc2hpZnQoZnVuY3Rpb24oZXhwb3J0cywgZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZihpc1Byb3ZpZGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNiKG51bGwsIGJ1aWxkRGVjbEFyZWFkeVByb3ZpZGVkRXJyb3IoZGVjbCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNQcm92aWRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3ZpZGVFcnJvcihkZWNsLCBlcnJvcikgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm92aWRlRGVjbChkZWNsLCBleHBvcnRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWNsLmZuLmFwcGx5KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSAgIDogZGVjbC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXBzICAgOiBkZWNsLmRlcHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdsb2JhbCA6IGdsb2JhbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwRGVjbHNFeHBvcnRzKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBwcm92aWRlRGVjbCA9IGZ1bmN0aW9uKGRlY2wsIGV4cG9ydHMpIHtcbiAgICAgICAgICAgICAgICBkZWNsLmV4cG9ydHMgPSBleHBvcnRzO1xuICAgICAgICAgICAgICAgIGRlY2wuc3RhdGUgPSBERUNMX1NUQVRFUy5SRVNPTFZFRDtcblxuICAgICAgICAgICAgICAgIHZhciBpID0gMCwgZGVwZW5kZW50O1xuICAgICAgICAgICAgICAgIHdoaWxlKGRlcGVuZGVudCA9IGRlY2wuZGVwZW5kZW50c1tpKytdKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcGVuZGVudChleHBvcnRzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBkZWNsLmRlcGVuZGVudHMgPSB1bmRlZjtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHByb3ZpZGVFcnJvciA9IGZ1bmN0aW9uKGRlY2wsIGVycm9yKSB7XG4gICAgICAgICAgICAgICAgZGVjbC5zdGF0ZSA9IERFQ0xfU1RBVEVTLk5PVF9SRVNPTFZFRDtcblxuICAgICAgICAgICAgICAgIHZhciBpID0gMCwgZGVwZW5kZW50O1xuICAgICAgICAgICAgICAgIHdoaWxlKGRlcGVuZGVudCA9IGRlY2wuZGVwZW5kZW50c1tpKytdKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcGVuZGVudChudWxsLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZGVjbC5kZXBlbmRlbnRzID0gW107XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjcmVhdGUgICAgIDogY3JlYXRlLFxuICAgICAgICAgICAgZGVmaW5lICAgICA6IGRlZmluZSxcbiAgICAgICAgICAgIHJlcXVpcmUgICAgOiByZXF1aXJlLFxuICAgICAgICAgICAgZ2V0U3RhdGUgICA6IGdldFN0YXRlLFxuICAgICAgICAgICAgaXNEZWZpbmVkICA6IGlzRGVmaW5lZCxcbiAgICAgICAgICAgIHNldE9wdGlvbnMgOiBzZXRPcHRpb25zLFxuICAgICAgICAgICAgZ2V0U3RhdCAgICA6IGdldFN0YXRcbiAgICAgICAgfTtcbiAgICB9LFxuXG4gICAgb25FcnJvciA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgYnVpbGRNb2R1bGVOb3RGb3VuZEVycm9yID0gZnVuY3Rpb24obmFtZSwgZGVjbCkge1xuICAgICAgICByZXR1cm4gRXJyb3IoZGVjbD9cbiAgICAgICAgICAgICdNb2R1bGUgXCInICsgZGVjbC5uYW1lICsgJ1wiOiBjYW5cXCd0IHJlc29sdmUgZGVwZW5kZW5jZSBcIicgKyBuYW1lICsgJ1wiJyA6XG4gICAgICAgICAgICAnUmVxdWlyZWQgbW9kdWxlIFwiJyArIG5hbWUgKyAnXCIgY2FuXFwndCBiZSByZXNvbHZlZCcpO1xuICAgIH0sXG5cbiAgICBidWlsZENpcmN1bGFyRGVwZW5kZW5jZUVycm9yID0gZnVuY3Rpb24oZGVjbCwgcGF0aCkge1xuICAgICAgICB2YXIgc3RyUGF0aCA9IFtdLFxuICAgICAgICAgICAgaSA9IDAsIHBhdGhEZWNsO1xuICAgICAgICB3aGlsZShwYXRoRGVjbCA9IHBhdGhbaSsrXSkge1xuICAgICAgICAgICAgc3RyUGF0aC5wdXNoKHBhdGhEZWNsLm5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHN0clBhdGgucHVzaChkZWNsLm5hbWUpO1xuXG4gICAgICAgIHJldHVybiBFcnJvcignQ2lyY3VsYXIgZGVwZW5kZW5jZSBoYXMgYmVlbiBkZXRlY3RlZDogXCInICsgc3RyUGF0aC5qb2luKCcgLT4gJykgKyAnXCInKTtcbiAgICB9LFxuXG4gICAgYnVpbGREZWNsQXJlYWR5UHJvdmlkZWRFcnJvciA9IGZ1bmN0aW9uKGRlY2wpIHtcbiAgICAgICAgcmV0dXJuIEVycm9yKCdEZWNsYXJhdGlvbiBvZiBtb2R1bGUgXCInICsgZGVjbC5uYW1lICsgJ1wiIGhhcyBhbHJlYWR5IGJlZW4gcHJvdmlkZWQnKTtcbiAgICB9LFxuXG4gICAgYnVpbGRNdWx0aXBsZURlY2xhcmF0aW9uRXJyb3IgPSBmdW5jdGlvbihkZWNsKSB7XG4gICAgICAgIHJldHVybiBFcnJvcignTXVsdGlwbGUgZGVjbGFyYXRpb25zIG9mIG1vZHVsZSBcIicgKyBkZWNsLm5hbWUgKyAnXCIgaGF2ZSBiZWVuIGRldGVjdGVkJyk7XG4gICAgfSxcblxuICAgIGlzRGVwZW5kZW5jZUNpcmN1bGFyID0gZnVuY3Rpb24oZGVjbCwgcGF0aCkge1xuICAgICAgICB2YXIgaSA9IDAsIHBhdGhEZWNsO1xuICAgICAgICB3aGlsZShwYXRoRGVjbCA9IHBhdGhbaSsrXSkge1xuICAgICAgICAgICAgaWYoZGVjbCA9PT0gcGF0aERlY2wpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSxcblxuICAgIG5leHRUaWNrID0gKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZm5zID0gW10sXG4gICAgICAgICAgICBlbnF1ZXVlRm4gPSBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmbnMucHVzaChmbikgPT09IDE7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2FsbEZucyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBmbnNUb0NhbGwgPSBmbnMsIGkgPSAwLCBsZW4gPSBmbnMubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGZucyA9IFtdO1xuICAgICAgICAgICAgICAgIHdoaWxlKGkgPCBsZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgZm5zVG9DYWxsW2krK10oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIGlmKHR5cGVvZiBwcm9jZXNzID09PSAnb2JqZWN0JyAmJiBwcm9jZXNzLm5leHRUaWNrKSB7IC8vIG5vZGVqc1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAgICAgZW5xdWV1ZUZuKGZuKSAmJiBwcm9jZXNzLm5leHRUaWNrKGNhbGxGbnMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGdsb2JhbC5zZXRJbW1lZGlhdGUpIHsgLy8gaWUxMFxuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAgICAgZW5xdWV1ZUZuKGZuKSAmJiBnbG9iYWwuc2V0SW1tZWRpYXRlKGNhbGxGbnMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGdsb2JhbC5wb3N0TWVzc2FnZSAmJiAhZ2xvYmFsLm9wZXJhKSB7IC8vIG1vZGVybiBicm93c2Vyc1xuICAgICAgICAgICAgdmFyIGlzUG9zdE1lc3NhZ2VBc3luYyA9IHRydWU7XG4gICAgICAgICAgICBpZihnbG9iYWwuYXR0YWNoRXZlbnQpIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hlY2tBc3luYyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNQb3N0TWVzc2FnZUFzeW5jID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgZ2xvYmFsLmF0dGFjaEV2ZW50KCdvbm1lc3NhZ2UnLCBjaGVja0FzeW5jKTtcbiAgICAgICAgICAgICAgICBnbG9iYWwucG9zdE1lc3NhZ2UoJ19fY2hlY2tBc3luYycsICcqJyk7XG4gICAgICAgICAgICAgICAgZ2xvYmFsLmRldGFjaEV2ZW50KCdvbm1lc3NhZ2UnLCBjaGVja0FzeW5jKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoaXNQb3N0TWVzc2FnZUFzeW5jKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1zZyA9ICdfX21vZHVsZXMnICsgKCtuZXcgRGF0ZSgpKSxcbiAgICAgICAgICAgICAgICAgICAgb25NZXNzYWdlID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoZS5kYXRhID09PSBtc2cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbiAmJiBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxGbnMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyP1xuICAgICAgICAgICAgICAgICAgICBnbG9iYWwuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIG9uTWVzc2FnZSwgdHJ1ZSkgOlxuICAgICAgICAgICAgICAgICAgICBnbG9iYWwuYXR0YWNoRXZlbnQoJ29ubWVzc2FnZScsIG9uTWVzc2FnZSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgICAgICAgICAgZW5xdWV1ZUZuKGZuKSAmJiBnbG9iYWwucG9zdE1lc3NhZ2UobXNnLCAnKicpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZG9jID0gZ2xvYmFsLmRvY3VtZW50O1xuICAgICAgICBpZignb25yZWFkeXN0YXRlY2hhbmdlJyBpbiBkb2MuY3JlYXRlRWxlbWVudCgnc2NyaXB0JykpIHsgLy8gaWU2LWllOFxuICAgICAgICAgICAgdmFyIGhlYWQgPSBkb2MuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXSxcbiAgICAgICAgICAgICAgICBjcmVhdGVTY3JpcHQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNjcmlwdCA9IGRvYy5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgICAgICAgICAgICAgc2NyaXB0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NyaXB0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoc2NyaXB0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjcmlwdCA9IHNjcmlwdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbEZucygpO1xuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBoZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAgICAgZW5xdWV1ZUZuKGZuKSAmJiBjcmVhdGVTY3JpcHQoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZm4pIHsgLy8gb2xkIGJyb3dzZXJzXG4gICAgICAgICAgICBlbnF1ZXVlRm4oZm4pICYmIHNldFRpbWVvdXQoY2FsbEZucywgMCk7XG4gICAgICAgIH07XG4gICAgfSkoKTtcblxuaWYodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBjcmVhdGUoKTtcbn1cbmVsc2Uge1xuICAgIGdsb2JhbC5tb2R1bGVzID0gY3JlYXRlKCk7XG59XG5cbn0pKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogZ2xvYmFsKTtcbiIsInZhciBMb2dnZXIgPSByZXF1aXJlKCcuL2xvZ2dlci9sb2dnZXInKTtcbnZhciBsb2dnZXIgPSBuZXcgTG9nZ2VyKCdBdWRpb1BsYXllcicpO1xuXG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi9saWIvYXN5bmMvZXZlbnRzJyk7XG52YXIgRGVmZXJyZWQgPSByZXF1aXJlKCcuL2xpYi9hc3luYy9kZWZlcnJlZCcpO1xudmFyIGRldGVjdCA9IHJlcXVpcmUoJy4vbGliL2Jyb3dzZXIvZGV0ZWN0Jyk7XG52YXIgY29uZmlnID0gcmVxdWlyZSgnLi9jb25maWcnKTtcbnZhciBtZXJnZSA9IHJlcXVpcmUoJy4vbGliL2RhdGEvbWVyZ2UnKTtcbnZhciByZWplY3QgPSByZXF1aXJlKCcuL2xpYi9hc3luYy9yZWplY3QnKTtcblxudmFyIEF1ZGlvRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yL2F1ZGlvLWVycm9yJyk7XG52YXIgQXVkaW9TdGF0aWMgPSByZXF1aXJlKCcuL2F1ZGlvLXN0YXRpYycpO1xuXG52YXIgcGxheWVySWQgPSAxO1xuXG4vL1RPRE86INGB0LTQtdC70LDRgtGMINC40L3RgtC10YDRhNC10LnRgSDQtNC70Y8g0LLQvtC30LzQvtC20L3QvtGB0YLQuCDQv9C+0LTQutC70Y7Rh9C10L3QuNGPINC90L7QstGL0YUg0YLQuNC/0L7QslxudmFyIGF1ZGlvVHlwZXMgPSB7XG4gICAgaHRtbDU6IHJlcXVpcmUoJy4vaHRtbDUvYXVkaW8taHRtbDUnKSxcbiAgICBmbGFzaDogcmVxdWlyZSgnLi9mbGFzaC9hdWRpby1mbGFzaCcpXG59O1xuXG52YXIgZGV0ZWN0U3RyaW5nID0gXCJAXCIgKyBkZXRlY3QucGxhdGZvcm0udmVyc2lvbiArXG4gICAgXCIgXCIgKyBkZXRlY3QucGxhdGZvcm0ub3MgK1xuICAgIFwiOlwiICsgZGV0ZWN0LmJyb3dzZXIubmFtZSArXG4gICAgXCIvXCIgKyBkZXRlY3QuYnJvd3Nlci52ZXJzaW9uO1xuXG5hdWRpb1R5cGVzLmZsYXNoLnByaW9yaXR5ID0gMDtcbmF1ZGlvVHlwZXMuaHRtbDUucHJpb3JpdHkgPSBjb25maWcuaHRtbDUuYmxhY2tsaXN0LnNvbWUoZnVuY3Rpb24oaXRlbSkgeyByZXR1cm4gZGV0ZWN0U3RyaW5nLm1hdGNoKGl0ZW0pOyB9KSA/IC0xIDogMTtcblxubG9nZ2VyLmRlYnVnKG51bGwsIFwiYXVkaW9UeXBlc1wiLCBhdWRpb1R5cGVzKTtcblxuLyoqINCe0L/QuNGB0LDQvdC40LUg0LLRgNC10LzQtdC90L3Ri9GFINC00LDQvdC90YvRhSDQv9C70LXQtdGA0LBcbiAqIEB0eXBlZGVmIHtPYmplY3R9IHlhLkF1ZGlvfkF1ZGlvUGxheWVyVGltZXNcbiAqXG4gKiBAcHJvcGVydHkge051bWJlcn0gZHVyYXRpb24gLSDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0YLRgNC10LrQsFxuICogQHByb3BlcnR5IHtOdW1iZXJ9IGxvYWRlZCAtINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQt9Cw0LPRgNGD0LbQtdC90L3QvtC5INGH0LDRgdGC0LhcbiAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBwb3NpdGlvbiAtINC/0L7Qt9C40YbQuNGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICogQHByb3BlcnR5IHtOdW1iZXJ9IHBsYXllZCAtINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqL1xuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQ29tbW9uIEV2ZW50c1xuLyoqINCh0L7QsdGL0YLQuNC1INC90LDRh9Cw0LvQsCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8gKHtAbGluayB5YS5BdWRpby5FVkVOVF9QTEFZfSlcbiAqIEBldmVudCB5YS5BdWRpbyNwbGF5XG4gKi9cbi8qKiDQodC+0LHRi9GC0LjQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8gKHtAbGluayB5YS5BdWRpby5FVkVOVF9FTkRFRH0pXG4gKiBAZXZlbnQgeWEuQXVkaW8jZW5kZWRcbiAqL1xuLyoqINCh0L7QsdGL0YLQuNC1INC40LfQvNC10L3QtdC90LjRjyDQs9GA0L7QvNC60L7RgdGC0LggKHtAbGluayB5YS5BdWRpby5FVkVOVF9WT0xVTUV9KVxuICogQGV2ZW50IHlhLkF1ZGlvI3ZvbHVtZWNoYW5nZVxuICogQHBhcmFtIHtOdW1iZXJ9IHZvbHVtZSAtINCz0YDQvtC80LrQvtGB0YLRjFxuICovXG4vKiog0KHQvtCx0YvRgtC40LUg0LrRgNCw0YXQsCDQv9C70LXQtdGA0LAgKHtAbGluayB5YS5BdWRpby5FVkVOVF9DUkFTSEVEfSlcbiAqIEBldmVudCB5YS5BdWRpbyNjcmFzaGVkXG4gKi9cbi8qKiDQodC+0LHRi9GC0LjQtSDRgdC80LXQvdGLINGB0YLQsNGC0YPRgdCwINC/0LvQtdC10YDQsCAoe0BsaW5rIHlhLkF1ZGlvLkVWRU5UX1NUQVRFfSlcbiAqIEBldmVudCB5YS5BdWRpbyNzdGF0ZVxuICogQHBhcmFtIHtTdHJpbmd9IHN0YXRlIC0g0L3QvtCy0YvQuSDRgdGC0LDRgtGD0YEg0L/Qu9C10LXRgNCwXG4gKi9cbi8qKiDQodC+0LHRi9GC0LjQtSDQv9C10YDQtdC60LvRjtGH0LXQvdC40Y8g0LDQutGC0LjQstC90L7Qs9C+INC/0LvQtdC10YDQsCDQuCDQv9GA0LXQu9C+0LDQtNC10YDQsCAoe0BsaW5rIHlhLkF1ZGlvLkVWRU5UX1NXQVB9KVxuICogQGV2ZW50IHlhLkF1ZGlvI3N3YXBcbiAqL1xuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQWN0aXZlIEV2ZW50c1xuLyoqINCh0L7QsdGL0YLQuNC1INC+0YHRgtCw0L3QvtCy0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8gKHtAbGluayB5YS5BdWRpby5FVkVOVF9TVE9QfSlcbiAqIEBldmVudCB5YS5BdWRpbyNzdG9wXG4gKi9cbi8qKiDQodC+0LHRi9GC0LjQtSDQvdCw0YfQsNC70LAg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPICh7QGxpbmsgeWEuQXVkaW8uRVZFTlRfUEFVU0V9KVxuICogQGV2ZW50IHlhLkF1ZGlvI3BhdXNlXG4gKi9cbi8qKiDQodC+0LHRi9GC0LjQtSDQvtCx0L3QvtCy0LvQtdC90LjRjyDQv9C+0LfQuNGG0LjQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8v0LfQsNCz0YDRg9C20LXQvdC90L7QuSDRh9Cw0YHRgtC4ICh7QGxpbmsgeWEuQXVkaW8uRVZFTlRfUFJPR1JFU1N9KVxuICogQGV2ZW50IHlhLkF1ZGlvI3Byb2dyZXNzXG4gKiBAcGFyYW0ge3lhLkF1ZGlvfkF1ZGlvUGxheWVyVGltZXN9IHRpbWVzIC0g0LjQvdGE0L7RgNC80LDRhtC40Y8g0L4g0LLRgNC10LzQtdC90L3Ri9GFINC00LDQvdC90YvRhSDRgtGA0LXQutCwXG4gKi9cbi8qKiDQodC+0LHRi9GC0LjQtSDQvdCw0YfQsNC70LAg0LfQsNCz0YDRg9C30LrQuCDRgtGA0LXQutCwICh7QGxpbmsgeWEuQXVkaW8uRVZFTlRfTE9BRElOR30pXG4gKiBAZXZlbnQgeWEuQXVkaW8jbG9hZGluZ1xuICovXG4vKiog0KHQvtCx0YvRgtC40LUg0LfQsNCy0LXRgNGI0LXQvdC40Y8g0LfQsNCz0YDRg9C30LrQuCDRgtGA0LXQutCwICh7QGxpbmsgeWEuQXVkaW8uRVZFTlRfTE9BREVEfSlcbiAqIEBldmVudCB5YS5BdWRpbyNsb2FkZWRcbiAqL1xuLyoqINCh0L7QsdGL0YLQuNC1INC+0YjQuNCx0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8gKHtAbGluayB5YS5BdWRpby5FVkVOVF9FUlJPUn0pXG4gKiBAZXZlbnQgeWEuQXVkaW8jZXJyb3JcbiAqL1xuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gUHJlbG9hZGVyIEV2ZW50c1xuLyoqINCh0L7QsdGL0YLQuNC1INC+0YHRgtCw0L3QvtCy0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8gKHtAbGluayB5YS5BdWRpby5FVkVOVF9TVE9QfSlcbiAqIEBldmVudCB5YS5BdWRpbyNwcmVsb2FkZXI6c3RvcFxuICovXG4vKiog0KHQvtCx0YvRgtC40LUg0L3QsNGH0LDQu9CwINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjyAoe0BsaW5rIHlhLkF1ZGlvLkVWRU5UX1BBVVNFfSlcbiAqIEBldmVudCB5YS5BdWRpbyNwcmVsb2FkZXI6cGF1c2VcbiAqL1xuLyoqINCh0L7QsdGL0YLQuNC1INC+0LHQvdC+0LLQu9C10L3QuNGPINC/0L7Qt9C40YbQuNC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy/Qt9Cw0LPRgNGD0LbQtdC90L3QvtC5INGH0LDRgdGC0LggKHtAbGluayB5YS5BdWRpby5FVkVOVF9QUk9HUkVTU30pXG4gKiBAZXZlbnQgeWEuQXVkaW8jcHJlbG9hZGVyOnByb2dyZXNzXG4gKiBAcGFyYW0ge3lhLkF1ZGlvfkF1ZGlvUGxheWVyVGltZXN9IHRpbWVzIC0g0LjQvdGE0L7RgNC80LDRhtC40Y8g0L4g0LLRgNC10LzQtdC90L3Ri9GFINC00LDQvdC90YvRhSDRgtGA0LXQutCwXG4gKi9cbi8qKiDQodC+0LHRi9GC0LjQtSDQvdCw0YfQsNC70LAg0LfQsNCz0YDRg9C30LrQuCDRgtGA0LXQutCwICh7QGxpbmsgeWEuQXVkaW8uRVZFTlRfTE9BRElOR30pXG4gKiBAZXZlbnQgeWEuQXVkaW8jcHJlbG9hZGVyOmxvYWRpbmdcbiAqL1xuLyoqINCh0L7QsdGL0YLQuNC1INC30LDQstC10YDRiNC10L3QuNGPINC30LDQs9GA0YPQt9C60Lgg0YLRgNC10LrQsCAoe0BsaW5rIHlhLkF1ZGlvLkVWRU5UX0xPQURFRH0pXG4gKiBAZXZlbnQgeWEuQXVkaW8jcHJlbG9hZGVyOmxvYWRlZFxuICovXG4vKiog0KHQvtCx0YvRgtC40LUg0L7RiNC40LHQutC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjyAoe0BsaW5rIHlhLkF1ZGlvLkVWRU5UX0VSUk9SfSlcbiAqIEBldmVudCB5YS5BdWRpbyNwcmVsb2FkZXI6ZXJyb3JcbiAqL1xuXG4vKipcbiAqIEBjbGFzcyDQkNGD0LTQuNC+LdC/0LvQtdC10YAg0LTQu9GPINCx0YDQsNGD0LfQtdGA0LAuXG4gKiBAYWxpYXMgeWEuQXVkaW9cbiAqIEBwYXJhbSB7U3RyaW5nfSBbcHJlZmVycmVkVHlwZV0gLSBwcmVmZXJyZWQgcGxheWVyIHR5cGUgKGh0bWw1L2ZsYXNoKVxuICogQHBhcmFtIHtIVE1MRWxlbWVudH0gW292ZXJsYXldIC0gZG9tIGVsZW1lbnQgdG8gc2hvdyBmbGFzaFxuICpcbiAqIEBleHRlbmRzIEV2ZW50c1xuICogQG1peGVzIEF1ZGlvU3RhdGljXG4gKlxuICogQGZpcmVzIHlhLkF1ZGlvI3BsYXlcbiAqIEBmaXJlcyB5YS5BdWRpbyNlbmRlZFxuICogQGZpcmVzIHlhLkF1ZGlvI3ZvbHVtZWNoYW5nZVxuICogQGZpcmVzIHlhLkF1ZGlvI2NyYXNoZWRcbiAqIEBmaXJlcyB5YS5BdWRpbyNzdGF0ZVxuICogQGZpcmVzIHlhLkF1ZGlvI3N3YXBcbiAqXG4gKiBAZmlyZXMgeWEuQXVkaW8jc3RvcFxuICogQGZpcmVzIHlhLkF1ZGlvI3BhdXNlXG4gKiBAZmlyZXMgeWEuQXVkaW8jcHJvZ3Jlc3NcbiAqIEBmaXJlcyB5YS5BdWRpbyNsb2FkaW5nXG4gKiBAZmlyZXMgeWEuQXVkaW8jbG9hZGVkXG4gKiBAZmlyZXMgeWEuQXVkaW8jZXJyb3JcbiAqXG4gKiBAZmlyZXMgeWEuQXVkaW8jcHJlbG9hZGVyOnN0b3BcbiAqIEBmaXJlcyB5YS5BdWRpbyNwcmVsb2FkZXI6cGF1c2VcbiAqIEBmaXJlcyB5YS5BdWRpbyNwcmVsb2FkZXI6cHJvZ3Jlc3NcbiAqIEBmaXJlcyB5YS5BdWRpbyNwcmVsb2FkZXI6bG9hZGluZ1xuICogQGZpcmVzIHlhLkF1ZGlvI3ByZWxvYWRlcjpsb2FkZWRcbiAqIEBmaXJlcyB5YS5BdWRpbyNwcmVsb2FkZXI6ZXJyb3JcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIEF1ZGlvUGxheWVyID0gZnVuY3Rpb24ocHJlZmVycmVkVHlwZSwgb3ZlcmxheSkge1xuICAgIHRoaXMubmFtZSA9IHBsYXllcklkKys7XG4gICAgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiY29uc3RydWN0b3JcIik7XG5cbiAgICBFdmVudHMuY2FsbCh0aGlzKTtcblxuICAgIHRoaXMucHJlZmVycmVkVHlwZSA9IHByZWZlcnJlZFR5cGU7XG4gICAgdGhpcy5vdmVybGF5ID0gb3ZlcmxheTtcbiAgICB0aGlzLnN0YXRlID0gQXVkaW9QbGF5ZXIuU1RBVEVfSU5JVDtcbiAgICB0aGlzLl9wbGF5ZWQgPSAwO1xuICAgIHRoaXMuX2xhc3RTa2lwID0gMDtcbiAgICB0aGlzLl9wbGF5SWQgPSBudWxsO1xuXG4gICAgdGhpcy5fd2hlblJlYWR5ID0gbmV3IERlZmVycmVkKCk7XG4gICAgdGhpcy53aGVuUmVhZHkgPSB0aGlzLl93aGVuUmVhZHkucHJvbWlzZSgpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwiaW1wbGVtZW50YXRpb24gZm91bmRcIiwgdGhpcy5pbXBsZW1lbnRhdGlvbi50eXBlKTtcblxuICAgICAgICB0aGlzLmltcGxlbWVudGF0aW9uLm9uKFwiKlwiLCBmdW5jdGlvbihldmVudCwgb2Zmc2V0LCBkYXRhKSB7XG4gICAgICAgICAgICB0aGlzLl9wb3B1bGF0ZUV2ZW50cyhldmVudCwgb2Zmc2V0LCBkYXRhKTtcblxuICAgICAgICAgICAgaWYgKCFvZmZzZXQpIHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfUExBWTpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldFN0YXRlKEF1ZGlvUGxheWVyLlNUQVRFX1BMQVlJTkcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9TV0FQOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIEF1ZGlvUGxheWVyLkVWRU5UX1NUT1A6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfRU5ERUQ6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfRVJST1I6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRTdGF0ZShBdWRpb1BsYXllci5TVEFURV9JRExFKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfUEFVU0U6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRTdGF0ZShBdWRpb1BsYXllci5TVEFURV9QQVVTRUQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2V0U3RhdGUoQXVkaW9QbGF5ZXIuU1RBVEVfQ1JBU0hFRCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5fc2V0U3RhdGUoQXVkaW9QbGF5ZXIuU1RBVEVfSURMRSk7XG4gICAgfS5iaW5kKHRoaXMpLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcih0aGlzLCBBdWRpb0Vycm9yLk5PX0lNUExFTUVOVEFUSU9OLCBlKTtcblxuICAgICAgICB0aGlzLl9zZXRTdGF0ZShBdWRpb1BsYXllci5TVEFURV9DUkFTSEVEKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgdGhpcy5faW5pdCgwKTtcbn07XG5FdmVudHMubWl4aW4oQXVkaW9QbGF5ZXIpO1xubWVyZ2UoQXVkaW9QbGF5ZXIsIEF1ZGlvU3RhdGljLCB0cnVlKTtcblxuLyoqXG4gKiDQodC/0LjRgdC+0Log0LTQvtGB0YLRg9C/0L3Ri9GFINC/0LvQtdC10YDQvtCyXG4gKiBAdHlwZSB7T2JqZWN0fVxuICogQHN0YXRpY1xuICovXG5BdWRpb1BsYXllci5pbmZvID0ge1xuICAgIGh0bWw1OiBhdWRpb1R5cGVzLmh0bWw1LmF2YWlsYWJsZSxcbiAgICBmbGFzaDogYXVkaW9UeXBlcy5mbGFzaC5hdmFpbGFibGVcbn07XG5cbi8qKlxuICog0JrQvtC90YLQtdC60YHRgiDQtNC70Y8gV2ViIEF1ZGlvIEFQSVxuICogQHR5cGUge0F1ZGlvQ29udGV4dH1cbiAqIEBzdGF0aWNcbiAqL1xuQXVkaW9QbGF5ZXIuYXVkaW9Db250ZXh0ID0gYXVkaW9UeXBlcy5odG1sNS5hdWRpb0NvbnRleHQ7XG5cbi8qKlxuICog0KPRgdGC0LDQvdC+0LLQuNGC0Ywg0YHRgtCw0YLRg9GBINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtTdHJpbmd9IHN0YXRlIC0g0L3QvtCy0YvQuSDRgdGC0LDRgtGD0YFcbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5fc2V0U3RhdGUgPSBmdW5jdGlvbihzdGF0ZSkge1xuICAgIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIl9zZXRTdGF0ZVwiLCBzdGF0ZSk7XG5cbiAgICB2YXIgY2hhbmdlZCA9IHRoaXMuc3RhdGUgIT09IHN0YXRlO1xuICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcblxuICAgIGlmIChjaGFuZ2VkKSB7XG4gICAgICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwibmV3U3RhdGVcIiwgc3RhdGUpO1xuICAgICAgICB0aGlzLnRyaWdnZXIoQXVkaW9QbGF5ZXIuRVZFTlRfU1RBVEUsIHN0YXRlKTtcbiAgICB9XG59O1xuXG4vKipcbiAqINCY0L3QuNGG0LjQsNC70LjQt9Cw0YbQuNGPINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtpbnR9IFtyZXRyeT0wXSAtINC60L7Qu9C40YfQtdGB0YLQstC+INC/0L7Qv9GL0YLQvtC6XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbihyZXRyeSkge1xuICAgIHJldHJ5ID0gcmV0cnkgfHwgMDtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcIl9pbml0XCIsIHJldHJ5KTtcblxuICAgIGlmICghdGhpcy5fd2hlblJlYWR5LnBlbmRpbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChyZXRyeSA+IGNvbmZpZy5hdWRpby5yZXRyeSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IodGhpcywgQXVkaW9FcnJvci5OT19JTVBMRU1FTlRBVElPTik7XG4gICAgICAgIHRoaXMuX3doZW5SZWFkeS5yZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5OT19JTVBMRU1FTlRBVElPTikpO1xuICAgIH1cblxuICAgIHZhciBpbml0U2VxID0gW1xuICAgICAgICBhdWRpb1R5cGVzLmh0bWw1LFxuICAgICAgICBhdWRpb1R5cGVzLmZsYXNoXG4gICAgXS5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmIChhLmF2YWlsYWJsZSAhPT0gYi5hdmFpbGFibGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS5hdmFpbGFibGUgPyAtMSA6IDE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhLkF1ZGlvSW1wbGVtZW50YXRpb24udHlwZSA9PT0gdGhpcy5wcmVmZXJyZWRUeXBlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYi5BdWRpb0ltcGxlbWVudGF0aW9uLnR5cGUgPT09IHRoaXMucHJlZmVycmVkVHlwZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYi5wcmlvcml0eSAtIGEucHJpb3JpdHk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBmdW5jdGlvbiBpbml0KCkge1xuICAgICAgICB2YXIgdHlwZSA9IGluaXRTZXEuc2hpZnQoKTtcblxuICAgICAgICBpZiAoIXR5cGUpIHtcbiAgICAgICAgICAgIHNlbGYuX2luaXQocmV0cnkgKyAxKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbGYuX2luaXRUeXBlKHR5cGUpLnRoZW4oc2VsZi5fd2hlblJlYWR5LnJlc29sdmUsIGluaXQpO1xuICAgIH1cblxuICAgIGluaXQoKTtcbn07XG5cbi8qKlxuICog0JfQsNC/0YPRgdC6INGA0LXQsNC70LjQt9Cw0YbQuNC4INC/0LvQtdC10YDQsCDRgSDRg9C60LDQt9Cw0L3QvdGL0Lwg0YLQuNC/0L7QvFxuICogQHBhcmFtIHt7dHlwZTogc3RyaW5nLCBBdWRpb0ltcGxlbWVudGF0aW9uOiBmdW5jdGlvbn19IHR5cGUgLSDQvtCx0YrQtdC60YIg0L7Qv9C40YHQsNC90LjRjyDRgtC40L/QsCDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuC5cbiAqIEByZXR1cm5zIHtQcm9taXNlfVxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLl9pbml0VHlwZSA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcIl9pbml0VHlwZVwiLCB0eXBlKTtcblxuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZCgpO1xuICAgIHRyeSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQotC10LrRg9GJ0LDRjyDRgNC10LDQu9C40LfQsNGG0LjRjyDQsNGD0LTQuNC+LdC/0LvQtdC10YDQsFxuICAgICAgICAgKiBAdHlwZSB7SUF1ZGlvSW1wbGVtZW50YXRpb258bnVsbH1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuaW1wbGVtZW50YXRpb24gPSBuZXcgdHlwZS5BdWRpb0ltcGxlbWVudGF0aW9uKHRoaXMub3ZlcmxheSk7XG4gICAgICAgIGlmICh0aGlzLmltcGxlbWVudGF0aW9uLndoZW5SZWFkeSkge1xuICAgICAgICAgICAgdGhpcy5pbXBsZW1lbnRhdGlvbi53aGVuUmVhZHkudGhlbihkZWZlcnJlZC5yZXNvbHZlLCBkZWZlcnJlZC5yZWplY3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xufTtcblxuLyoqXG4gKiDQodC+0LfQtNCw0L3QuNC1INC+0LHQtdGJ0LDQvdC40Y8sINC60L7RgtC+0YDQvtC1INGA0LDQt9GA0LXRiNCw0LXRgtGB0Y8g0L/RgNC4INC+0LTQvdC+0Lwg0LjQtyDRgdC/0LjRgdC60LAg0YHQvtCx0YvRgtC40LlcbiAqIEBwYXJhbSB7U3RyaW5nfSBhY3Rpb24gLSDQvdCw0LfQstCw0L3QuNC1INC00LXQudGB0YLQstC40Y9cbiAqIEBwYXJhbSB7QXJyYXkuPFN0cmluZz59IHJlc29sdmUgLSDRgdC/0LjRgdC+0Log0L7QttC40LTQsNC10LzRi9GFINGB0L7QsdGL0YLQuNC5INC00LvRjyDRgNCw0LfRgNC10YjQtdC90LjRjyDQvtCx0LXRidCw0L3QuNGPXG4gKiBAcGFyYW0ge0FycmF5LjxTdHJpbmc+fSByZWplY3QgLSDRgdC/0LjRgdC+0Log0L7QttC40LTQsNC10LzRi9C5INGB0L7QsdGL0YLQuNC5INC00LvRjyDQvtGC0LrQu9C+0L3QtdC90LjRjyDQvtCx0LXRidCw0L3QuNGPXG4gKiBAcmV0dXJucyB7UHJvbWlzZX0gLS0g0YLQsNC60LbQtSDRgdC+0LfQtNCw0ZHRgiBEZWZlcnJlZCDRgdCy0L7QudGB0YLQstC+INGBINC90LDQt9Cy0LDQvdC40LXQvCBfd2hlbjxBY3Rpb24+LCDQutC+0YLQvtGA0L7QtSDQttC40LLRkdGCINC00L4g0LzQvtC80LXQvdGC0LAg0YDQsNC30YDQtdGI0LXQvdC40Y9cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5fd2FpdEV2ZW50cyA9IGZ1bmN0aW9uKGFjdGlvbiwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkKCk7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpc1thY3Rpb25dID0gZGVmZXJyZWQ7XG5cbiAgICB2YXIgY2xlYW51cEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlLmZvckVhY2goZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIHNlbGYub2ZmKGV2ZW50LCBkZWZlcnJlZC5yZXNvbHZlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdC5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICBzZWxmLm9mZihldmVudCwgZGVmZXJyZWQucmVqZWN0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGRlbGV0ZSBzZWxmW2FjdGlvbl07XG4gICAgfTtcblxuICAgIHJlc29sdmUuZm9yRWFjaChmdW5jdGlvbihldmVudCkge1xuICAgICAgICBzZWxmLm9uKGV2ZW50LCBkZWZlcnJlZC5yZXNvbHZlKTtcbiAgICB9KTtcblxuICAgIHJlamVjdC5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIHNlbGYub24oZXZlbnQsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHZhciBlcnJvciA9IGRhdGEgaW5zdGFuY2VvZiBFcnJvciA/IGRhdGEgOiBuZXcgQXVkaW9FcnJvcihkYXRhIHx8IGV2ZW50KTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgZGVmZXJyZWQucHJvbWlzZSgpLnRoZW4oY2xlYW51cEV2ZW50cywgY2xlYW51cEV2ZW50cyk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xufTtcblxuLyoqXG4gKiDQoNCw0YHRiNC40YDQtdC90LjQtSDRgdC+0LHRi9GC0LjQuSDQsNGD0LTQuNC+LdC/0LvQtdC10YDQsCDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C80Lgg0YHQstC+0LnRgdGC0LLQsNC80LguINCf0L7QtNC/0LjRgdGL0LLQsNC10YLRgdGPINC90LAg0LLRgdC1INGB0L7QsdGL0YLQuNGPINCw0YPQtNC40L4t0L/Qu9C10LXRgNCwLFxuICog0YLRgNC40LPQs9C10YDQuNGCINC40YLQvtCz0L7QstGL0LUg0YHQvtCx0YvRgtC40Y8sINGA0LDQt9C00LXQu9GP0Y8g0LjRhSDQv9C+INGC0LjQv9GDINCw0LrRgtC40LLQvdGL0Lkg0L/Qu9C10LXRgCDQuNC70Lgg0L/RgNC10LvQvtCw0LTQtdGALCDQtNC+0L/QvtC70L3Rj9C10YIg0YHQvtCx0YvRgtC40Y8g0LTQsNC90L3Ri9C80LguXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSDRgdC+0LHRi9GC0LjQtVxuICogQHBhcmFtIHtpbnR9IG9mZnNldCAtINC40YHRgtC+0YfQvdC40Log0YHQvtCx0YvRgtC40Y8uIDAgLSDQsNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAuIDEgLSDQv9GA0LXQu9C+0LDQtNC10YAuXG4gKiBAcGFyYW0geyp9IGRhdGEgLSDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INC00LDQvdC90YvQtSDRgdC+0LHRi9GC0LjRjy5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5fcG9wdWxhdGVFdmVudHMgPSBmdW5jdGlvbihldmVudCwgb2Zmc2V0LCBkYXRhKSB7XG4gICAgaWYgKGV2ZW50ICE9PSBBdWRpb1BsYXllci5FVkVOVF9QUk9HUkVTUykge1xuICAgICAgICBsb2dnZXIuZGVidWcodGhpcywgXCJfcG9wdWxhdGVFdmVudHNcIiwgZXZlbnQsIG9mZnNldCwgZGF0YSk7XG4gICAgfVxuXG4gICAgdmFyIG91dGVyRXZlbnQgPSAob2Zmc2V0ID8gQXVkaW9QbGF5ZXIuUFJFTE9BREVSX0VWRU5UIDogXCJcIikgKyBldmVudDtcblxuICAgIHN3aXRjaCAoZXZlbnQpIHtcbiAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEOlxuICAgICAgICBjYXNlIEF1ZGlvUGxheWVyLkVWRU5UX1NXQVA6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoZXZlbnQsIGRhdGEpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfRVJST1I6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIob3V0ZXJFdmVudCwgZGF0YSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9WT0xVTUU6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoZXZlbnQsIHRoaXMuZ2V0Vm9sdW1lKCkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfUFJPR1JFU1M6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIob3V0ZXJFdmVudCwge1xuICAgICAgICAgICAgICAgIGR1cmF0aW9uOiB0aGlzLmdldER1cmF0aW9uKG9mZnNldCksXG4gICAgICAgICAgICAgICAgbG9hZGVkOiB0aGlzLmdldExvYWRlZChvZmZzZXQpLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBvZmZzZXQgPyAwIDogdGhpcy5nZXRQb3NpdGlvbigpLFxuICAgICAgICAgICAgICAgIHBsYXllZDogb2Zmc2V0ID8gMCA6IHRoaXMuZ2V0UGxheWVkKClcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIob3V0ZXJFdmVudCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG59O1xuXG4vKipcbiAqINCT0LXQvdC10YDQsNGG0LjRjyBwbGF5SWRcbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5fZ2VuZXJhdGVQbGF5SWQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl9wbGF5SWQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKCkuc2xpY2UoMik7XG59O1xuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQ29tbW9uXG4vKipcbiAqINCS0L7Qt9Cy0YDQsNGJ0LDQtdGCINC+0LHQtdGJ0LDQvdC40LUsINGA0LDQt9GA0LXRiNCw0Y7RidC10LXRgdGPINC/0L7RgdC70LUg0LfQsNCy0LXRgNGI0LXQvdC40Y8g0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LguXG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLmluaXRQcm9taXNlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMud2hlblJlYWR5O1xufTtcblxuLyoqXG4gKiDQktC+0LfQstGA0LDRidCw0LXRgiDRgdGC0LDRgtGD0YEg0L/Qu9C10LXRgNCwXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0U3RhdGUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZTtcbn07XG5cbi8qKlxuICog0JLQvtC30LLRgNCw0YnQsNC10YIg0YLQuNC/INGA0LXQsNC70LjQt9Cw0YbQuNC4INC/0LvQtdC10YDQsFxuICogQHJldHVybnMge1N0cmluZ3xudWxsfVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0VHlwZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uICYmIHRoaXMuaW1wbGVtZW50YXRpb24udHlwZTtcbn07XG5cbi8qKlxuICog0JLQvtC30LLRgNCw0YnQsNC10YIg0YHRgdGL0LvQutGDINC90LAg0YLQtdC60YPRidC40Lkg0YLRgNC10LpcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0g0LHRgNCw0YLRjCDRgtGA0LXQuiDQuNC3INCw0LrRgtC40LLQvdC+0LPQviDQv9C70LXQtdGA0LAg0LjQu9C4INC40Lcg0L/RgNC10LvQvtCw0LTQtdGA0LAuIDAgLSDQsNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAsIDEgLSDQv9GA0LXQu9C+0LDQtNC10YAuXG4gKiBAcmV0dXJucyB7SUF1ZGlvSW1wbGVtZW50YXRpb258bnVsbH1cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLmdldFNyYyA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uICYmIHRoaXMuaW1wbGVtZW50YXRpb24uZ2V0U3JjKG9mZnNldCk7XG59O1xuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gUGxheWJhY2tcblxuLyoqXG4gKiDQl9Cw0L/Rg9GB0Log0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dIC0g0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LAuINCQ0LrRgtGD0LDQu9GM0L3QviDQtNC70Y8g0YTQu9C10Ygt0YDQtdCw0LvQuNC30LDRhtC40LgsINCyINC90LXQuSDQv9C+0LrQsCDRgtGA0LXQuiDQs9GA0YPQt9C40YLRgdGPXG4gKiDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0L7Qv9GA0LXQtNC10LvRj9C10YLRgdGPINGBINC/0L7Qs9GA0LXRiNC90L7RgdGC0YzRji5cbiAqIEByZXR1cm5zIHtBYm9ydGFibGVQcm9taXNlfVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUucGxheSA9IGZ1bmN0aW9uKHNyYywgZHVyYXRpb24pIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInBsYXlcIiwgc3JjLCBkdXJhdGlvbik7XG5cbiAgICB0aGlzLl9wbGF5ZWQgPSAwO1xuICAgIHRoaXMuX2xhc3RTa2lwID0gMDtcbiAgICB0aGlzLl9nZW5lcmF0ZVBsYXlJZCgpO1xuXG4gICAgaWYgKHRoaXMuX3doZW5QbGF5KSB7XG4gICAgICAgIHRoaXMuX3doZW5QbGF5LnJlamVjdChcInBsYXlcIik7XG4gICAgfVxuICAgIGlmICh0aGlzLl93aGVuUGF1c2UpIHtcbiAgICAgICAgdGhpcy5fd2hlblBhdXNlLnJlamVjdChcInBsYXlcIik7XG4gICAgfVxuICAgIGlmICh0aGlzLl93aGVuU3RvcCkge1xuICAgICAgICB0aGlzLl93aGVuU3RvcC5yZWplY3QoXCJwbGF5XCIpO1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlID0gdGhpcy5fd2FpdEV2ZW50cyhcIl93aGVuUGxheVwiLCBbQXVkaW9QbGF5ZXIuRVZFTlRfUExBWV0sIFtcbiAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfU1RPUCxcbiAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfRVJST1IsXG4gICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX0NSQVNIRURcbiAgICBdKTtcblxuICAgIHByb21pc2UuYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuX3doZW5QbGF5KSB7XG4gICAgICAgICAgICB0aGlzLl93aGVuUGxheS5yZWplY3QuYXBwbHkodGhpcy5fd2hlblBsYXksIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgfVxuICAgIH0uYmluZCh0aGlzKTtcblxuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucGxheShzcmMsIGR1cmF0aW9uKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQntGB0YLQsNC90L7QstC60LAg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtINCw0LrRgtC40LLQvdGL0Lkg0L/Qu9C10LXRgCDQuNC70Lgg0L/RgNC10LvQvtCw0LTQtdGALiAwIC0g0LDQutGC0LjQstC90YvQuSDQv9C70LXQtdGALiAxIC0g0L/RgNC10LvQvtCw0LTQtdGALlxuICogQHJldHVybnMge0Fib3J0YWJsZVByb21pc2V9XG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24ob2Zmc2V0KSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJzdG9wXCIsIG9mZnNldCk7XG5cbiAgICBpZiAob2Zmc2V0ICE9PSAwKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uLnN0b3Aob2Zmc2V0KTtcbiAgICB9XG5cbiAgICB0aGlzLl9wbGF5ZWQgPSAwO1xuICAgIHRoaXMuX2xhc3RTa2lwID0gMDtcblxuICAgIGlmICh0aGlzLl93aGVuUGxheSkge1xuICAgICAgICB0aGlzLl93aGVuUGxheS5yZWplY3QoXCJzdG9wXCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHRoaXMuX3doZW5QYXVzZS5yZWplY3QoXCJzdG9wXCIpO1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlO1xuICAgIGlmICh0aGlzLl93aGVuU3RvcCkge1xuICAgICAgICBwcm9taXNlID0gdGhpcy5fd2hlblN0b3AucHJvbWlzZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHByb21pc2UgPSB0aGlzLl93YWl0RXZlbnRzKFwiX3doZW5TdG9wXCIsIFtBdWRpb1BsYXllci5FVkVOVF9TVE9QXSwgW1xuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfUExBWSxcbiAgICAgICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX0VSUk9SLFxuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfQ1JBU0hFRFxuICAgICAgICBdKTtcbiAgICB9XG5cbiAgICB0aGlzLmltcGxlbWVudGF0aW9uLnN0b3AoKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQn9C+0YHRgtCw0LLQuNGC0Ywg0L/Qu9C10LXRgCDQvdCwINC/0LDRg9C30YNcbiAqIEByZXR1cm5zIHtBYm9ydGFibGVQcm9taXNlfVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInBhdXNlXCIpO1xuXG4gICAgaWYgKHRoaXMuc3RhdGUgIT09IEF1ZGlvUGxheWVyLlNUQVRFX1BMQVlJTkcpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgQXVkaW9FcnJvcihBdWRpb0Vycm9yLkJBRF9TVEFURSkpO1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlO1xuXG4gICAgaWYgKHRoaXMuX3doZW5QbGF5KSB7XG4gICAgICAgIHRoaXMuX3doZW5QbGF5LnJlamVjdChcInBhdXNlXCIpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl93aGVuUGF1c2UpIHtcbiAgICAgICAgcHJvbWlzZSA9IHRoaXMuX3doZW5QYXVzZS5wcm9taXNlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblBhdXNlXCIsIFtBdWRpb1BsYXllci5FVkVOVF9QQVVTRV0sIFtcbiAgICAgICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX1NUT1AsXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9QTEFZLFxuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfRVJST1IsXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEXG4gICAgICAgIF0pO1xuICAgIH1cblxuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucGF1c2UoKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQodC90Y/RgtC40LUg0L/Qu9C10LXRgNCwINGBINC/0LDRg9C30YtcbiAqIEByZXR1cm5zIHtBYm9ydGFibGVQcm9taXNlfVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJyZXN1bWVcIik7XG5cbiAgICBpZiAodGhpcy5zdGF0ZSA9PT0gQXVkaW9QbGF5ZXIuU1RBVEVfUExBWUlORyAmJiAhdGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBpZiAoISh0aGlzLnN0YXRlID09PSBBdWRpb1BsYXllci5TVEFURV9JRExFIHx8IHRoaXMuc3RhdGUgPT09IEF1ZGlvUGxheWVyLlNUQVRFX1BBVVNFRCB8fCB0aGlzLnN0YXRlXG4gICAgICAgID09PSBBdWRpb1BsYXllci5TVEFURV9QTEFZSU5HKSkge1xuICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBBdWRpb0Vycm9yKEF1ZGlvRXJyb3IuQkFEX1NUQVRFKSk7XG4gICAgfVxuXG4gICAgdmFyIHByb21pc2U7XG5cbiAgICBpZiAodGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHRoaXMuX3doZW5QYXVzZS5yZWplY3QoXCJyZXN1bWVcIik7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3doZW5QbGF5KSB7XG4gICAgICAgIHByb21pc2UgPSB0aGlzLl93aGVuUGxheS5wcm9taXNlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblBsYXlcIiwgW0F1ZGlvUGxheWVyLkVWRU5UX1BMQVldLCBbXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9TVE9QLFxuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfRVJST1IsXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEXG4gICAgICAgIF0pO1xuICAgIH1cblxuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucmVzdW1lKCk7XG5cbiAgICByZXR1cm4gcHJvbWlzZTtcbn07XG5cbi8vYWJvcnRhYmxlXG4vKipcbiAqINCX0LDQv9GD0YHQuiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8g0L/RgNC10LTQt9Cw0LPRgNGD0LbQtdC90L3QvtCz0L4g0YLRgNC10LrQsFxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcmV0dXJucyB7QWJvcnRhYmxlUHJvbWlzZX1cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLnBsYXlQcmVsb2FkZWQgPSBmdW5jdGlvbihzcmMpIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInBsYXlQcmVsb2FkZWRcIiwgc3JjKTtcblxuICAgIGlmICghdGhpcy5pc1ByZWxvYWRlZChzcmMpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwicGxheVByZWxvYWRlZEJhZFRyYWNrXCIsIEF1ZGlvRXJyb3IuTk9UX1BSRUxPQURFRCk7XG4gICAgICAgIHJldHVybiByZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5OT1RfUFJFTE9BREVEKSk7XG4gICAgfVxuXG4gICAgdGhpcy5fcGxheWVkID0gMDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IDA7XG4gICAgdGhpcy5fZ2VuZXJhdGVQbGF5SWQoKTtcblxuICAgIGlmICh0aGlzLl93aGVuUGxheSkge1xuICAgICAgICB0aGlzLl93aGVuUGxheS5yZWplY3QoXCJwbGF5UHJlbG9hZGVkXCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHRoaXMuX3doZW5QYXVzZS5yZWplY3QoXCJwbGF5UHJlbG9hZGVkXCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblN0b3ApIHtcbiAgICAgICAgdGhpcy5fd2hlblN0b3AucmVqZWN0KFwicGxheVByZWxvYWRlZFwiKTtcbiAgICB9XG5cbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblBsYXlcIiwgW0F1ZGlvUGxheWVyLkVWRU5UX1BMQVldLCBbXG4gICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX1NUT1AsXG4gICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX0VSUk9SLFxuICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEXG4gICAgXSk7XG4gICAgcHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fd2hlblBsYXkpIHtcbiAgICAgICAgICAgIHRoaXMuX3doZW5QbGF5LnJlamVjdC5hcHBseSh0aGlzLl93aGVuUGxheSwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICB9XG4gICAgfS5iaW5kKHRoaXMpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMuaW1wbGVtZW50YXRpb24ucGxheVByZWxvYWRlZCgpO1xuXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4odGhpcywgXCJwbGF5UHJlbG9hZGVkRXJyb3JcIiwgQXVkaW9FcnJvci5OT1RfUFJFTE9BREVEKTtcbiAgICAgICAgdGhpcy5fd2hlblBsYXkucmVqZWN0KG5ldyBBdWRpb0Vycm9yKEF1ZGlvRXJyb3IuTk9UX1BSRUxPQURFRCkpO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIFByZWxvYWRcbi8vYWJvcnRhYmxlXG4vKipcbiAqINCf0YDQtdC00LfQsNCz0YDRg9C30LrQsCDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dIC0g0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LAuINCQ0LrRgtGD0LDQu9GM0L3QviDQtNC70Y8g0YTQu9C10Ygt0YDQtdCw0LvQuNC30LDRhtC40LgsINCyINC90LXQuSDQv9C+0LrQsCDRgtGA0LXQuiDQs9GA0YPQt9C40YLRgdGPXG4gKiDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0L7Qv9GA0LXQtNC10LvRj9C10YLRgdGPINGBINC/0L7Qs9GA0LXRiNC90L7RgdGC0YzRji5cbiAqIEByZXR1cm5zIHtQcm9taXNlfVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUucHJlbG9hZCA9IGZ1bmN0aW9uKHNyYywgZHVyYXRpb24pIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInByZWxvYWRcIiwgc3JjLCBkdXJhdGlvbik7XG5cbiAgICBpZiAodGhpcy5fd2hlblByZWxvYWQpIHtcbiAgICAgICAgdGhpcy5fd2hlblByZWxvYWQucmVqZWN0KFwicHJlbG9hZFwiKTtcbiAgICB9XG5cbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblByZWxvYWRcIiwgW1xuICAgICAgICBBdWRpb1BsYXllci5QUkVMT0FERVJfRVZFTlQgKyBBdWRpb1BsYXllci5FVkVOVF9MT0FESU5HLFxuICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9TV0FQXG4gICAgXSwgW1xuICAgICAgICBBdWRpb1BsYXllci5QUkVMT0FERVJfRVZFTlQgKyBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVELFxuICAgICAgICBBdWRpb1BsYXllci5QUkVMT0FERVJfRVZFTlQgKyBBdWRpb1BsYXllci5FVkVOVF9FUlJPUixcbiAgICAgICAgQXVkaW9QbGF5ZXIuUFJFTE9BREVSX0VWRU5UICsgQXVkaW9QbGF5ZXIuRVZFTlRfU1RPUFxuICAgIF0pO1xuXG4gICAgcHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fd2hlblByZWxvYWQpIHtcbiAgICAgICAgICAgIHRoaXMuX3doZW5QcmVsb2FkLnJlamVjdC5hcHBseSh0aGlzLl93aGVuUHJlbG9hZCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcCgxKTtcbiAgICAgICAgfVxuICAgIH0uYmluZCh0aGlzKTtcblxuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucHJlbG9hZChzcmMsIGR1cmF0aW9uKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQn9GA0L7QstC10YDQutCwLCDRh9GC0L4g0YLRgNC10Log0L/RgNC10LTQt9Cw0LPRgNGD0LbQtdC9XG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLmlzUHJlbG9hZGVkID0gZnVuY3Rpb24oc3JjKSB7XG4gICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb24uaXNQcmVsb2FkZWQoc3JjKTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LrQsCwg0YfRgtC+INGC0YDQtdC6INC/0YDQtdC00LfQsNCz0YDRg9C20LDQtdGC0YHRj1xuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5pc1ByZWxvYWRpbmcgPSBmdW5jdGlvbihzcmMpIHtcbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5pc1ByZWxvYWRpbmcoc3JjLCAxKTtcbn07XG5cbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBUaW1pbmdzXG4vKipcbiAqINCf0L7Qu9GD0YfQtdC90LjQtSDQv9C+0LfQuNGG0LjQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5nZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uLmdldFBvc2l0aW9uKCk7XG59O1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LrQsCDQv9C+0LfQuNGG0LjQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEBwYXJhbSB7TnVtYmVyfSBwb3NpdGlvbiAtINC90L7QstCw0Y8g0L/QvtC30LjRhtC40Y8g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcmV0dXJucyB7TnVtYmVyfSAtLSDQutC+0L3QtdGH0L3QsNGPINC/0L7Qt9C40YbQuNGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuc2V0UG9zaXRpb24gPSBmdW5jdGlvbihwb3NpdGlvbikge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwic2V0UG9zaXRpb25cIiwgcG9zaXRpb24pO1xuXG4gICAgaWYgKHRoaXMuaW1wbGVtZW50YXRpb24udHlwZSA9PSBcImZsYXNoXCIpIHtcbiAgICAgICAgcG9zaXRpb24gPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLmdldExvYWRlZCgpLCBwb3NpdGlvbikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHBvc2l0aW9uID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5nZXREdXJhdGlvbigpLCBwb3NpdGlvbikpO1xuICAgIH1cblxuICAgIHRoaXMuX3BsYXllZCArPSB0aGlzLmdldFBvc2l0aW9uKCkgLSB0aGlzLl9sYXN0U2tpcDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IHBvc2l0aW9uO1xuXG4gICAgdGhpcy5pbXBsZW1lbnRhdGlvbi5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cbiAgICByZXR1cm4gcG9zaXRpb247XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQtdC90LjQtSDQtNC70LjRgtC10LvRjNC90L7RgdGC0Lgg0YLRgNC10LrQsFxuICogQHBhcmFtIHtCb29sZWFufGludH0gcHJlbG9hZGVyIC0g0LDQutGC0LjQstC90YvQuSDQv9C70LXQtdGAINC40LvQuCDQv9GA0LXQtNC30LDQs9GA0YPQt9GH0LjQui4gMCAtINCw0LrRgtC40LLQvdGL0Lkg0L/Qu9C10LXRgCwgMSAtINC/0YDQtdC00LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7TnVtYmVyfVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0RHVyYXRpb24gPSBmdW5jdGlvbihwcmVsb2FkZXIpIHtcbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5nZXREdXJhdGlvbihwcmVsb2FkZXIgPyAxIDogMCk7XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQtdC90LjQtSDQtNC70LjRgtC10LvRjNC90L7RgdGC0Lgg0LfQsNCz0YDRg9C20LXQvdC90L7QuSDRh9Cw0YHRgtC4XG4gKiBAcGFyYW0ge0Jvb2xlYW58aW50fSBwcmVsb2FkZXIgLSDQsNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAg0LjQu9C4INC/0YDQtdC00LfQsNCz0YDRg9C30YfQuNC6LiAwIC0g0LDQutGC0LjQstC90YvQuSDQv9C70LXQtdGALCAxIC0g0L/RgNC10LTQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5nZXRMb2FkZWQgPSBmdW5jdGlvbihwcmVsb2FkZXIpIHtcbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5nZXRMb2FkZWQocHJlbG9hZGVyID8gMSA6IDApO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LXQvdC40LUg0LTQu9C40YLQtdC70YzQvdC+0YHRgtC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICogQHJldHVybnMge051bWJlcn1cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLmdldFBsYXllZCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBwb3NpdGlvbiA9IHRoaXMuZ2V0UG9zaXRpb24oKTtcbiAgICB0aGlzLl9wbGF5ZWQgKz0gcG9zaXRpb24gLSB0aGlzLl9sYXN0U2tpcDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IHBvc2l0aW9uO1xuXG4gICAgcmV0dXJuIHRoaXMuX3BsYXllZDtcbn07XG5cbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBWb2x1bWVcbi8qKlxuICog0J/QvtC70YPRh9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLQuCDQv9C70LXQtdGA0LBcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5nZXRWb2x1bWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuaW1wbGVtZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb24uZ2V0Vm9sdW1lKCk7XG59O1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LrQsCDQs9GA0L7QvNC60L7RgdGC0Lgg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge051bWJlcn0gdm9sdW1lIC0g0L3QvtCy0L7QtSDQt9C90LDRh9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLQuFxuICogQHJldHVybnMge051bWJlcn0gLS0g0LjRgtC+0LPQvtCy0L7QtSDQt9C90LDRh9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLQuFxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuc2V0Vm9sdW1lID0gZnVuY3Rpb24odm9sdW1lKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJzZXRWb2x1bWVcIiwgdm9sdW1lKTtcblxuICAgIGlmICghdGhpcy5pbXBsZW1lbnRhdGlvbikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5zZXRWb2x1bWUodm9sdW1lKTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LrQsCwg0YfRgtC+INCz0YDQvtC80LrQvtGB0YLRjCDRg9C/0YDQsNCy0LvRj9C10YLRgdGPINGD0YHRgtGA0L7QudGB0YLQstC+0LwsINCwINC90LUg0L/RgNC+0LPRgNCw0LzQvdC+XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLmlzRGV2aWNlVm9sdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLmltcGxlbWVudGF0aW9uKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uLmlzRGV2aWNlVm9sdW1lKCk7XG59O1xuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gV2ViIEF1ZGlvIEFQSVxuLyoqXG4gKiDQn9C10YDQtdC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINC40YHQv9C+0LvRjNC30L7QstCw0L3QuNGPIFdlYiBBdWRpbyBBUEkuINCU0L7RgdGC0YPQv9C10L0g0YLQvtC70YzQutC+INC/0YDQuCBodG1sNS3RgNC10LDQu9C40LfQsNGG0LjQuCDQv9C70LXQtdGA0LAuXG4gKlxuICogKirQktC90LjQvNCw0L3QuNC1ISoqIC0g0L/QvtGB0LvQtSDQstC60LvRjtGH0LXQvdC40Y8g0YDQtdC20LjQvNCwIFdlYiBBdWRpbyBBUEkg0L7QvSDQvdC1INC+0YLQutC70Y7Rh9Cw0LXRgtGB0Y8g0L/QvtC70L3QvtGB0YLRjNGOLCDRgi7Qui4g0LTQu9GPINGN0YLQvtCz0L4g0YLRgNC10LHRg9C10YLRgdGPXG4gKiDRgNC10LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0L/Qu9C10LXRgNCwLCDQutC+0YLQvtGA0L7QuSDRgtGA0LXQsdGD0LXRgtGB0Y8g0LrQu9C40Log0L/QvtC70YzQt9C+0LLQsNGC0LXQu9GPLiDQn9GA0Lgg0L7RgtC60LvRjtGH0LXQvdC40Lgg0LjQtyDQs9GA0LDRhNCwINC+0LHRgNCw0LHQvtGC0LrQuCDQuNGB0LrQu9GO0YfQsNGO0YLRgdGPXG4gKiDQstGB0LUg0L3QvtC00Ysg0LrRgNC+0LzQtSDQvdC+0LQt0LjRgdGC0L7Rh9C90LjQutC+0LIg0Lgg0L3QvtC00Ysg0LLRi9Cy0L7QtNCwLCDRg9C/0YDQsNCy0LvQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0YzRjiDQv9C10YDQtdC60LvRjtGH0LDQtdGC0YHRjyDQvdCwINGN0LvQtdC80LXQvdGC0YsgYXVkaW8sINCx0LXQt1xuICog0LjRgdC/0L7Qu9GM0LfQvtCy0LDQvdC40Y8gR2Fpbk5vZGVcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gc3RhdGUgLSDQt9Cw0L/RgNCw0YjQuNCy0LDQtdC80YvQuSDRgdGC0LDRgtGD0YFcbiAqIEByZXR1cm5zIHtCb29sZWFufSAtLSDQuNGC0L7Qs9C+0LLRi9C5INGB0YLQsNGC0YPRgSDQv9C70LXQtdGA0LBcbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLnRvZ2dsZVdlYkF1ZGlvQVBJID0gZnVuY3Rpb24oc3RhdGUpIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInRvZ2dsZVdlYkF1ZGlvQVBJXCIsIHN0YXRlKTtcbiAgICBpZiAodGhpcy5pbXBsZW1lbnRhdGlvbi50eXBlICE9PSBcImh0bWw1XCIpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4odGhpcywgXCJ0b2dnbGVXZWJBdWRpb0FQSUZhaWxlZFwiLCB0aGlzLmltcGxlbWVudGF0aW9uLnR5cGUpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb24udG9nZ2xlV2ViQXVkaW9BUEkoc3RhdGUpO1xufTtcblxuLyoqXG4gKiDQkNGD0LTQuNC+LdC/0YDQtdC/0YDQvtGG0LXRgdGB0L7RgFxuICogQHR5cGVkZWYge09iamVjdH0geWEuQXVkaW9+QXVkaW9QcmVwcm9jZXNzb3JcbiAqXG4gKiBAcHJvcGVydHkge0F1ZGlvTm9kZX0gaW5wdXQgLSDQvdC+0LTQsCwg0LIg0LrQvtGC0L7RgNGD0Y4g0L/QtdGA0LXQvdCw0L/RgNCw0LLQu9GP0LXRgtGB0Y8g0LLRi9Cy0L7QtCDQsNGD0LTQuNC+XG4gKiBAcHJvcGVydHkge0F1ZGlvTm9kZX0gb3V0cHV0IC0g0L3QvtC00LAg0LjQtyDQutC+0YLQvtGA0L7QuSDQstGL0LLQvtC0INC/0L7QtNCw0ZHRgtGB0Y8g0L3QsCDRg9GB0LjQu9C40YLQtdC70YxcbiAqL1xuXG4vKipcbiAqINCf0L7QtNC60LvRjtGH0LXQvdC40LUg0LDRg9C00LjQviDQv9GA0LXQv9GA0L7RhtC10YHRgdC+0YDQsC4g0JLRhdC+0LQg0L/RgNC10L/RgNC+0YbQtdGB0YHQvtGA0LAg0L/QvtC00LrQu9GO0YfQsNC10YLRgdGPINC6INCw0YPQtNC40L4t0Y3Qu9C10LzQtdC90YLRgyDRgyDQutC+0YLQvtGA0L7Qs9C+INCy0YvRgdGC0LDQstC70LXQvdCwXG4gKiAxMDAlINCz0YDQvtC80LrQvtGB0YLRjC4g0JLRi9GF0L7QtCDQv9GA0LXQv9GA0L7RhtC10YHRgdC+0YDQsCDQv9C+0LTQutC70Y7Rh9Cw0LXRgtGB0Y8g0LogR2Fpbk5vZGUsINC60L7RgtC+0YDQsNGPINGA0LXQs9GD0LvQuNGA0YPQtdGCINC40YLQvtCz0L7QstGD0Y4g0LPRgNC+0LzQutC+0YHRgtGMXG4gKiBAcGFyYW0ge3lhLkF1ZGlvfkF1ZGlvUHJlcHJvY2Vzc29yfSBwcmVwcm9jZXNzb3IgLSDQv9GA0LXQv9GA0L7RhtC10YHRgdC+0YBcbiAqIEByZXR1cm5zIHtib29sZWFufSAtLSDRgdGC0LDRgtGD0YEg0YPRgdC/0LXRhdCwXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5zZXRBdWRpb1ByZXByb2Nlc3NvciA9IGZ1bmN0aW9uKHByZXByb2Nlc3Nvcikge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwic2V0QXVkaW9QcmVwcm9jZXNzb3JcIik7XG4gICAgaWYgKHRoaXMuaW1wbGVtZW50YXRpb24udHlwZSAhPT0gXCJodG1sNVwiKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwic2V0QXVkaW9QcmVwcm9jZXNzb3JGYWlsZWRcIiwgdGhpcy5pbXBsZW1lbnRhdGlvbi50eXBlKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uLnNldEF1ZGlvUHJlcHJvY2Vzc29yKHByZXByb2Nlc3Nvcik7XG59O1xuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gUGxheUlkXG4vKipcbiAqINCf0L7Qu9GD0YfQtdC90LjQtSBwbGF5SWRcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5nZXRQbGF5SWQgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fcGxheUlkO1xufTtcblxuLyoqXG4gKiDQktGB0L/QvtC80L7Qs9Cw0YLQtdC70YzQvdCw0Y8g0YTRg9C90LrRhtC40Y8g0LTQu9GPINC+0YLQvtCx0YDQsNC20LXQvdC40Y8g0YHQvtGB0YLQvtGP0L3QuNGPINC/0LvQtdC10YDQsCDQsiDQu9C+0LPQtS5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5fbG9nZ2VyID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgaW5kZXg6IHRoaXMuaW1wbGVtZW50YXRpb24gJiYgdGhpcy5pbXBsZW1lbnRhdGlvbi5uYW1lLFxuICAgICAgICBzcmM6IHRoaXMuaW1wbGVtZW50YXRpb24gJiYgdGhpcy5pbXBsZW1lbnRhdGlvbi5fbG9nZ2VyKCksXG4gICAgICAgIHR5cGU6IHRoaXMuaW1wbGVtZW50YXRpb24gJiYgdGhpcy5pbXBsZW1lbnRhdGlvbi50eXBlXG4gICAgfTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQXVkaW9QbGF5ZXI7XG4iLCIvKipcbiAqIEBuYW1lc3BhY2UgQXVkaW9TdGF0aWNcbiAqIEBwcml2YXRlXG4gKi9cbnZhciBBdWRpb1N0YXRpYyA9IHt9O1xuXG4vKiogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdCovXG5BdWRpb1N0YXRpYy5FVkVOVF9QTEFZID0gXCJwbGF5XCI7XG4vKiogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdCAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfU1RPUCA9IFwic3RvcFwiO1xuXG4vKiogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdCAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfUEFVU0UgPSBcInBhdXNlXCI7XG4vKiogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdCAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfUFJPR1JFU1MgPSBcInByb2dyZXNzXCI7XG5cbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5FVkVOVF9MT0FESU5HID0gXCJsb2FkaW5nXCI7XG4vKiogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdCAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfTE9BREVEID0gXCJsb2FkZWRcIjtcblxuLyoqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3QgKi9cbkF1ZGlvU3RhdGljLkVWRU5UX1ZPTFVNRSA9IFwidm9sdW1lY2hhbmdlXCI7XG5cbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5FVkVOVF9FTkRFRCA9IFwiZW5kZWRcIjtcbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5FVkVOVF9DUkFTSEVEID0gXCJjcmFzaGVkXCI7XG4vKiogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdCAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfRVJST1IgPSBcImVycm9yXCI7XG5cbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5FVkVOVF9TVEFURSA9IFwic3RhdGVcIjtcbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5FVkVOVF9TV0FQID0gXCJzd2FwXCI7XG5cbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5QUkVMT0FERVJfRVZFTlQgPSBcInByZWxvYWRlcjpcIjtcblxuLyoqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3QgKi9cbkF1ZGlvU3RhdGljLlNUQVRFX0lOSVQgPSBcImluaXRcIjtcbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5TVEFURV9DUkFTSEVEID0gXCJjcmFzaGVkXCI7XG4vKiogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdCAqL1xuQXVkaW9TdGF0aWMuU1RBVEVfSURMRSA9IFwiaWRsZVwiO1xuLyoqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3QgKi9cbkF1ZGlvU3RhdGljLlNUQVRFX1BMQVlJTkcgPSBcInBsYXlpbmdcIjtcbi8qKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0ICovXG5BdWRpb1N0YXRpYy5TVEFURV9QQVVTRUQgPSBcInBhdXNlZFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEF1ZGlvU3RhdGljO1xuIiwiLyoqXG4gKiDQndCw0YHRgtC+0LnQutC4INCx0LjQsdC70LjQvtGC0LXQutC4XG4gKiBAYWxpYXMgeWEuQXVkaW8uY29uZmlnXG4gKiBAbmFtZXNwYWNlXG4gKi9cbnZhciBjb25maWcgPSB7XG4gICAgLyoqXG4gICAgICog0J7QsdGJ0LjQtSDQvdCw0YHRgtGA0L7QudC60LhcbiAgICAgKiBAbmFtZXNwYWNlXG4gICAgICovXG4gICAgYXVkaW86IHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqINCa0L7Qu9C40YfQtdGB0YLQstC+INC/0L7Qv9GL0YLQvtC6INGA0LXQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuFxuICAgICAgICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgcmV0cnk6IDNcbiAgICB9LFxuICAgIC8qKlxuICAgICAqINCd0LDRgdGC0YDQvtC50LrQuCDQv9C+0LTQutC70Y7Rh9C10L3QuNGPIGZsYXNoLdC/0LvQtdC10YDQsFxuICAgICAqIEBuYW1lc3BhY2VcbiAgICAgKi9cbiAgICBmbGFzaDoge1xuICAgICAgICAvKipcbiAgICAgICAgICog0J/Rg9GC0Ywg0LogLnN3ZiDRhNCw0LnQu9GDINGE0LvQtdGILdC/0LvQtdC10YDQsFxuICAgICAgICAgKiBAdHlwZSB7U3RyaW5nfVxuICAgICAgICAgKi9cbiAgICAgICAgcGF0aDogXCJkaXN0XCIsXG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQmNC80Y8gLnN3ZiDRhNCw0LnQu9CwINGE0LvQtdGILdC/0LvQtdC10YDQsFxuICAgICAgICAgKiBAdHlwZSB7U3RyaW5nfVxuICAgICAgICAgKi9cbiAgICAgICAgbmFtZTogXCJwbGF5ZXItMl8wLnN3ZlwiLFxuICAgICAgICAvKipcbiAgICAgICAgICog0JzQuNC90LjQvNCw0LvRjNC90LDRjyDQstC10YDRgdC40Y8g0YTQu9C10Ygt0L/Qu9C10LXRgNCwXG4gICAgICAgICAqIEB0eXBlIHtTdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICB2ZXJzaW9uOiBcIjkuMC4yOFwiLFxuICAgICAgICAvKipcbiAgICAgICAgICogSUQsINC60L7RgtC+0YDRi9C5INCx0YPQtNC10YIg0LLRi9GB0YLQsNCy0LvQtdC9INC00LvRjyDRjdC70LXQvNC10L3RgtCwINGBIGZsYXNoLdC/0LvQtdC10YDQvtC8XG4gICAgICAgICAqIEB0eXBlIHtTdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICBwbGF5ZXJJRDogXCJZYW5kZXhBdWRpb0ZsYXNoUGxheWVyXCIsXG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQmNC80Y8g0YTRg9C90LrRhtC40Lgt0L7QsdGA0LDQsdC+0YLRh9C40LrQsCDRgdC+0LHRi9GC0LjQuSBmbGFzaC3Qv9C70LXQtdGA0LBcbiAgICAgICAgICogQHR5cGUge1N0cmluZ31cbiAgICAgICAgICogQGNvbnN0XG4gICAgICAgICAqL1xuICAgICAgICBjYWxsYmFjazogXCJ5YS5BdWRpby5fZmxhc2hDYWxsYmFja1wiLFxuICAgICAgICAvKipcbiAgICAgICAgICog0KLQsNC50LzQsNGD0YIg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LhcbiAgICAgICAgICogQHR5cGUge051bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIGluaXRUaW1lb3V0OiAzMDAwLCAvLyAzIHNlY1xuICAgICAgICAvKipcbiAgICAgICAgICog0KLQsNC50LzQsNGD0YIg0LfQsNCz0YDRg9C30LrQuFxuICAgICAgICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgbG9hZFRpbWVvdXQ6IDUwMDAsXG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQotCw0LnQvNCw0YPRgiDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuCDQv9C+0YHQu9C1INC60LvQuNC60LBcbiAgICAgICAgICogQHR5cGUge051bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIGNsaWNrVGltZW91dDogMTAwMCxcbiAgICAgICAgLyoqXG4gICAgICAgICAqINCY0L3RgtC10YDQstCw0Lsg0L/RgNC+0LLQtdGA0LrQuCDQtNC+0YHRgtGD0L/QvdC+0YHRgtC4IGZsYXNoLdC/0LvQtdC10YDQsFxuICAgICAgICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgaGVhcnRCZWF0SW50ZXJ2YWw6IDEwMDBcbiAgICB9LFxuICAgIC8qKlxuICAgICAqINCe0L/QuNGB0LDQvdC40LUg0L3QsNGB0YLRgNC+0LXQuiBodG1sNSDQv9C70LXQtdGA0LBcbiAgICAgKiBAbmFtZXNwYWNlXG4gICAgICovXG4gICAgaHRtbDU6IHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqINCh0L/QuNGB0L7QuiDQuNC00LXQvdGC0LjRhNC40LrQsNGC0L7RgNC+0LIg0LTQu9GPINC60L7RgtC+0YDRi9GFINC70YPRh9GI0LUg0L3QtSDQuNGB0L/QvtC70YzQt9C+0LLQsNGC0YwgaHRtbDUg0L/Qu9C10LXRgC4g0JjRgdC/0L7Qu9GM0LfRg9C10YLRgdGPINC/0YDQuFxuICAgICAgICAgKiDQsNCy0YLQvi3QvtC/0YDQtdC00LXQu9C10L3QuNC4INGC0LjQv9CwINC/0LvQtdC10YDQsC4g0JjQtNC10L3RgtC40YTQuNC60LDRgtC+0YDRiyDRgdGA0LDQstC90LjQstCw0Y7RgtGB0Y8g0YHQviDRgdGC0YDQvtC60L7QuSDQv9C+0YHRgtGA0L7QtdC90L3QvtC5INC/0L4g0YjQsNCx0LvQvtC90YNcbiAgICAgICAgICogYEA8cGxhdGZvcm0udmVyc2lvbj4gPHBsYXRmb3JtLm9zPjo8YnJvd3Nlci5uYW1lPi88YnJvd3Nlci52ZXJzaW9uPmBcbiAgICAgICAgICogQHR5cGUge0FycmF5LjxOdW1iZXI+fVxuICAgICAgICAgKi9cbiAgICAgICAgYmxhY2tsaXN0OiBbXCJsaW51eDptb3ppbGxhXCIsIFwidW5peDptb3ppbGxhXCIsIFwibWFjb3M6bW96aWxsYVwiLCBcIjpvcGVyYVwiLCBcIkBOVCA1XCIsIFwiQE5UIDRcIl1cbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbmZpZztcbiIsInZhciBFcnJvckNsYXNzID0gcmVxdWlyZSgnLi4vbGliL2NsYXNzL2Vycm9yLWNsYXNzJyk7XG5cbi8qKlxuICogQGNsYXNzINCa0LvQsNGB0YEg0L7RiNC40LHQutC4INCw0YPQtNC40L4t0L/Qu9C70LXQtdGA0LBcbiAqIEBhbGlhcyB5YS5BdWRpby5BdWRpb0Vycm9yXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgLSDRgtC10LrRgdGCINC+0YjQuNCx0LrQuFxuICpcbiAqIEBleHRlbmRzIEVycm9yXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBBdWRpb0Vycm9yID0gZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIEVycm9yQ2xhc3MuY2FsbCh0aGlzLCBtZXNzYWdlKTtcbn07XG5BdWRpb0Vycm9yLnByb3RvdHlwZSA9IEVycm9yQ2xhc3MuY3JlYXRlKFwiQXVkaW9FcnJvclwiKTtcblxuLyoqXG4gKiDQndC1INC90LDQudC00LXQvdCwINGA0LXQsNC70LjQt9Cw0YbQuNGPINC/0LvQtdC10YDQsCDQuNC70Lgg0LLRgdC1INC00L7RgdGC0YPQv9C90YvQtSDRgNC10LDQu9C40LfQsNGG0LjQuCDQv9C+0YLQtdGA0L/QtdC70Lgg0LrRgNCw0YUg0L/RgNC4INC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4LlxuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0Vycm9yLk5PX0lNUExFTUVOVEFUSU9OID0gXCJjYW5ub3QgZmluZCBzdWl0YWJsZSBpbXBsZW1lbnRhdGlvblwiO1xuLyoqXG4gKiDQotGA0LXQuiDQvdC1INCx0YvQuyDQv9GA0LXQtNC30LDQs9GA0YPQttC10L0g0LjQu9C4INCy0L4g0LLRgNC10LzRjyDQt9Cw0LPRgNGD0LfQutC4INC/0YDQvtC40LfQvtGI0LvQsCDQvtGI0LjQsdC60LAuXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvRXJyb3IuTk9UX1BSRUxPQURFRCA9IFwidHJhY2sgaXMgbm90IHByZWxvYWRlZFwiO1xuLyoqXG4gKiDQlNC10LnRgdGC0LLQuNC1INC90LUg0LTQvtGB0YLRg9C/0L3QviDQuNC3INGC0LXQutGD0YnQtdCz0L4g0YHQvtGB0YLQvtGP0L3QuNGPXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvRXJyb3IuQkFEX1NUQVRFID0gXCJhY3Rpb24gaXMgbm90IHBlcm1pdGVkIGZyb20gY3VycmVudCBzdGF0ZVwiO1xuXG4vKipcbiAqIEZsYXNoLdC/0LvQtdC10YAg0LHRi9C7INC30LDQsdC70L7QutC40YDQvtCy0LDQvVxuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0Vycm9yLkZMQVNIX0JMT0NLRVIgPSBcImZsYXNoIGlzIHJlamVjdGVkIGJ5IGZsYXNoIGJsb2NrZXIgcGx1Z2luXCI7XG4vKipcbiAqIEZsYXNoLdC/0LvQtdC10YAg0L/QvtGC0LXRgNC/0LXQuyDQutGA0LDRhSDQv9GA0Lgg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Lgg0L/QviDQvdC10LjQt9Cy0LXRgdGC0L3Ri9C8INC/0YDQuNGH0LjQvdCw0LxcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5GTEFTSF9VTktOT1dOX0NSQVNIID0gXCJmbGFzaCBpcyBjcmFzaGVkIHdpdGhvdXQgcmVhc29uXCI7XG4vKipcbiAqIEZsYXNoLdC/0LvQtdC10YAg0L/QvtGC0LXRgNC/0LXQuyDQutGA0LDRhSDQv9GA0Lgg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Lgg0LjQty3Qt9CwINGC0LDQudC80LDRg9GC0LBcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5GTEFTSF9JTklUX1RJTUVPVVQgPSBcImZsYXNoIGluaXQgdGltZWQgb3V0XCI7XG4vKipcbiAqINCS0L3Rg9GC0YDQtdC90L3Rj9GPINC+0YjQuNCx0LrQsCBGbGFzaC3Qv9C70LXQtdGA0LBcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5GTEFTSF9JTlRFUk5BTF9FUlJPUiA9IFwiZmxhc2ggaW50ZXJuYWwgZXJyb3JcIjtcbi8qKlxuICog0J/QvtC/0YvRgtC60LAg0LLRi9C30LLQsNGC0Ywg0L3QtdC00L7RgdGC0YPQv9C90YvQuSDRjdC60LfQtdC80LvRj9GAIEZsYXNoLdC/0LvQtdC10YDQsFxuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0Vycm9yLkZMQVNIX0VNTUlURVJfTk9UX0ZPVU5EID0gXCJmbGFzaCBldmVudCBlbW1pdGVyIG5vdCBmb3VuZFwiO1xuLyoqXG4gKiBGbGFzaC3Qv9C70LXQtdGAINC/0LXRgNC10YHRgtCw0Lsg0L7RgtCy0LXRh9Cw0YLRjCDQvdCwINC30LDQv9GA0L7RgdGLXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvRXJyb3IuRkxBU0hfTk9UX1JFU1BPTkRJTkcgPSBcImZsYXNoIHBsYXllciBkb2Vzbid0IHJlc3BvbnNlXCI7XG5cbm1vZHVsZS5leHBvcnRzID0gQXVkaW9FcnJvcjtcbiIsInJlcXVpcmUoJy4uL2V4cG9ydCcpO1xuXG52YXIgQXVkaW9FcnJvciA9IHJlcXVpcmUoJy4vYXVkaW8tZXJyb3InKTtcbnZhciBQbGF5YmFja0Vycm9yID0gcmVxdWlyZSgnLi9wbGF5YmFjay1lcnJvcicpO1xuXG55YS5BdWRpby5BdWRpb0Vycm9yID0gQXVkaW9FcnJvcjtcbnlhLkF1ZGlvLlBsYXliYWNrRXJyb3IgPSBQbGF5YmFja0Vycm9yO1xuIiwidmFyIEVycm9yQ2xhc3MgPSByZXF1aXJlKCcuLi9saWIvY2xhc3MvZXJyb3ItY2xhc3MnKTtcblxuLyoqXG4gKiDQmtC70LDRgdGBINC+0YjQuNCx0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEBhbGlhcyB5YS5BdWRpby5QbGF5YmFja0Vycm9yXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgLSDRgtC10LrRgdGCINC+0YjQuNCx0LrQuFxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKlxuICogQGV4dGVuZHMgRXJyb3JcbiAqXG4gKiBAZW51bSB7U3RyaW5nfVxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBQbGF5YmFja0Vycm9yID0gZnVuY3Rpb24obWVzc2FnZSwgc3JjKSB7XG4gICAgRXJyb3JDbGFzcy5jYWxsKHRoaXMsIG1lc3NhZ2UpO1xuXG4gICAgdGhpcy5zcmMgPSBzcmM7XG59O1xuXG5QbGF5YmFja0Vycm9yLnByb3RvdHlwZSA9IEVycm9yQ2xhc3MuY3JlYXRlKFwiUGxheWJhY2tFcnJvclwiKTtcblxuLyoqXG4gKiDQntGC0LzQtdC90LAg0YHQvtC10LTQuNC90LXQvdC90LjRj1xuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5QbGF5YmFja0Vycm9yLkNPTk5FQ1RJT05fQUJPUlRFRCA9IFwiQ29ubmVjdGlvbiBhYm9ydGVkXCI7XG4vKipcbiAqINCh0LXRgtC10LLQsNGPINC+0YjQuNCx0LrQsFxuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5QbGF5YmFja0Vycm9yLk5FVFdPUktfRVJST1IgPSBcIk5ldHdvcmsgZXJyb3JcIjtcbi8qKlxuICog0J7RiNC40LHQutCwINC00LXQutC+0LTQuNGA0L7QstCw0L3QuNGPINCw0YPQtNC40L5cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuUGxheWJhY2tFcnJvci5ERUNPREVfRVJST1IgPSBcIkRlY29kZSBlcnJvclwiO1xuLyoqXG4gKiDQndC1INC00L7RgdGC0YPQv9C90YvQuSDQuNGB0YLQvtGH0L3QuNC6XG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cblBsYXliYWNrRXJyb3IuQkFEX0RBVEEgPSBcIkJhZCBkYXRhXCI7XG5cbi8qKlxuICog0KLQsNCx0LvQuNGG0LAg0YHQvtC+0YLQstC10YLRgdGC0LLQuNGPINC60L7QtNC+0LIg0L7RiNC40LHQvtC6IGh0bWw1INC/0LvQtdC10YDQsFxuICogQGVudW0ge1N0cmluZ31cbiAqL1xuUGxheWJhY2tFcnJvci5odG1sNSA9IHtcbiAgICAxOiBQbGF5YmFja0Vycm9yLkNPTk5FQ1RJT05fQUJPUlRFRCxcbiAgICAyOiBQbGF5YmFja0Vycm9yLk5FVFdPUktfRVJST1IsXG4gICAgMzogUGxheWJhY2tFcnJvci5ERUNPREVfRVJST1IsXG4gICAgNDogUGxheWJhY2tFcnJvci5CQURfREFUQVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQbGF5YmFja0Vycm9yO1xuIiwiaWYgKHR5cGVvZiB3aW5kb3cueWEgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB3aW5kb3cueWEgPSB7fTtcbn1cbnZhciB5YSA9IHdpbmRvdy55YTtcblxuaWYgKHR5cGVvZiB5YS5BdWRpbyA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHlhLkF1ZGlvID0ge307XG59XG5cbnZhciBjb25maWcgPSByZXF1aXJlKCcuL2NvbmZpZycpO1xudmFyIEF1ZGlvUGxheWVyID0gcmVxdWlyZSgnLi9hdWRpby1wbGF5ZXInKTtcbnZhciBQcm94eSA9IHJlcXVpcmUoJy4vbGliL2NsYXNzL3Byb3h5Jyk7XG5cbnlhLkF1ZGlvID0gUHJveHkuY3JlYXRlQ2xhc3MoQXVkaW9QbGF5ZXIpO1xueWEuQXVkaW8uY29uZmlnID0gY29uZmlnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHlhLkF1ZGlvO1xuIiwidmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4uL2NvbmZpZycpO1xudmFyIHN3Zm9iamVjdCA9IHJlcXVpcmUoJy4uL2xpYi9icm93c2VyL3N3Zm9iamVjdCcpO1xudmFyIGRldGVjdCA9IHJlcXVpcmUoJy4uL2xpYi9icm93c2VyL2RldGVjdCcpO1xudmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9sb2dnZXInKTtcbnZhciBsb2dnZXIgPSBuZXcgTG9nZ2VyKCdBdWRpb0ZsYXNoJyk7XG52YXIgRmxhc2hNYW5hZ2VyID0gcmVxdWlyZSgnLi9mbGFzaC1tYW5hZ2VyJyk7XG52YXIgRmxhc2hJbnRlcmZhY2UgPSByZXF1aXJlKCcuL2ZsYXNoLWludGVyZmFjZScpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL2xpYi9hc3luYy9ldmVudHMnKTtcblxudmFyIHBsYXllcklkID0gMTtcblxudmFyIGZsYXNoTWFuYWdlcjtcblxudmFyIGZsYXNoVmVyc2lvbiA9IHN3Zm9iamVjdC5nZXRGbGFzaFBsYXllclZlcnNpb24oKTtcbmRldGVjdC5mbGFzaFZlcnNpb24gPSBmbGFzaFZlcnNpb24ubWFqb3IgKyBcIi5cIiArIGZsYXNoVmVyc2lvbi5taW5vciArIFwiLlwiICsgZmxhc2hWZXJzaW9uLnJlbGVhc2U7XG5cbmV4cG9ydHMuYXZhaWxhYmxlID0gc3dmb2JqZWN0Lmhhc0ZsYXNoUGxheWVyVmVyc2lvbihjb25maWcuZmxhc2gudmVyc2lvbik7XG5sb2dnZXIuaW5mbyh0aGlzLCBcImRldGVjdGlvblwiLCBleHBvcnRzLmF2YWlsYWJsZSk7XG5cbi8qKlxuICogQGNsYXNzINCa0LvQsNGB0YEgZmxhc2gg0LDRg9C00LjQvi3Qv9C70LXQtdGA0LBcbiAqIEBleHRlbmRzIElBdWRpb0ltcGxlbWVudGF0aW9uXG4gKlxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI3BsYXlcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNlbmRlZFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI3ZvbHVtZWNoYW5nZVxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI2NyYXNoZWRcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNzd2FwXG4gKlxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI3N0b3BcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNwYXVzZVxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI3Byb2dyZXNzXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jbG9hZGluZ1xuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI2xvYWRlZFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI2Vycm9yXG4gKlxuICogQHBhcmFtIHtITVRMRWxlbWVudH0gW292ZXJsYXldIC0g0LzQtdGB0YLQviDQtNC70Y8g0LLRgdGC0YDQsNC40LLQsNC90LjRjyDQv9C70LXQtdGA0LAgKNCw0LrRgtGD0LDQu9GM0L3QviDRgtC+0LvRjNC60L4g0LTQu9GPIGZsYXNoLdC/0LvQtdC10YDQsClcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2ZvcmNlPWZhbHNlXSAtINGB0L7Qt9C00LDRgtGMINC90L7QstGL0Lkg0Y3QutC30LXQv9C70Y/RgCBGbGFzaE1hbmFnZXJcbiAqIEBjb25zdHJ1Y3RvclxuICogQHByaXZhdGVcbiAqL1xudmFyIEF1ZGlvRmxhc2ggPSBmdW5jdGlvbihvdmVybGF5LCBmb3JjZSkge1xuICAgIHRoaXMubmFtZSA9IHBsYXllcklkKys7XG4gICAgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiY29uc3RydWN0b3JcIik7XG5cbiAgICBpZiAoIWZsYXNoTWFuYWdlciB8fCBmb3JjZSkge1xuICAgICAgICBmbGFzaE1hbmFnZXIgPSBuZXcgRmxhc2hNYW5hZ2VyKG92ZXJsYXkpO1xuICAgIH1cblxuICAgIEV2ZW50cy5jYWxsKHRoaXMpO1xuXG4gICAgdGhpcy53aGVuUmVhZHkgPSBmbGFzaE1hbmFnZXIuY3JlYXRlUGxheWVyKHRoaXMpO1xuICAgIHRoaXMud2hlblJlYWR5LnRoZW4oZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInJlYWR5XCIsIGRhdGEpO1xuICAgIH0uYmluZCh0aGlzKSwgZnVuY3Rpb24oZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IodGhpcywgXCJmYWlsZWRcIiwgZSk7XG4gICAgfS5iaW5kKHRoaXMpKTtcbn07XG5FdmVudHMubWl4aW4oQXVkaW9GbGFzaCk7XG5cbkF1ZGlvRmxhc2gudHlwZSA9IEF1ZGlvRmxhc2gucHJvdG90eXBlLnR5cGUgPSBcImZsYXNoXCI7XG5cbk9iamVjdC5rZXlzKEZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZSkuZmlsdGVyKGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBGbGFzaEludGVyZmFjZS5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBrZXlbMF0gIT09IFwiX1wiO1xufSkubWFwKGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIEF1ZGlvRmxhc2gucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKCEvXmdldC8udGVzdChtZXRob2QpKSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcodGhpcywgbWV0aG9kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5oYXNPd25Qcm9wZXJ0eShcImlkXCIpKSB7XG4gICAgICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcInBsYXllciBpcyBub3QgcmVhZHlcIik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICBhcmdzLnVuc2hpZnQodGhpcy5pZCk7XG4gICAgICAgIHJldHVybiBmbGFzaE1hbmFnZXIuZmxhc2hbbWV0aG9kXS5hcHBseShmbGFzaE1hbmFnZXIuZmxhc2gsIGFyZ3MpO1xuICAgIH1cbn0pO1xuXG4vKipcbiAqINCf0YDQvtC40LPRgNCw0YLRjCDRgtGA0LXQulxuICogQG1ldGhvZCBBdWRpb0ZsYXNoI3BsYXlcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtOdW1iZXJ9IFtkdXJhdGlvbl0gLSDQlNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0YLRgNC10LrQsCAo0L3QtSDQuNGB0L/QvtC70YzQt9GD0LXRgtGB0Y8pXG4gKi9cblxuLyoqXG4gKiDQn9C+0YHRgtCw0LLQuNGC0Ywg0YLRgNC10Log0L3QsCDQv9Cw0YPQt9GDXG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjcGF1c2VcbiAqL1xuXG4vKipcbiAqINCh0L3Rj9GC0Ywg0YLRgNC10Log0YEg0L/QsNGD0LfRi1xuICogQG1ldGhvZCBBdWRpb0ZsYXNoI3Jlc3VtZVxuICovXG5cbi8qKlxuICog0J7RgdGC0LDQvdC+0LLQuNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INC4INC30LDQs9GA0YPQt9C60YMg0YLRgNC10LrQsFxuICogQG1ldGhvZCBBdWRpb0ZsYXNoI3N0b3BcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0LTQu9GPINGC0LXQutGD0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LAsIDE6INC00LvRjyDRgdC70LXQtNGD0Y7RidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsFxuICovXG5cbi8qKlxuICog0J/RgNC10LTQt9Cw0LPRgNGD0LfQuNGC0Ywg0YLRgNC10LpcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNwcmVsb2FkXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0KHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dIC0g0JTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LAgKNC90LUg0LjRgdC/0L7Qu9GM0LfRg9C10YLRgdGPKVxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqL1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC40YLRjCDRh9GC0L4g0YLRgNC10Log0L/RgNC10LTQt9Cw0LPRgNGD0LbQsNC10YLRgdGPXG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjaXNQcmVsb2FkZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQv9GA0LXQtNC30LDQs9GA0YPQttCw0LXRgtGB0Y9cbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQvdCw0YfQsNC7INC/0YDQtdC00LfQsNCz0YDRg9C20LDRgtGM0YHRj1xuICogQG1ldGhvZCBBdWRpb0ZsYXNoI2lzUHJlbG9hZGluZ1xuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0xXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cblxuLyoqXG4gKiDQl9Cw0L/Rg9GB0YLQuNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INC/0YDQtdC00LfQsNCz0YDRg9C20LXQvdC90L7Qs9C+INGC0YDQtdC60LBcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNwbGF5UHJlbG9hZGVkXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0xXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge2Jvb2xlYW59IC0tINC00L7RgdGC0YPQv9C90L7RgdGC0Ywg0LTQsNC90L3QvtCz0L4g0LTQtdC50YHRgtCy0LjRj1xuICovXG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQv9C+0LfQuNGG0LjRjiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNnZXRQb3NpdGlvblxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LjRgtGMINGC0LXQutGD0YnRg9GOINC/0L7Qt9C40YbQuNGOINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICogQG1ldGhvZCBBdWRpb0ZsYXNoI3NldFBvc2l0aW9uXG4gKiBAcGFyYW0ge251bWJlcn0gcG9zaXRpb25cbiAqL1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LBcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNnZXREdXJhdGlvblxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQt9Cw0LPRgNGD0LbQtdC90L3QvtC5INGH0LDRgdGC0Lgg0YLRgNC10LrQsFxuICogQG1ldGhvZCBBdWRpb0ZsYXNoI2dldExvYWRlZFxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINGC0LXQutGD0YnQtdC1INC30L3QsNGH0LXQvdC40LUg0LPRgNC+0LzQutC+0YHRgtC4XG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjZ2V0Vm9sdW1lXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5cbi8qKlxuICog0KPRgdGC0LDQvdC+0LLQuNGC0Ywg0LfQvdCw0YfQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0LhcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNzZXRWb2x1bWVcbiAqIEBwYXJhbSB7bnVtYmVyfSB2b2x1bWVcbiAqL1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0YHRgdGL0LvQutGDINC90LAg0YLRgNC10LpcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNnZXRTcmNcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7U3RyaW5nfEJvb2xlYW59IC0tINCh0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6INC40LvQuCBmYWxzZSwg0LXRgdC70Lgg0L3QtdGCINC30LDQs9GA0YPQttCw0LXQvNC+0LPQviDRgtGA0LXQutCwXG4gKi9cblxuLyoqXG4gKiDQn9GA0L7QstC10YDQuNGC0Ywg0LTQvtGB0YLRg9C/0LXQvSDQu9C4INC/0YDQvtCz0YDQsNC80LzQvdGL0Lkg0LrQvtC90YLRgNC+0LvRjCDQs9GA0L7QvNC60L7RgdGC0LhcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5BdWRpb0ZsYXNoLnByb3RvdHlwZS5pc0RldmljZVZvbHVtZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiDQktGB0L/QvtC80L7Qs9Cw0YLQtdC70YzQvdCw0Y8g0YTRg9C90LrRhtC40Y8g0LTQu9GPINC+0YLQvtCx0YDQsNC20LXQvdC40Y8g0YHQvtGB0YLQvtGP0L3QuNGPINC/0LvQtdC10YDQsCDQsiDQu9C+0LPQtS5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvRmxhc2gucHJvdG90eXBlLl9sb2dnZXIgPSBmdW5jdGlvbigpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAoIXRoaXMuaGFzT3duUHJvcGVydHkoXCJpZFwiKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBtYWluOiBcIm5vdCByZWFkeVwiLFxuICAgICAgICAgICAgICAgIHByZWxvYWRlcjogXCJub3QgcmVhZHlcIlxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWFpbjogdGhpcy5nZXRTcmMoMCksXG4gICAgICAgICAgICBwcmVsb2FkZXI6IHRoaXMuZ2V0U3JjKDEpXG4gICAgICAgIH07XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn07XG5cbmV4cG9ydHMuQXVkaW9JbXBsZW1lbnRhdGlvbiA9IEF1ZGlvRmxhc2g7XG4iLCJ2YXIgY29uZmlnID0gcmVxdWlyZSgnLi4vY29uZmlnJyk7XG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2xvZ2dlcicpO1xudmFyIGxvZ2dlciA9IG5ldyBMb2dnZXIoJ0ZsYXNoSW50ZXJmYWNlJyk7XG5cbi8qKlxuICogQGNsYXNzINCe0L/QuNGB0LDQvdC40LUg0LLQvdC10YjQvdC10LPQviDQuNC90YLQtdGA0YTQtdC50YHQsCBmbGFzaC3Qv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7T2JqZWN0fSBmbGFzaCAtIHN3Zi3QvtCx0YrQtdC60YJcbiAqIEBjb25zdHJ1Y3RvclxuICogQHByaXZhdGVcbiAqL1xudmFyIEZsYXNoSW50ZXJmYWNlID0gZnVuY3Rpb24oZmxhc2gpIHtcbiAgICB0aGlzLmZsYXNoID0geWEuQXVkaW8uX2ZsYXNoID0gZmxhc2g7XG59O1xuXG4vKipcbiAqINCS0YvQt9Cy0LDRgtGMINC80LXRgtC+0LQgZmxhc2gt0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge1N0cmluZ30gZm4gLSDQvdCw0LfQstCw0L3QuNC1INC80LXRgtC+0LTQsFxuICogQHJldHVybnMgeyp9XG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuX2NhbGxGbGFzaCA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgLy9sb2dnZXIuZGVidWcodGhpcywgZm4sIGFyZ3VtZW50cyk7XG5cbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gdGhpcy5mbGFzaC5jYWxsLmFwcGx5KHRoaXMuZmxhc2gsIGFyZ3VtZW50cyk7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcih0aGlzLCBcIl9jYWxsRmxhc2hFcnJvclwiLCBlKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQn9GA0L7QstC10YDQutCwINC+0LHRgNCw0YLQvdC+0Lkg0YHQstGP0LfQuCDRgSBmbGFzaC3Qv9C70LXQtdGA0L7QvFxuICogQHRocm93cyDQntGI0LjQsdC60LAg0LTQvtGB0YLRg9C/0LAg0LogZmxhc2gt0L/Qu9C10LXRgNGDXG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuX2hlYXJ0QmVhdCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX2NhbGxGbGFzaChcImhlYXJ0QmVhdFwiLCAtMSk7XG59O1xuXG4vKipcbiAqINCU0L7QsdCw0LLQuNGC0Ywg0L3QvtCy0YvQuSDQv9C70LXQtdGAXG4gKiBAcmV0dXJucyB7aW50fSAtLSBpZCDQvdC+0LLQvtCz0L4g0L/Qu9C10LXRgNCwXG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuX2FkZFBsYXllciA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLl9jYWxsRmxhc2goXCJhZGRQbGF5ZXJcIiwgLTEpO1xufTtcblxuLyoqXG4gKiDQo9GB0YLQsNC90L7QstC40YLRjCDQs9GA0L7QvNC60L7RgdGC0YxcbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtOdW1iZXJ9IHZvbHVtZSAtINC20LXQu9Cw0LXQvNCw0Y8g0LPRgNC+0LzQutC+0YHRgtGMXG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5zZXRWb2x1bWUgPSBmdW5jdGlvbihpZCwgdm9sdW1lKSB7XG4gICAgdGhpcy5fY2FsbEZsYXNoKFwic2V0Vm9sdW1lXCIsIC0xLCB2b2x1bWUpO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC30L3QsNGH0LXQvdC40LUg0LPRgNC+0LzQutC+0YHRgtC4XG4gKiBAcmV0dXJucyB7TnVtYmVyfVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuZ2V0Vm9sdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NhbGxGbGFzaChcImdldFZvbHVtZVwiLCAtMSk7XG59O1xuXG4vKipcbiAqINCX0LDQv9GD0YHRgtC40YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0YLRgNC10LrQsFxuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7TnVtYmVyfSBkdXJhdGlvbiAtINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwXG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24oaWQsIHNyYywgZHVyYXRpb24pIHtcbiAgICB0aGlzLl9jYWxsRmxhc2goXCJwbGF5XCIsIGlkLCBzcmMsIGR1cmF0aW9uKTtcbn07XG5cbi8qKlxuICog0J7RgdGC0LDQvdC+0LLQuNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INC4INC30LDQs9GA0YPQt9C60YMg0YLRgNC10LrQsFxuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INC00LvRjyDRgtC10LrRg9GJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwLCAxOiDQtNC70Y8g0YHQu9C10LTRg9GO0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LBcbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbihpZCwgb2Zmc2V0KSB7XG4gICAgdGhpcy5fY2FsbEZsYXNoKFwic3RvcFwiLCBpZCwgb2Zmc2V0IHx8IDApO1xufTtcblxuLyoqXG4gKiDQn9C+0YHRgtCw0LLQuNGC0Ywg0YLRgNC10Log0L3QsCDQv9Cw0YPQt9GDXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24oaWQpIHtcbiAgICB0aGlzLl9jYWxsRmxhc2goXCJwYXVzZVwiLCBpZCk7XG59O1xuXG4vKipcbiAqINCh0L3Rj9GC0Ywg0YLRgNC10Log0YEg0L/QsNGD0LfRi1xuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbihpZCkge1xuICAgIHRoaXMuX2NhbGxGbGFzaChcInJlc3VtZVwiLCBpZCk7XG59O1xuXG4vKipcbiAqINCf0YDQtdC00LfQsNCz0YDRg9C30LjRgtGMINGC0YDQtdC6XG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtOdW1iZXJ9IGR1cmF0aW9uIC0g0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LBcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0LTQu9GPINGC0LXQutGD0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LAsIDE6INC00LvRjyDRgdC70LXQtNGD0Y7RidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsFxuICogQHJldHVybnMge0Jvb2xlYW59IC0tINCy0L7Qt9C80L7QttC90L7RgdGC0Ywg0LTQsNC90L3QvtCz0L4g0LTQtdC50YHRgtCy0LjRj1xuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUucHJlbG9hZCA9IGZ1bmN0aW9uKGlkLCBzcmMsIGR1cmF0aW9uLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwicHJlbG9hZFwiLCBpZCwgc3JjLCBkdXJhdGlvbiwgb2Zmc2V0ID09IG51bGwgPyAxIDogMCk7XG59O1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC40YLRjCDRh9GC0L4g0YLRgNC10Log0L/RgNC10LTQt9Cw0LPRgNGD0LbQsNC10YLRgdGPXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDQtNC70Y8g0YLQtdC60YPRidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsCwgMTog0LTQu9GPINGB0LvQtdC00YPRjtGJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLmlzUHJlbG9hZGVkID0gZnVuY3Rpb24oaWQsIHNyYywgb2Zmc2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NhbGxGbGFzaChcImlzUHJlbG9hZGVkXCIsIGlkLCBzcmMsIG9mZnNldCA9PSBudWxsID8gMSA6IDApO1xufTtcblxuLyoqXG4gKiDQn9GA0L7QstC10YDQuNGC0Ywg0YfRgtC+INGC0YDQtdC6INC90LDRh9Cw0Lsg0L/RgNC10LTQt9Cw0LPRgNGD0LbQsNGC0YzRgdGPXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDQtNC70Y8g0YLQtdC60YPRidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsCwgMTog0LTQu9GPINGB0LvQtdC00YPRjtGJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLmlzUHJlbG9hZGluZyA9IGZ1bmN0aW9uKGlkLCBzcmMsIG9mZnNldCkge1xuICAgIHJldHVybiB0aGlzLl9jYWxsRmxhc2goXCJpc1ByZWxvYWRpbmdcIiwgaWQsIHNyYywgb2Zmc2V0ID09IG51bGwgPyAxIDogMCk7XG59O1xuXG4vKipcbiAqINCX0LDQv9GD0YHRgtC40YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0L/RgNC10LTQt9Cw0LPRgNGD0LbQtdC90L3QvtCz0L4g0YLRgNC10LrQsFxuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0xXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge2Jvb2xlYW59IC0tINC00L7RgdGC0YPQv9C90L7RgdGC0Ywg0LTQsNC90L3QvtCz0L4g0LTQtdC50YHRgtCy0LjRj1xuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUucGxheVByZWxvYWRlZCA9IGZ1bmN0aW9uKGlkLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwicGxheVByZWxvYWRlZFwiLCBpZCwgb2Zmc2V0ID09IG51bGwgPyAxIDogMCk7XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0L/QvtC30LjRhtC40Y4g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5nZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NhbGxGbGFzaChcImdldFBvc2l0aW9uXCIsIGlkKTtcbn07XG5cbi8qKlxuICog0KPRgdGC0LDQvdC+0LLQuNGC0Ywg0YLQtdC60YPRidGD0Y4g0L/QvtC30LjRhtC40Y4g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7bnVtYmVyfSBwb3NpdGlvblxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuc2V0UG9zaXRpb24gPSBmdW5jdGlvbihpZCwgcG9zaXRpb24pIHtcbiAgICB0aGlzLl9jYWxsRmxhc2goXCJzZXRQb3NpdGlvblwiLCBpZCwgcG9zaXRpb24pO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7TnVtYmVyfVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuZ2V0RHVyYXRpb24gPSBmdW5jdGlvbihpZCwgb2Zmc2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NhbGxGbGFzaChcImdldER1cmF0aW9uXCIsIGlkLCBvZmZzZXQgfHwgMCk7XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINC30LDQs9GA0YPQttC10L3QvdC+0Lkg0YfQsNGB0YLQuCDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7TnVtYmVyfVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuZ2V0TG9hZGVkID0gZnVuY3Rpb24oaWQsIG9mZnNldCkge1xuICAgIHJldHVybiB0aGlzLl9jYWxsRmxhc2goXCJnZXRMb2FkZWRcIiwgaWQsIG9mZnNldCB8fCAwKTtcbn07XG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDRgdGB0YvQu9C60YMg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge1N0cmluZ31cbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLmdldFNyYyA9IGZ1bmN0aW9uKGlkLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwiZ2V0U3JjXCIsIGlkLCBvZmZzZXQgfHwgMCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZsYXNoSW50ZXJmYWNlO1xuIiwidmFyIExvZ2dlciA9IHJlcXVpcmUoJy4uL2xvZ2dlci9sb2dnZXInKTtcbnZhciBsb2dnZXIgPSBuZXcgTG9nZ2VyKCdGbGFzaEJyaWRnZScpO1xuXG52YXIgY29uZmlnID0gcmVxdWlyZSgnLi4vY29uZmlnJyk7XG5cbnZhciBBdWRpb1N0YXRpYyA9IHJlcXVpcmUoJy4uL2F1ZGlvLXN0YXRpYycpO1xudmFyIGZsYXNoTG9hZGVyID0gcmVxdWlyZSgnLi9sb2FkZXInKTtcbnZhciBGbGFzaEludGVyZmFjZSA9IHJlcXVpcmUoJy4vZmxhc2gtaW50ZXJmYWNlJyk7XG5cbnZhciBEZWZlcnJlZCA9IHJlcXVpcmUoJy4uL2xpYi9hc3luYy9kZWZlcnJlZCcpO1xuXG52YXIgQXVkaW9FcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yL2F1ZGlvLWVycm9yJyk7XG52YXIgTG9hZGVyRXJyb3IgPSByZXF1aXJlKCcuLi9saWIvbmV0L2Vycm9yL2xvYWRlci1lcnJvcicpO1xuXG4vKipcbiAqIEBjbGFzcyDQl9Cw0LPRgNGD0LfQutCwIGZsYXNoLdC/0LvQtdC10YDQsCDQuCDQvtCx0YDQsNCx0L7RgtC60LAg0YHQvtCx0YvRgtC40LlcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IG92ZXJsYXkgLSDQvtCx0YrQtdC60YIg0LTQu9GPINC30LDQs9GA0YPQt9C60Lgg0Lgg0L/QvtC60LDQt9CwIGZsYXNoLdC/0LvQtdC10YDQsFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgRmxhc2hNYW5hZ2VyID0gZnVuY3Rpb24ob3ZlcmxheSkgeyAvLyBzaW5nbGV0b24hXG4gICAgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiY29uc3RydWN0b3JcIiwgb3ZlcmxheSk7XG5cbiAgICB0aGlzLnN0YXRlID0gXCJpbml0XCI7XG4gICAgdGhpcy5vdmVybGF5ID0gb3ZlcmxheTtcbiAgICB0aGlzLmVtbWl0ZXJzID0gW107XG5cbiAgICB2YXIgZGVmZXJyZWQgPSB0aGlzLmRlZmVycmVkID0gbmV3IERlZmVycmVkKCk7XG4gICAgLyoqXG4gICAgICog0J7QsdC10YnQsNC90LjQtSwg0LrQvtGC0L7RgNC+0LUg0YDQsNC30YDQtdGI0LDQtdGC0YHRjyDQv9GA0Lgg0LfQsNCy0LXRgNGI0LXQvdC40Lgg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LhcbiAgICAgKiBAdHlwZSB7UHJvbWlzZX1cbiAgICAgKi9cbiAgICB0aGlzLndoZW5SZWFkeSA9IHRoaXMuZGVmZXJyZWQucHJvbWlzZSgpO1xuXG4gICAgdmFyIGNhbGxiYWNrUGF0aCA9IGNvbmZpZy5mbGFzaC5jYWxsYmFjay5zcGxpdChcIi5cIik7XG4gICAgdmFyIGNhbGxiYWNrTmFtZSA9IGNhbGxiYWNrUGF0aC5wb3AoKTtcbiAgICB2YXIgY2FsbGJhY2tDb250ID0gd2luZG93O1xuICAgIGNhbGxiYWNrUGF0aC5mb3JFYWNoKGZ1bmN0aW9uKHBhcnQpIHtcbiAgICAgICAgaWYgKCFjYWxsYmFja0NvbnRbcGFydF0pIHtcbiAgICAgICAgICAgIGNhbGxiYWNrQ29udFtwYXJ0XSA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIGNhbGxiYWNrQ29udCA9IGNhbGxiYWNrQ29udFtwYXJ0XTtcbiAgICB9KTtcbiAgICBjYWxsYmFja0NvbnRbY2FsbGJhY2tOYW1lXSA9IHRoaXMuX29uRXZlbnQuYmluZCh0aGlzKTtcblxuICAgIHRoaXMuX19sb2FkVGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5fb25Mb2FkVGltZW91dCwgY29uZmlnLmZsYXNoLmxvYWRUaW1lb3V0KTtcbiAgICBmbGFzaExvYWRlcihjb25maWcuZmxhc2gucGF0aCArIFwiL1wiXG4gICAgICAgICsgY29uZmlnLmZsYXNoLm5hbWUsIGNvbmZpZy5mbGFzaC52ZXJzaW9uLCBjb25maWcuZmxhc2gucGxheWVySUQsIHRoaXMuX29uTG9hZC5iaW5kKHRoaXMpLCB7fSwgb3ZlcmxheSk7XG5cbiAgICBpZiAob3ZlcmxheSkge1xuICAgICAgICB2YXIgdGltZW91dDtcbiAgICAgICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uKCkgeyAvL0tOT1dMRURHRTogb25seSBtb3VzZWRvd24gZXZlbnQgYW5kIG9ubHkgd21vZGU6IHRyYW5zcGFyZW50XG4gICAgICAgICAgICB0aW1lb3V0ID0gdGltZW91dCB8fCBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5GTEFTSF9OT1RfUkVTUE9ORElORykpO1xuICAgICAgICAgICAgICAgIH0sIGNvbmZpZy5mbGFzaC5jbGlja1RpbWVvdXQpO1xuICAgICAgICB9LCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLndoZW5SZWFkeS50aGVuKGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgICB0aW1lb3V0ID0gdGltZW91dCAmJiBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwicmVhZHlcIiwgcmVzdWx0KTtcbiAgICB9LmJpbmQodGhpcyksIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgZmxhc2hNYW5hZ2VyID0gbnVsbDsgLy8g0LXRgdC70Lgg0L7QsdC70L7QvNCw0LvQuNGB0Ywg0YPQtNCw0LvRj9C10Lwg0Y3QutC30LXQvNC/0LvRj9GAINC80LXQvdC10LTQttC10YDQsCwg0YfRgtC+0LHRiyDQvNC+0LbQvdC+INCx0YvQu9C+INCx0YvQu9C+INC/0YvRgtCw0YLRjNGB0Y8g0YHQvdC+0LLQsFxuICAgICAgICBsb2dnZXIuZXJyb3IodGhpcywgXCJmYWlsZWRcIiwgZSk7XG4gICAgfS5iaW5kKHRoaXMpKTtcbn07XG5cbkZsYXNoTWFuYWdlci5FVkVOVF9JTklUID0gXCJpbml0XCI7XG5GbGFzaE1hbmFnZXIuRVZFTlRfRkFJTCA9IFwiZmFpbGVkXCI7XG5cbi8qKlxuICog0J7QsdGA0LDQsdC+0YLRh9C40Log0YHQvtCx0YvRgtC40Y8g0LfQsNCz0YDRg9C30LrQuCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSBkYXRhXG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaE1hbmFnZXIucHJvdG90eXBlLl9vbkxvYWQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiX29uTG9hZFwiLCBkYXRhKTtcblxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9fbG9hZFRpbWVvdXQpO1xuICAgIGRlbGV0ZSB0aGlzLl9fbG9hZFRpbWVvdXQ7XG5cbiAgICBpZiAoZGF0YS5zdWNjZXNzKSB7XG4gICAgICAgIHRoaXMuZmxhc2ggPSBuZXcgRmxhc2hJbnRlcmZhY2UoZGF0YS5yZWYpO1xuXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBcInJlYWR5XCIpIHtcbiAgICAgICAgICAgIHRoaXMuZGVmZXJyZWQucmVzb2x2ZShkYXRhLnJlZik7XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMub3ZlcmxheSkge1xuICAgICAgICAgICAgdGhpcy5fX2luaXRUaW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLl9vbkluaXRUaW1lb3V0LmJpbmQodGhpcyksIGNvbmZpZy5mbGFzaC5pbml0VGltZW91dCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnN0YXRlID0gXCJmYWlsZWRcIjtcbiAgICAgICAgdGhpcy5kZWZlcnJlZC5yZWplY3QobmV3IEF1ZGlvRXJyb3IoZGF0YS5fX2ZibiA/IEF1ZGlvRXJyb3IuRkxBU0hfQkxPQ0tFUiA6IEF1ZGlvRXJyb3IuRkxBU0hfVU5LTk9XTl9DUkFTSCkpO1xuICAgIH1cbn07XG5cbi8qKlxuICog0J7QsdGA0LDQsdC+0YLRh9C40Log0YLQsNC50LzQsNGD0YLQsCDQt9Cw0LPRgNGD0LfQutC4XG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaE1hbmFnZXIucHJvdG90eXBlLl9vbkxvYWRUaW1lb3V0ID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zdGF0ZSA9IFwiZmFpbGVkXCI7XG4gICAgdGhpcy5kZWZlcnJlZC5yZWplY3QobmV3IExvYWRlckVycm9yKExvYWRlckVycm9yLlRJTUVPVVQpKTtcbn07XG5cbi8qKlxuICog0J7QsdGA0LDQsdC+0YLRh9C40Log0YLQsNC50LzQsNGD0YLQsCDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuFxuICogQHByaXZhdGVcbiAqL1xuRmxhc2hNYW5hZ2VyLnByb3RvdHlwZS5fb25Jbml0VGltZW91dCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3RhdGUgPSBcImZhaWxlZFwiO1xuICAgIHRoaXMuZGVmZXJyZWQucmVqZWN0KG5ldyBBdWRpb0Vycm9yKEF1ZGlvRXJyb3IuRkxBU0hfSU5JVF9USU1FT1VUKSk7XG59O1xuXG4vKipcbiAqINCe0LHRgNCw0LHQvtGC0YfQuNC6INGD0YHQv9C10YjQvdC+0YHRgtC4INC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4XG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaE1hbmFnZXIucHJvdG90eXBlLl9vbkluaXQgPSBmdW5jdGlvbigpIHtcbiAgICBsb2dnZXIuZGVidWcodGhpcywgXCJfb25Jbml0XCIpO1xuXG4gICAgdGhpcy5zdGF0ZSA9IFwicmVhZHlcIjtcblxuICAgIGlmICh0aGlzLl9faW5pdFRpbWVvdXQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX19pbml0VGltZW91dCk7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9faW5pdFRpbWVvdXQ7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZmxhc2gpIHtcbiAgICAgICAgdGhpcy5kZWZlcnJlZC5yZXNvbHZlKHRoaXMuZmxhc2gpO1xuICAgICAgICB0aGlzLl9faGVhcnRiZWF0ID0gc2V0SW50ZXJ2YWwodGhpcy5fb25IZWFydEJlYXQuYmluZCh0aGlzKSwgMTAwMCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQntCx0YDQsNCx0L7RgtGH0LjQuiDRgdC+0LHRi9GC0LjQuSwg0YHQvtC30LTQsNCy0LDQtdC80YvRhSBmbGFzaC3Qv9C70LXQtdGA0L7QvFxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7aW50fSBvZmZzZXQgLSAwOiDQtNC70Y8g0YLQtdC60YPRidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsCwgMTog0LTQu9GPINGB0LvQtdC00YPRjtGJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwXG4gKiBAcGFyYW0geyp9IGRhdGEgLSDQtNCw0L3QvdGL0LUg0L/QtdGA0LXQtNCw0L3QvdGL0LUg0LLQvNC10YHRgtC1INGBINGB0L7QsdGL0YLQuNC10LxcbiAqIEBwcml2YXRlXG4gKi9cbkZsYXNoTWFuYWdlci5wcm90b3R5cGUuX29uRXZlbnQgPSBmdW5jdGlvbihldmVudCwgaWQsIG9mZnNldCwgZGF0YSkge1xuICAgIGlmIChldmVudCA9PT0gXCJkZWJ1Z1wiKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoXCJmbGFzaERFQlVHXCIsIGlkLCBvZmZzZXQsIGRhdGEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnN0YXRlID09PSBcImZhaWxlZFwiKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwib25FdmVudEZhaWxlZFwiLCBldmVudCwgaWQsIG9mZnNldCwgZGF0YSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dnZXIuZGVidWcodGhpcywgXCJvbkV2ZW50XCIsIGV2ZW50LCBpZCwgb2Zmc2V0KTtcblxuICAgIGlmIChldmVudCA9PT0gRmxhc2hNYW5hZ2VyLkVWRU5UX0lOSVQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX29uSW5pdCgpO1xuICAgIH1cblxuICAgIGlmIChldmVudCA9PT0gRmxhc2hNYW5hZ2VyLkVWRU5UX0ZBSUwpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4odGhpcywgXCJmYWlsZWRcIiwgQXVkaW9FcnJvci5GTEFTSF9JTlRFUk5BTF9FUlJPUik7XG4gICAgICAgIHRoaXMuZGVmZXJyZWQucmVqZWN0KG5ldyBBdWRpb0Vycm9yKEF1ZGlvRXJyb3IuRkxBU0hfSU5URVJOQUxfRVJST1IpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChpZCA9PSAtMSkge1xuICAgICAgICB0aGlzLmVtbWl0ZXJzLmZvckVhY2goZnVuY3Rpb24oZW1taXRlcikge1xuICAgICAgICAgICAgZW1taXRlci50cmlnZ2VyKGV2ZW50LCBvZmZzZXQsIGRhdGEpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZW1taXRlcnNbaWRdKSB7XG4gICAgICAgIHRoaXMuZW1taXRlcnNbaWRdLnRyaWdnZXIoZXZlbnQsIG9mZnNldCwgZGF0YSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIEF1ZGlvRXJyb3IuRkxBU0hfRU1NSVRFUl9OT1RfRk9VTkQsIGlkKTtcbiAgICB9XG59O1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC60LAg0LTQvtGB0YLRg9C/0L3QvtGB0YLQuCBmbGFzaC3Qv9C70LXQtdGA0LBcbiAqIEBwcml2YXRlXG4gKi9cbkZsYXNoTWFuYWdlci5wcm90b3R5cGUuX29uSGVhcnRCZWF0ID0gZnVuY3Rpb24oKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgdGhpcy5mbGFzaC5faGVhcnRCZWF0KCk7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcih0aGlzLCBcImNyYXNoZWRcIiwgZSk7XG4gICAgICAgIHRoaXMuX29uRXZlbnQoQXVkaW9TdGF0aWMuRVZFTlRfQ1JBU0hFRCwgLTEsIGUpO1xuICAgIH1cbn07XG5cbi8qKlxuICog0KHQvtC30LTQsNC90LjQtSDQvdC+0LLQvtCz0L4g0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge0F1ZGlvRmxhc2h9IGF1ZGlvRmxhc2ggLSBmbGFzaCDQsNGD0LTQuNC+LdC/0LvQtdC10YAsINC60L7RgtC+0YDRi9C5INCx0YPQtNC10YIg0L7QsdGB0LvRg9C20LjQstCw0YLRjCDRgdC+0LfQtNCw0L3QvdGL0Lkg0L/Qu9C10LXRgFxuICogQHJldHVybnMge1Byb21pc2V9IC0tINC+0LHQtdGJ0LDQvdC40LUsINC60L7RgtC+0YDQvtC1INGA0LDQt9GA0LXRiNCw0LXRgtGB0Y8g0L/QvtGB0LvQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDRgdC+0LfQtNCw0L3QuNGPINC/0LvQtdC10YDQsFxuICovXG5GbGFzaE1hbmFnZXIucHJvdG90eXBlLmNyZWF0ZVBsYXllciA9IGZ1bmN0aW9uKGF1ZGlvRmxhc2gpIHtcbiAgICBsb2dnZXIuZGVidWcodGhpcywgXCJjcmVhdGVQbGF5ZXJcIik7XG5cbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMud2hlblJlYWR5LnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGF1ZGlvRmxhc2guaWQgPSB0aGlzLmZsYXNoLl9hZGRQbGF5ZXIoKTtcbiAgICAgICAgdGhpcy5lbW1pdGVyc1thdWRpb0ZsYXNoLmlkXSA9IGF1ZGlvRmxhc2g7XG4gICAgICAgIHJldHVybiBhdWRpb0ZsYXNoLmlkO1xuICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICBwcm9taXNlLnRoZW4oZnVuY3Rpb24ocGxheWVySWQpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiY3JlYXRlUGxheWVyU3VjY2Vzc1wiLCBwbGF5ZXJJZCk7XG4gICAgfS5iaW5kKHRoaXMpLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIFwiY3JlYXRlUGxheWVyRXJyb3JcIiwgZXJyKTtcbiAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgcmV0dXJuIHByb21pc2U7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZsYXNoTWFuYWdlcjtcbiIsIi8qKlxuICogQGlnbm9yZVxuICogQGZpbGVcbiAqIFRoaXMgaXMgYSB3cmFwcGVyIGZvciBzd2ZvYmplY3QgdGhhdCBkZXRlY3RzIEZsYXNoQmxvY2sgaW4gYnJvd3Nlci5cbiAqXG4gKiBXcmFwcGVyIGRldGVjdHM6XG4gKiAgIC0gQ2hyb21lXG4gKiAgICAgLSBGbGFzaEJsb2NrIChodHRwczovL2Nocm9tZS5nb29nbGUuY29tL3dlYnN0b3JlL2RldGFpbC9jZG5naWFkbW5raGdlbWtpbWtoaWlsZ2ZmYmppamNpZSlcbiAqICAgICAtIEZsYXNoQmxvY2sgKGh0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUvZGV0YWlsL2dvZmhqa2pta3Bpbmhwb2lhYmpwbG9iY2FpZ25hYm5sKVxuICogICAgIC0gRmxhc2hGcmVlIChodHRwczovL2Nocm9tZS5nb29nbGUuY29tL3dlYnN0b3JlL2RldGFpbC9lYm1pZWNrbGxtbWlmampiaXBucHBpbnBpb2hwZmFobSlcbiAqICAgLSBGaXJlZm94IEZsYXNoYmxvY2sgKGh0dHBzOi8vYWRkb25zLm1vemlsbGEub3JnL3J1L2ZpcmVmb3gvYWRkb24vZmxhc2hibG9jay8pXG4gKiAgIC0gT3BlcmEgPj0gMTEuNSBcIkVuYWJsZSBwbHVnaW5zIG9uIGRlbWFuZFwiIHNldHRpbmdcbiAqICAgLSBTYWZhcmkgQ2xpY2tUb0ZsYXNoIEV4dGVuc2lvbiAoaHR0cDovL2hveW9pcy5naXRodWIuY29tL3NhZmFyaWV4dGVuc2lvbnMvY2xpY2t0b3BsdWdpbi8pXG4gKiAgIC0gU2FmYXJpIENsaWNrVG9GbGFzaCBQbHVnaW4gKGZvciBTYWZhcmkgPCA1LjAuNikgKGh0dHA6Ly9yZW50enNjaC5naXRodWIuY29tL2NsaWNrdG9mbGFzaC8pXG4gKlxuICogVGVzdGVkIG9uOlxuICogICAtIENocm9tZSAxMlxuICogICAgIC0gRmxhc2hCbG9jayBieSBMZXgxIDEuMi4xMS4xMlxuICogICAgIC0gRmxhc2hCbG9jayBieSBqb3NvcmVrIDAuOS4zMVxuICogICAgIC0gRmxhc2hGcmVlIDEuMS4zXG4gKiAgIC0gRmlyZWZveCA1LjAuMSArIEZsYXNoYmxvY2sgMS41LjE1LjFcbiAqICAgLSBPcGVyYSAxMS41XG4gKiAgIC0gU2FmYXJpIDUuMSArIENsaWNrVG9GbGFzaCAoMi4zLjIpXG4gKlxuICogQWxzbyB0aGlzIHdyYXBwZXIgY2FuIHJlbW92ZSBibG9ja2VkIHN3ZiBhbmQgbGV0IHlvdSBkb3duZ3JhZGUgdG8gb3RoZXIgb3B0aW9ucy5cbiAqXG4gKiBGZWVsIGZyZWUgdG8gY29udGFjdCBtZSB2aWEgZW1haWwuXG4gKlxuICogQ29weXJpZ2h0IDIwMTEsIEFsZXhleSBBbmRyb3NvdlxuICogRHVhbCBsaWNlbnNlZCB1bmRlciB0aGUgTUlUIChodHRwOi8vd3d3Lm9wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlLnBocCkgb3IgR1BMIFZlcnNpb24gMyAoaHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzL2dwbC5odG1sKSBsaWNlbnNlcy5cbiAqXG4gKiBUaGFua3MgdG8gZmxhc2hibG9ja2RldGVjdG9yIHByb2plY3QgKGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9mbGFzaGJsb2NrZGV0ZWN0b3IpXG4gKlxuICogQHJlcXVpcmVzIHN3Zm9iamVjdFxuICogQGF1dGhvciBBbGV4ZXkgQW5kcm9zb3YgPGRvb2NoaWtAeWEucnU+XG4gKiBAdmVyc2lvbiAxLjBcbiAqL1xuXG52YXIgc3dmb2JqZWN0ID0gcmVxdWlyZSgnLi4vbGliL2Jyb3dzZXIvc3dmb2JqZWN0Jyk7XG5cbmZ1bmN0aW9uIHJlbW92ZShub2RlKSB7XG4gICAgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xufVxuXG4vKipcbiAqINCc0L7QtNGD0LvRjCDQt9Cw0LPRgNGD0LfQutC4INGE0LvQtdGILdC/0LvQtdC10YDQsCDRgSDQstC+0LfQvNC+0LbQvdC+0YHRgtGM0Y4g0L7RgtGB0LvQtdC20LjQstCw0L3QuNGPINCx0LvQvtC60LjRgNC+0LLRidC40LrQvtCyXG4gKiBAbmFtZXNwYWNlXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgRmxhc2hCbG9ja05vdGlmaWVyID0ge1xuXG4gICAgLyoqXG4gICAgICogQ1NTLWNsYXNzIGZvciBzd2Ygd3JhcHBlci5cbiAgICAgKiBAcHJvdGVjdGVkXG4gICAgICogQGRlZmF1bHQgZmJuLXN3Zi13cmFwcGVyXG4gICAgICogQHR5cGUgU3RyaW5nXG4gICAgICovXG4gICAgX19TV0ZfV1JBUFBFUl9DTEFTUzogJ2Zibi1zd2Ytd3JhcHBlcicsXG5cbiAgICAvKipcbiAgICAgKiBUaW1lb3V0IGZvciBmbGFzaCBibG9jayBkZXRlY3RcbiAgICAgKiBAZGVmYXVsdCA1MDBcbiAgICAgKiBAcHJvdGVjdGVkXG4gICAgICogQHR5cGUgTnVtYmVyXG4gICAgICovXG4gICAgX19USU1FT1VUOiA1MDAsXG5cbiAgICBfX1RFU1RTOiBbXG4gICAgICAgIC8vIENob21lIEZsYXNoQmxvY2sgZXh0ZW5zaW9uIChodHRwczovL2Nocm9tZS5nb29nbGUuY29tL3dlYnN0b3JlL2RldGFpbC9jZG5naWFkbW5raGdlbWtpbWtoaWlsZ2ZmYmppamNpZSlcbiAgICAgICAgLy8gQ2hvbWUgRmxhc2hCbG9jayBleHRlbnNpb24gKGh0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUvZGV0YWlsL2dvZmhqa2pta3Bpbmhwb2lhYmpwbG9iY2FpZ25hYm5sKVxuICAgICAgICBmdW5jdGlvbihzd2ZOb2RlLCB3cmFwcGVyTm9kZSkge1xuICAgICAgICAgICAgLy8gd2UgZXhwZWN0IHRoYXQgc3dmIGlzIHRoZSBvbmx5IGNoaWxkIG9mIHdyYXBwZXJcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyTm9kZS5jaGlsZE5vZGVzLmxlbmd0aCA+IDFcbiAgICAgICAgfSwgLy8gb2xkZXIgU2FmYXJpIENsaWNrVG9GbGFzaCAoaHR0cDovL3JlbnR6c2NoLmdpdGh1Yi5jb20vY2xpY2t0b2ZsYXNoLylcbiAgICAgICAgZnVuY3Rpb24oc3dmTm9kZSkge1xuICAgICAgICAgICAgLy8gSUUgaGFzIG5vIHN3Zk5vZGUudHlwZVxuICAgICAgICAgICAgcmV0dXJuIHN3Zk5vZGUudHlwZSAmJiBzd2ZOb2RlLnR5cGUgIT0gJ2FwcGxpY2F0aW9uL3gtc2hvY2t3YXZlLWZsYXNoJ1xuICAgICAgICB9LCAvLyBGbGFzaEJsb2NrIGZvciBGaXJlZm94IChodHRwczovL2FkZG9ucy5tb3ppbGxhLm9yZy9ydS9maXJlZm94L2FkZG9uL2ZsYXNoYmxvY2svKVxuICAgICAgICAvLyBDaHJvbWUgRmxhc2hGcmVlIChodHRwczovL2Nocm9tZS5nb29nbGUuY29tL3dlYnN0b3JlL2RldGFpbC9lYm1pZWNrbGxtbWlmampiaXBucHBpbnBpb2hwZmFobSlcbiAgICAgICAgZnVuY3Rpb24oc3dmTm9kZSkge1xuICAgICAgICAgICAgLy8gc3dmIGhhdmUgYmVlbiBkZXRhY2hlZCBmcm9tIERPTVxuICAgICAgICAgICAgcmV0dXJuICFzd2ZOb2RlLnBhcmVudE5vZGU7XG4gICAgICAgIH0sIC8vIFNhZmFyaSBDbGlja1RvRmxhc2ggRXh0ZW5zaW9uIChodHRwOi8vaG95b2lzLmdpdGh1Yi5jb20vc2FmYXJpZXh0ZW5zaW9ucy9jbGlja3RvcGx1Z2luLylcbiAgICAgICAgZnVuY3Rpb24oc3dmTm9kZSkge1xuICAgICAgICAgICAgcmV0dXJuIHN3Zk5vZGUucGFyZW50Tm9kZS5jbGFzc05hbWUuaW5kZXhPZignQ1RGbm9kaXNwbGF5JykgPiAtMTtcbiAgICAgICAgfVxuICAgIF0sXG5cbiAgICAvKipcbiAgICAgKiBFbWJlZCBTV0YgaW5mbyBwYWdlLiBUaGlzIGZ1bmN0aW9uIGhhcyBzYW1lIG9wdGlvbnMgYXMgc3dmb2JqZWN0LmVtYmVkU1dGIGV4Y2VwdCBsYXN0IHBhcmFtIHJlbW92ZUJsb2NrZWRTV0YuXG4gICAgICogQHNlZSBodHRwOi8vY29kZS5nb29nbGUuY29tL3Avc3dmb2JqZWN0L3dpa2kvYXBpXG4gICAgICogQHBhcmFtIHN3ZlVybFN0clxuICAgICAqIEBwYXJhbSByZXBsYWNlRWxlbUlkU3RyXG4gICAgICogQHBhcmFtIHdpZHRoU3RyXG4gICAgICogQHBhcmFtIGhlaWdodFN0clxuICAgICAqIEBwYXJhbSBzd2ZWZXJzaW9uU3RyXG4gICAgICogQHBhcmFtIHhpU3dmVXJsU3RyXG4gICAgICogQHBhcmFtIGZsYXNodmFyc09ialxuICAgICAqIEBwYXJhbSBwYXJPYmpcbiAgICAgKiBAcGFyYW0gYXR0T2JqXG4gICAgICogQHBhcmFtIGNhbGxiYWNrRm5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtyZW1vdmVCbG9ja2VkU1dGPXRydWVdIFJlbW92ZSBzd2YgaWYgYmxvY2tlZFxuICAgICAqL1xuICAgIGVtYmVkU1dGOiBmdW5jdGlvbihzd2ZVcmxTdHIsIHJlcGxhY2VFbGVtSWRTdHIsIHdpZHRoU3RyLCBoZWlnaHRTdHIsIHN3ZlZlcnNpb25TdHIsIHhpU3dmVXJsU3RyLCBmbGFzaHZhcnNPYmosXG4gICAgICAgICAgICAgICAgICAgICAgIHBhck9iaiwgYXR0T2JqLCBjYWxsYmFja0ZuLCByZW1vdmVCbG9ja2VkU1dGKSB7XG4gICAgICAgIC8vIHZhciBzd2ZvYmplY3QgPSB3aW5kb3dbJ3N3Zm9iamVjdCddO1xuXG4gICAgICAgIGlmICghc3dmb2JqZWN0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzd2ZvYmplY3QuYWRkRG9tTG9hZEV2ZW50KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIHJlcGxhY2VFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQocmVwbGFjZUVsZW1JZFN0cik7XG4gICAgICAgICAgICBpZiAoIXJlcGxhY2VFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIGNyZWF0ZSBkaXYtd3JhcHBlciBiZWNhdXNlIHNvbWUgZmxhc2ggYmxvY2sgcGx1Z2lucyByZXBsYWNlIHN3ZiB3aXRoIGFub3RoZXIgY29udGVudC5cbiAgICAgICAgICAgIC8vIEFsc28gc29tZSBmbGFzaCByZXF1aXJlcyB3cmFwcGVyIHRvIHdvcmsgcHJvcGVybHkuXG4gICAgICAgICAgICB2YXIgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgd3JhcHBlci5jbGFzc05hbWUgPSBGbGFzaEJsb2NrTm90aWZpZXIuX19TV0ZfV1JBUFBFUl9DTEFTUztcblxuICAgICAgICAgICAgcmVwbGFjZUVsZW1lbnQucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQod3JhcHBlciwgcmVwbGFjZUVsZW1lbnQpO1xuICAgICAgICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChyZXBsYWNlRWxlbWVudCk7XG5cbiAgICAgICAgICAgIHN3Zm9iamVjdC5lbWJlZFNXRihzd2ZVcmxTdHIsIHJlcGxhY2VFbGVtSWRTdHIsIHdpZHRoU3RyLCBoZWlnaHRTdHIsIHN3ZlZlcnNpb25TdHIsIHhpU3dmVXJsU3RyLCBmbGFzaHZhcnNPYmosIHBhck9iaiwgYXR0T2JqLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgLy8gZS5zdWNjZXNzID09PSBmYWxzZSBtZWFucyB0aGF0IGJyb3dzZXIgZG9uJ3QgaGF2ZSBmbGFzaCBvciBmbGFzaCBpcyB0b28gb2xkXG4gICAgICAgICAgICAgICAgLy8gQHNlZSBodHRwOi8vY29kZS5nb29nbGUuY29tL3Avc3dmb2JqZWN0L3dpa2kvYXBpXG4gICAgICAgICAgICAgICAgaWYgKCFlIHx8IGUuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tGbihlKTtcblxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzd2ZFbGVtZW50ID0gZVsncmVmJ107XG4gICAgICAgICAgICAgICAgICAgIC8vIE9wZXJhIDExLjUgYW5kIGFib3ZlIHJlcGxhY2VzIGZsYXNoIHdpdGggU1ZHIGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAvLyBtc2llIChhbmQgY2FuYXJ5IGNocm9tZSAzMi4wKSBjcmFzaGVzIG9uIHN3ZkVsZW1lbnRbJ2dldFNWR0RvY3VtZW50J10oKVxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVwbGFjZWRCeVNWRyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVwbGFjZWRCeVNWRyA9IHN3ZkVsZW1lbnQgJiYgc3dmRWxlbWVudFsnZ2V0U1ZHRG9jdW1lbnQnXSAmJiBzd2ZFbGVtZW50WydnZXRTVkdEb2N1bWVudCddKCk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2goZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlcGxhY2VkQnlTVkcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uRmFpbHVyZShlKTtcblxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9zZXQgdGltZW91dCB0byBsZXQgRmxhc2hCbG9jayBwbHVnaW4gZGV0ZWN0IHN3ZiBhbmQgcmVwbGFjZSBpdCBzb21lIGNvbnRlbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgVEVTVFMgPSBGbGFzaEJsb2NrTm90aWZpZXIuX19URVNUUztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaiA9IFRFU1RTLmxlbmd0aDsgaSA8IGo7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoVEVTVFNbaV0oc3dmRWxlbWVudCwgd3JhcHBlcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uRmFpbHVyZShlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFja0ZuKGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSwgRmxhc2hCbG9ja05vdGlmaWVyLl9fVElNRU9VVCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBvbkZhaWx1cmUoZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVtb3ZlQmxvY2tlZFNXRiAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vcmVtb3ZlIHN3ZlxuICAgICAgICAgICAgICAgICAgICAgICAgc3dmb2JqZWN0LnJlbW92ZVNXRihyZXBsYWNlRWxlbUlkU3RyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vcmVtb3ZlIHdyYXBwZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZSh3cmFwcGVyKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy9yZW1vdmUgZXh0ZW5zaW9uIGFydGVmYWN0c1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvL0NsaWNrVG9GbGFzaCBhcnRlZmFjdHNcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdGYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnQ1RGc3RhY2snKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdGYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1vdmUoY3RmKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy9DaHJvbWUgRmxhc2hCbG9jayBhcnRlZmFjdFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGxhc3RCb2R5Q2hpbGQgPSBkb2N1bWVudC5ib2R5Lmxhc3RDaGlsZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXN0Qm9keUNoaWxkICYmIGxhc3RCb2R5Q2hpbGQuY2xhc3NOYW1lID09ICd1anNfZmxhc2hibG9ja19wbGFjZWhvbGRlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1vdmUobGFzdEJvZHlDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZS5zdWNjZXNzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGUuX19mYm4gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFja0ZuKGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZsYXNoQmxvY2tOb3RpZmllcjtcbiIsInZhciBzd2ZvYmplY3QgPSByZXF1aXJlKCcuLi9saWIvYnJvd3Nlci9zd2ZvYmplY3QnKTtcblxuLyoqXG4gKiDQnNC+0LTRg9C70Ywg0LfQsNCz0YDRg9C30LrQuCDRhNC70LXRiC3Qv9C70LXQtdGA0LBcbiAqIEBuYW1lc3BhY2VcbiAqIEBwcml2YXRlXG4gKi9cbnZhciBGbGFzaEVtYmVkZGVyID0ge1xuXG4gICAgLyoqXG4gICAgICogQ1NTLWNsYXNzIGZvciBzd2Ygd3JhcHBlci5cbiAgICAgKiBAcHJvdGVjdGVkXG4gICAgICogQGRlZmF1bHQgZmVtYi1zd2Ytd3JhcHBlclxuICAgICAqIEB0eXBlIFN0cmluZ1xuICAgICAqL1xuICAgIF9fU1dGX1dSQVBQRVJfQ0xBU1M6ICdmZW1iLXN3Zi13cmFwcGVyJyxcblxuICAgIC8qKlxuICAgICAqIFRpbWVvdXQgZm9yIGZsYXNoIGJsb2NrIGRldGVjdFxuICAgICAqIEBkZWZhdWx0IDUwMFxuICAgICAqIEBwcm90ZWN0ZWRcbiAgICAgKiBAdHlwZSBOdW1iZXJcbiAgICAgKi9cbiAgICBfX1RJTUVPVVQ6IDUwMCxcblxuICAgIC8qKlxuICAgICAqIEVtYmVkIFNXRiBpbmZvIHBhZ2UuIFRoaXMgZnVuY3Rpb24gaGFzIHNhbWUgb3B0aW9ucyBhcyBzd2ZvYmplY3QuZW1iZWRTV0ZcbiAgICAgKiBAc2VlIGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9zd2ZvYmplY3Qvd2lraS9hcGlcbiAgICAgKiBAcGFyYW0gc3dmVXJsU3RyXG4gICAgICogQHBhcmFtIHJlcGxhY2VFbGVtSWRTdHJcbiAgICAgKiBAcGFyYW0gd2lkdGhTdHJcbiAgICAgKiBAcGFyYW0gaGVpZ2h0U3RyXG4gICAgICogQHBhcmFtIHN3ZlZlcnNpb25TdHJcbiAgICAgKiBAcGFyYW0geGlTd2ZVcmxTdHJcbiAgICAgKiBAcGFyYW0gZmxhc2h2YXJzT2JqXG4gICAgICogQHBhcmFtIHBhck9ialxuICAgICAqIEBwYXJhbSBhdHRPYmpcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2tGblxuICAgICAqL1xuICAgIGVtYmVkU1dGOiBmdW5jdGlvbihzd2ZVcmxTdHIsIHJlcGxhY2VFbGVtSWRTdHIsIHdpZHRoU3RyLCBoZWlnaHRTdHIsIHN3ZlZlcnNpb25TdHIsIHhpU3dmVXJsU3RyLCBmbGFzaHZhcnNPYmosXG4gICAgICAgICAgICAgICAgICAgICAgIHBhck9iaiwgYXR0T2JqLCBjYWxsYmFja0ZuKSB7XG4gICAgICAgIHN3Zm9iamVjdC5hZGREb21Mb2FkRXZlbnQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgcmVwbGFjZUVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChyZXBsYWNlRWxlbUlkU3RyKTtcbiAgICAgICAgICAgIGlmICghcmVwbGFjZUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gY3JlYXRlIGRpdi13cmFwcGVyIGJlY2F1c2Ugc29tZSBmbGFzaCBibG9jayBwbHVnaW5zIHJlcGxhY2Ugc3dmIHdpdGggYW5vdGhlciBjb250ZW50LlxuICAgICAgICAgICAgLy8gQWxzbyBzb21lIGZsYXNoIHJlcXVpcmVzIHdyYXBwZXIgdG8gd29yayBwcm9wZXJseS5cbiAgICAgICAgICAgIHZhciB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICB3cmFwcGVyLmNsYXNzTmFtZSA9IEZsYXNoRW1iZWRkZXIuX19TV0ZfV1JBUFBFUl9DTEFTUztcblxuICAgICAgICAgICAgcmVwbGFjZUVsZW1lbnQucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQod3JhcHBlciwgcmVwbGFjZUVsZW1lbnQpO1xuICAgICAgICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChyZXBsYWNlRWxlbWVudCk7XG5cbiAgICAgICAgICAgIHN3Zm9iamVjdC5lbWJlZFNXRihzd2ZVcmxTdHIsIHJlcGxhY2VFbGVtSWRTdHIsIHdpZHRoU3RyLCBoZWlnaHRTdHIsIHN3ZlZlcnNpb25TdHIsIHhpU3dmVXJsU3RyLCBmbGFzaHZhcnNPYmosIHBhck9iaiwgYXR0T2JqLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgLy8gZS5zdWNjZXNzID09PSBmYWxzZSBtZWFucyB0aGF0IGJyb3dzZXIgZG9uJ3QgaGF2ZSBmbGFzaCBvciBmbGFzaCBpcyB0b28gb2xkXG4gICAgICAgICAgICAgICAgLy8gQHNlZSBodHRwOi8vY29kZS5nb29nbGUuY29tL3Avc3dmb2JqZWN0L3dpa2kvYXBpXG4gICAgICAgICAgICAgICAgaWYgKCFlIHx8IGUuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tGbihlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3dmRWxlbWVudCA9IGVbJ3JlZiddO1xuICAgICAgICAgICAgICAgICAgICAvLyBPcGVyYSAxMS41IGFuZCBhYm92ZSByZXBsYWNlcyBmbGFzaCB3aXRoIFNWRyBidXR0b25cbiAgICAgICAgICAgICAgICAgICAgLy8gbXNpZSAoYW5kIGNhbmFyeSBjaHJvbWUgMzIuMCkgY3Jhc2hlcyBvbiBzd2ZFbGVtZW50WydnZXRTVkdEb2N1bWVudCddKClcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlcGxhY2VkQnlTVkcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcGxhY2VkQnlTVkcgPSBzd2ZFbGVtZW50ICYmIHN3ZkVsZW1lbnRbJ2dldFNWR0RvY3VtZW50J10gJiYgc3dmRWxlbWVudFsnZ2V0U1ZHRG9jdW1lbnQnXSgpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoKGVycikge1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXBsYWNlZEJ5U1ZHKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvbkZhaWx1cmUoZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vc2V0IHRpbWVvdXQgdG8gbGV0IEZsYXNoQmxvY2sgcGx1Z2luIGRldGVjdCBzd2YgYW5kIHJlcGxhY2UgaXQgc29tZSBjb250ZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tGbihlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIEZsYXNoRW1iZWRkZXIuX19USU1FT1VUKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIG9uRmFpbHVyZShlKSB7XG4gICAgICAgICAgICAgICAgICAgIGUuc3VjY2VzcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFja0ZuKGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZsYXNoRW1iZWRkZXI7XG4iLCJ2YXIgc3dmb2JqZWN0ID0gcmVxdWlyZSgnLi4vbGliL2Jyb3dzZXIvc3dmb2JqZWN0Jyk7XG52YXIgRmxhc2hCbG9ja05vdGlmaWVyID0gcmVxdWlyZSgnLi9mbGFzaGJsb2Nrbm90aWZpZXInKTtcbnZhciBGbGFzaEVtYmVkZGVyID0gcmVxdWlyZSgnLi9mbGFzaGVtYmVkZGVyJyk7XG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgnLi4vbGliL2Jyb3dzZXIvZGV0ZWN0Jyk7XG5cbnZhciB3aW5TYWZhcmkgPSBkZXRlY3QucGxhdGZvcm0ub3MgPT09ICd3aW5kb3dzJyAmJiBkZXRlY3QuYnJvd3Nlci5uYW1lID09PSAnc2FmYXJpJztcblxudmFyIENPTlRBSU5FUl9DTEFTUyA9IFwieWEtZmxhc2gtcGxheWVyLXdyYXBwZXJcIjtcblxuLyoqXG4gKiDQl9Cw0LPRgNGD0LfRh9C40Log0YTQu9C10Ygt0L/Qu9C10LXRgNCwXG4gKlxuICogQGFsaWFzIEZsYXNoTWFuYWdlcn5mbGFzaExvYWRlclxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB1cmwgLSDQodGB0YvQu9C60LAg0L3QsCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7c3RyaW5nfSBtaW5WZXJzaW9uIC0g0LzQuNC90LjQvNCw0LvRjNC90LDRjyDQstC10YDRgdC40Y8g0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge3N0cmluZ3xudW1iZXJ9IGlkIC0g0LjQtNC10L3RgtC40YTQuNC60LDRgtC+0YAg0L3QvtCy0L7Qs9C+INC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtmdW5jdGlvbn0gbG9hZENhbGxiYWNrIC0g0LrQvtC70LHQtdC6INC00LvRjyDRgdC+0LHRi9GC0LjRjyDQt9Cw0LPRgNGD0LfQutC4XG4gKiBAcGFyYW0ge29iamVjdH0gZmxhc2hWYXJzIC0g0LTQsNC90L3Ri9C1INC/0LXRgNC10LTQsNCy0LDQtdC80YvQtSDQstC+INGE0LvQtdGIXG4gKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBjb250YWluZXIgLSDQutC+0L3RgtC10LnQvdC10YAg0LTQu9GPINCy0LjQtNC40LzQvtCz0L4g0YTQu9C10Ygt0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge3N0cmluZ30gc2l6ZVggLSDRgNCw0LfQvNC10YAg0L/QviDQs9C+0YDQuNC30L7QvdGC0LDQu9C4XG4gKiBAcGFyYW0ge3N0cmluZ30gc2l6ZVkgLSDRgNCw0LfQvNC10YAg0L/QviDQstC10YDRgtC40LrQsNC70LhcbiAqXG4gKiBAcmV0dXJucyB7SFRNTEVsZW1lbnR9IC0tINCa0L7QvdGC0LXQudC90LXRgCDRhNC70LXRiC3Qv9C70LXQtdGA0LBcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih1cmwsIG1pblZlcnNpb24sIGlkLCBsb2FkQ2FsbGJhY2ssIGZsYXNoVmFycywgY29udGFpbmVyLCBzaXplWCwgc2l6ZVkpIHtcbiAgICB2YXIgJGZsYXNoUGxheWVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAkZmxhc2hQbGF5ZXIuaWQgPSBcIndyYXBwZXJfXCIgKyBpZDtcbiAgICAkZmxhc2hQbGF5ZXIuaW5uZXJIVE1MID0gJzxkaXYgaWQ9XCInICsgaWQgKyAnXCI+PC9kaXY+JztcblxuICAgIHNpemVYID0gc2l6ZVggfHwgXCIxMDAwXCI7XG4gICAgc2l6ZVkgPSBzaXplWSB8fCBcIjEwMDBcIjtcblxuICAgIHZhciBlbWJlZGRlcixcbiAgICAgICAgZmxhc2hTaXplWCxcbiAgICAgICAgZmxhc2hTaXplWSxcbiAgICAgICAgb3B0aW9ucztcblxuICAgIGlmIChjb250YWluZXIgJiYgIXdpblNhZmFyaSkge1xuICAgICAgICBlbWJlZGRlciA9IEZsYXNoRW1iZWRkZXI7XG4gICAgICAgIGZsYXNoU2l6ZVggPSBzaXplWDsgZmxhc2hTaXplWSA9IHNpemVZO1xuICAgICAgICBvcHRpb25zID0geyBhbGxvd3NjcmlwdGFjY2VzczogXCJhbHdheXNcIiwgd21vZGU6IFwidHJhbnNwYXJlbnRcIiB9O1xuXG4gICAgICAgICRmbGFzaFBsYXllci5jbGFzc05hbWUgPSBDT05UQUlORVJfQ0xBU1M7XG4gICAgICAgICRmbGFzaFBsYXllci5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOiByZWxhdGl2ZTsgd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgb3ZlcmZsb3c6IGhpZGRlbjsnO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoJGZsYXNoUGxheWVyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBlbWJlZGRlciA9IEZsYXNoQmxvY2tOb3RpZmllcjtcbiAgICAgICAgZmxhc2hTaXplWCA9IGZsYXNoU2l6ZVkgPSBcIjFcIjtcbiAgICAgICAgb3B0aW9ucyA9IHsgYWxsb3dzY3JpcHRhY2Nlc3M6IFwiYWx3YXlzXCIgfTtcblxuICAgICAgICAkZmxhc2hQbGF5ZXIuc3R5bGUuY3NzVGV4dCA9ICdwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IC0xcHg7IHRvcDogLTFweDsgd2lkdGg6IDBweDsgaGVpZ2h0OiAwcHg7IG92ZXJmbG93OiBoaWRkZW47JztcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCgkZmxhc2hQbGF5ZXIpO1xuICAgIH1cblxuICAgIGVtYmVkZGVyLmVtYmVkU1dGKFxuICAgICAgICB1cmwsXG4gICAgICAgIGlkLFxuICAgICAgICBmbGFzaFNpemVYLFxuICAgICAgICBmbGFzaFNpemVZLFxuICAgICAgICBtaW5WZXJzaW9uLFxuICAgICAgICBcIlwiLFxuICAgICAgICBmbGFzaFZhcnMsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHt9LFxuICAgICAgICBsb2FkQ2FsbGJhY2tcbiAgICApO1xuXG4gICAgcmV0dXJuICRmbGFzaFBsYXllcjtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFtcbiAgICB7IC8vINGB0L7RhdGA0LDQvdGP0LXRgtGB0Y8g0LIgbG9jYWxzdG9yYWdlXG4gICAgICAgIFwiaWRcIjogXCJjdXN0b21cIixcbiAgICAgICAgXCJwcmVhbXBcIjogMCxcbiAgICAgICAgXCJiYW5kc1wiOiBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcImRlZmF1bHRcIixcbiAgICAgICAgXCJwcmVhbXBcIjogMCxcbiAgICAgICAgXCJiYW5kc1wiOiBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIkNsYXNzaWNhbFwiLFxuICAgICAgICBcInByZWFtcFwiOiAtMC41LFxuICAgICAgICBcImJhbmRzXCI6IFstMC41LCAtMC41LCAtMC41LCAtMC41LCAtMC41LCAtMC41LCAtMy41LCAtMy41LCAtMy41LCAtNC41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiQ2x1YlwiLFxuICAgICAgICBcInByZWFtcFwiOiAtMy4zNTk5OTk4OTUwOTU4MjUsXG4gICAgICAgIFwiYmFuZHNcIjogWy0wLjUsIC0wLjUsIDQsIDIuNSwgMi41LCAyLjUsIDEuNSwgLTAuNSwgLTAuNSwgLTAuNV1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIkRhbmNlXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0yLjE1OTk5OTg0NzQxMjEwOTQsXG4gICAgICAgIFwiYmFuZHNcIjogWzQuNSwgMy41LCAxLCAtMC41LCAtMC41LCAtMi41LCAtMy41LCAtMy41LCAtMC41LCAtMC41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiRnVsbCBCYXNzXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0zLjU5OTk5OTkwNDYzMjU2ODQsXG4gICAgICAgIFwiYmFuZHNcIjogWzQsIDQuNSwgNC41LCAyLjUsIDAuNSwgLTIsIC00LCAtNSwgLTUuNSwgLTUuNV1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIkZ1bGwgQmFzcyAmIFRyZWJsZVwiLFxuICAgICAgICBcInByZWFtcFwiOiAtNS4wMzk5OTk5NjE4NTMwMjcsXG4gICAgICAgIFwiYmFuZHNcIjogWzMuNSwgMi41LCAtMC41LCAtMy41LCAtMiwgMC41LCA0LCA1LjUsIDYsIDZdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJGdWxsIFRyZWJsZVwiLFxuICAgICAgICBcInByZWFtcFwiOiAtNixcbiAgICAgICAgXCJiYW5kc1wiOiBbLTQuNSwgLTQuNSwgLTQuNSwgLTIsIDEsIDUuNSwgOCwgOCwgOCwgOF1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIkxhcHRvcCBTcGVha2VycyAvIEhlYWRwaG9uZVwiLFxuICAgICAgICBcInByZWFtcFwiOiAtNC4wNzk5OTk5MjM3MDYwNTUsXG4gICAgICAgIFwiYmFuZHNcIjogWzIsIDUuNSwgMi41LCAtMS41LCAtMSwgMC41LCAyLCA0LjUsIDYsIDddXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJMYXJnZSBIYWxsXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0zLjU5OTk5OTkwNDYzMjU2ODQsXG4gICAgICAgIFwiYmFuZHNcIjogWzUsIDUsIDIuNSwgMi41LCAtMC41LCAtMiwgLTIsIC0yLCAtMC41LCAtMC41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiTGl2ZVwiLFxuICAgICAgICBcInByZWFtcFwiOiAtMi42Mzk5OTk4NjY0ODU1OTU3LFxuICAgICAgICBcImJhbmRzXCI6IFstMiwgLTAuNSwgMiwgMi41LCAyLjUsIDIuNSwgMiwgMSwgMSwgMV1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIlBhcnR5XCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0yLjYzOTk5OTg2NjQ4NTU5NTcsXG4gICAgICAgIFwiYmFuZHNcIjogWzMuNSwgMy41LCAtMC41LCAtMC41LCAtMC41LCAtMC41LCAtMC41LCAtMC41LCAzLjUsIDMuNV1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIlBvcFwiLFxuICAgICAgICBcInByZWFtcFwiOiAtMy4xMTk5OTk4ODU1NTkwODIsXG4gICAgICAgIFwiYmFuZHNcIjogWy0wLjUsIDIsIDMuNSwgNCwgMi41LCAtMC41LCAtMSwgLTEsIC0wLjUsIC0wLjVdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJSZWdnYWVcIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTQuMDc5OTk5OTIzNzA2MDU1LFxuICAgICAgICBcImJhbmRzXCI6IFstMC41LCAtMC41LCAtMC41LCAtMi41LCAtMC41LCAzLCAzLCAtMC41LCAtMC41LCAtMC41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiUm9ja1wiLFxuICAgICAgICBcInByZWFtcFwiOiAtNS4wMzk5OTk5NjE4NTMwMjcsXG4gICAgICAgIFwiYmFuZHNcIjogWzQsIDIsIC0yLjUsIC00LCAtMS41LCAyLCA0LCA1LjUsIDUuNSwgNS41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiU2thXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC01LjUxOTk5OTk4MDkyNjUxNCxcbiAgICAgICAgXCJiYW5kc1wiOiBbLTEsIC0yLCAtMiwgLTAuNSwgMiwgMi41LCA0LCA0LjUsIDUuNSwgNC41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiU29mdFwiLFxuICAgICAgICBcInByZWFtcFwiOiAtNC43OTk5OTk3MTM4OTc3MDUsXG4gICAgICAgIFwiYmFuZHNcIjogWzIsIDAuNSwgLTAuNSwgLTEsIC0wLjUsIDIsIDQsIDQuNSwgNS41LCA2XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiU29mdCBSb2NrXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0yLjYzOTk5OTg2NjQ4NTU5NTcsXG4gICAgICAgIFwiYmFuZHNcIjogWzIsIDIsIDEsIC0wLjUsIC0yLCAtMi41LCAtMS41LCAtMC41LCAxLCA0XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiVGVjaG5vXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0zLjgzOTk5OTkxNDE2OTMxMTUsXG4gICAgICAgIFwiYmFuZHNcIjogWzQsIDIuNSwgLTAuNSwgLTIuNSwgLTIsIC0wLjUsIDQsIDQuNSwgNC41LCA0XVxuICAgIH1cbl07XG4iLCJ2YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vLi4vbGliL2FzeW5jL2V2ZW50cycpO1xuXG4vKipcbiAqINCe0L/QuNGB0LDQvdC40LUg0L3QsNGB0YLRgNC+0LXQuiDRjdC60LLQsNC70LDQudC30LXRgNCwXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSB5YS5BdWRpby5meC5FcXVhbGl6ZXJ+RXF1YWxpemVyUHJlc2V0XG4gKlxuICogQHByb3BlcnR5IHtTdHJpbmd9IFtpZF0gLSDQuNC00LXQvdGC0LjRhNC40LrQsNGC0L7RgCDQvdCw0YHRgtGA0L7QtdC6XG4gKiBAcHJvcGVydHkge051bWJlcn0gcHJlYW1wIC0g0L/RgNC10LTRg9GB0LjQu9C40YLQtdC70YxcbiAqIEBwcm9wZXJ0eSB7QXJyYXkuPE51bWJlcj59IC0g0LfQvdCw0YfQtdC90LjRjyDQtNC70Y8g0L/QvtC70L7RgSDRjdC60LLQsNC70LDQudC30LXRgNCwXG4gKi9cblxuLyoqXG4gKiDQodC+0LHRi9GC0LjQtSDQuNC30LzQtdC90LXQvdC40Y8g0L/QvtC70L7RgdGLINC/0YDQvtC/0YPRgdC60LDQvdC40Y8gKHtAbGluayB5YS5BdWRpby5meC5FcXVhbGl6ZXIuRVZFTlRfQ0hBTkdFfSlcbiAqIEBldmVudCB5YS5BdWRpby5meC5FcXVhbGl6ZXIjY2hhbmdlXG4gKiBAcGFyYW0ge051bWJlcn0gZnJlcSAtINGH0LDRgdGC0L7RgtCwINC/0L7Qu9C+0YHRiyDQv9GA0L7Qv9GD0YHQutCw0L3QuNGPXG4gKiBAcGFyYW0ge051bWJlcn0gdmFsdWUgLSDQt9C90LDRh9C10L3QuNC1INGD0YHQuNC70LXQvdC40Y9cbiAqL1xuXG4vKipcbiAqINCt0LrQstCw0LvQsNC50LfQtdGAXG4gKiBAYWxpYXMgeWEuQXVkaW8uZnguRXF1YWxpemVyXG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gYXVkaW9Db250ZXh0IC0g0LrQvtC90YLQtdC60YHRgiBXZWIgQXVkaW8gQVBJXG4gKiBAcGFyYW0ge0FycmF5LjxOdW1iZXI+fSBiYW5kcyAtINGB0L/QuNGB0L7QuiDRh9Cw0YHRgtC+0YIg0LTQu9GPINC/0L7Qu9C+0YEg0Y3QutCy0LDQu9Cw0LnQt9C10YDQsFxuICpcbiAqIEBleHRlbmRzIEV2ZW50c1xuICpcbiAqIEBmaXJlcyB5YS5BdWRpby5meC5FcXVhbGl6ZXIjY2hhbmdlXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBFcXVhbGl6ZXIgPSBmdW5jdGlvbihhdWRpb0NvbnRleHQsIGJhbmRzKSB7XG4gICAgRXZlbnRzLmNhbGwodGhpcyk7XG5cbiAgICB0aGlzLnByZWFtcCA9IG5ldyBFcXVhbGl6ZXJCYW5kKGF1ZGlvQ29udGV4dCwgXCJoaWdoc2hlbGZcIiwgMCk7XG4gICAgdGhpcy5wcmVhbXAub24oXCIqXCIsIHRoaXMuX29uQmFuZEV2ZW50LmJpbmQodGhpcywgdGhpcy5wcmVhbXApKTtcblxuICAgIHZhciBwcmV2O1xuICAgIHRoaXMuYmFuZHMgPSBiYW5kcy5tYXAoZnVuY3Rpb24oZnJlcXVlbmN5LCBpZHgpIHtcbiAgICAgICAgdmFyIGJhbmQgPSBuZXcgRXF1YWxpemVyQmFuZChcbiAgICAgICAgICAgIGF1ZGlvQ29udGV4dCxcblxuICAgICAgICAgICAgaWR4ID09IDAgPyAnbG93c2hlbGYnXG4gICAgICAgICAgICAgICAgOiBpZHggKyAxIDwgYmFuZHMubGVuZ3RoID8gXCJwZWFraW5nXCJcbiAgICAgICAgICAgICAgICA6IFwiaGlnaHNoZWxmXCIsXG5cbiAgICAgICAgICAgIGZyZXF1ZW5jeVxuICAgICAgICApO1xuICAgICAgICBiYW5kLm9uKFwiKlwiLCB0aGlzLl9vbkJhbmRFdmVudC5iaW5kKHRoaXMsIGJhbmQpKTtcblxuICAgICAgICBpZiAoIXByZXYpIHtcbiAgICAgICAgICAgIHRoaXMucHJlYW1wLmZpbHRlci5jb25uZWN0KGJhbmQuZmlsdGVyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByZXYuZmlsdGVyLmNvbm5lY3QoYmFuZC5maWx0ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJldiA9IGJhbmQ7XG4gICAgICAgIHJldHVybiBiYW5kO1xuICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICB0aGlzLmlucHV0ID0gdGhpcy5wcmVhbXAuZmlsdGVyO1xuICAgIHRoaXMub3V0cHV0ID0gdGhpcy5iYW5kc1t0aGlzLmJhbmRzLmxlbmd0aCAtIDFdLmZpbHRlcjtcbn07XG5cbkV2ZW50cy5taXhpbihFcXVhbGl6ZXIpO1xuXG4vKiogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5FcXVhbGl6ZXIuRVZFTlRfQ0hBTkdFID0gXCJjaGFuZ2VcIjtcblxuLyoqIEB0eXBlIHtBcnJheS48TnVtYmVyPn1cbiAqIEBjb25zdFxuICovXG5FcXVhbGl6ZXIuREVGQVVMVF9CQU5EUyA9IFs2MCwgMTcwLCAzMTAsIDYwMCwgMTAwMCwgMzAwMCwgNjAwMCwgMTIwMDAsIDE0MDAwLCAxNjAwMF07XG5cbi8qKiBAdHlwZSB7T2JqZWN0LjxTdHJpbmcsIHlhLkF1ZGlvLmZ4LkVxdWFsaXplcn5FcXVhbGl6ZXJQcmVzZXQ+fVxuICogQGNvbnN0XG4gKi9cbkVxdWFsaXplci5ERUZBVUxUX1BSRVNFVFMgPSByZXF1aXJlKCcuL2RlZmF1bHQucHJlc2V0cy5qcycpO1xuXG4vKipcbiAqINCe0LHRgNCw0LHQvtGC0LrQsCDRgdC+0LHRi9GC0LjRjyDQv9C+0LvQvtGB0Ysg0Y3QutCy0LDQu9Cw0LnQt9C10YDQsFxuICogQHBhcmFtIHtFcXVhbGl6ZXJCYW5kfSBiYW5kIC0g0L/QvtC70L7RgdCwINGN0LrQstCw0LvQsNC50LfQtdGA0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAtINGB0L7QsdGL0YLQuNC1XG4gKiBAcGFyYW0geyp9IGRhdGEgLSDQtNCw0L3QvdGL0LUg0YHQvtCx0YvRgtC40Y9cbiAqIEBwcml2YXRlXG4gKi9cbkVxdWFsaXplci5wcm90b3R5cGUuX29uQmFuZEV2ZW50ID0gZnVuY3Rpb24oYmFuZCwgZXZlbnQsIGRhdGEpIHtcbiAgICB0aGlzLnRyaWdnZXIoZXZlbnQsIGJhbmQuZ2V0RnJlcSgpLCBkYXRhKTtcbn07XG5cbi8qKlxuICog0JfQsNCz0YDRg9C30LjRgtGMINC90LDRgdGC0YDQvtC50LrQuFxuICogQHBhcmFtIHt5YS5BdWRpby5meC5FcXVhbGl6ZXJ+RXF1YWxpemVyUHJlc2V0fSBwcmVzZXQgLSDQvdCw0YHRgtGA0L7QudC60LhcbiAqL1xuRXF1YWxpemVyLnByb3RvdHlwZS5sb2FkUHJlc2V0ID0gZnVuY3Rpb24ocHJlc2V0KSB7XG4gICAgcHJlc2V0LmJhbmRzLmZvckVhY2goZnVuY3Rpb24odmFsdWUsIGlkeCkge1xuICAgICAgICB0aGlzLmJhbmRzW2lkeF0uc2V0VmFsdWUodmFsdWUpO1xuICAgIH0uYmluZCh0aGlzKSk7XG4gICAgdGhpcy5wcmVhbXAuc2V0VmFsdWUocHJlc2V0LnByZWFtcCk7XG59O1xuXG4vKipcbiAqINCh0L7RhdGA0LDQvdC40YLRjCDRgtC10LrRg9GJ0LjQtSDQvdCw0YHRgtGA0L7QudC60LhcbiAqIEByZXR1cm5zIHt5YS5BdWRpby5meC5FcXVhbGl6ZXJ+RXF1YWxpemVyUHJlc2V0fVxuICovXG5FcXVhbGl6ZXIucHJvdG90eXBlLnNhdmVQcmVzZXQgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBwcmVhbXA6IHRoaXMucHJlYW1wLmdldFZhbHVlKCksXG4gICAgICAgIGJhbmRzOiB0aGlzLmJhbmRzLm1hcChmdW5jdGlvbihiYW5kKSB7IHJldHVybiBiYW5kLmdldFZhbHVlKCk7IH0pXG4gICAgfTtcbn07XG5cbi8vVE9ETzog0L/RgNC+0LLQtdGA0LjRgtGMINC/0YDQtdC00L/QvtC70L7QttC10L3QuNC1ICjRgdC60L7RgNC10LUg0LLRgdC10LPQviDQvdGD0LbQvdCwINC60LDRgNGC0LAg0LLQtdGB0L7QsiDQtNC70Y8g0YDQsNC30LvQuNGH0L3Ri9GFINGH0LDRgdGC0L7RgiDQuNC70Lgg0LTQsNC20LUg0L3QtdC60LDRjyDRhNGD0L3QutGG0LjRjylcbi8qKlxuICogKirQrdC60YHQv9C10YDQuNC80LXQvdGC0LDQu9GM0L3QvioqIC0g0LLRi9GH0LjQu9GP0LXRgiDQvtC/0YLQuNC80LDQu9GM0L3QvtC1INC30L3QsNGH0L3QuNC1INC/0YDQtdC00YPRgdC40LvQtdC90LjRj1xuICogQGV4cGVyaW1lbnRhbFxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuRXF1YWxpemVyLnByb3RvdHlwZS5ndWVzc1ByZWFtcCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciB2ID0gMDtcbiAgICBmb3IgKHZhciBrID0gMCwgbCA9IHRoaXMuYmFuZHMubGVuZ3RoOyBrIDwgbDsgaysrKSB7XG4gICAgICAgIHYgKz0gdGhpcy5iYW5kc1trXS5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIHJldHVybiAtdiAvIDI7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0KTQuNC70YzRgtGAINGN0LrQstCw0LvQsNC50LfQtdGA0LBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0LjQt9C80LXQvdC10L3QuNGPINC30L3QsNGH0LXQvdC40Y8g0YPRgdC40LvQtdC90LjRjyAoe0BsaW5rIHlhLkF1ZGlvLmZ4LkVxdWFsaXplci5FVkVOVF9DSEFOR0V9KVxuICogQGV2ZW50IHlhLkF1ZGlvLmZ4LkVxdWFsaXplcn5FcXVhbGl6ZXJCYW5kI2NoYW5nZVxuICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlIC0g0L3QvtCy0L7QtSDQt9C90LDRh9C10L3QuNC1XG4gKi9cblxuLyoqXG4gKiDQn9C+0LvQvtGB0LAg0L/RgNC+0L/Rg9GB0LrQsNC90LjRjyDRjdC60LLQsNC70LDQudC30LXRgNCwXG4gKiBAYWxpYXMgeWEuQXVkaW8uZnguRXF1YWxpemVyfkVxdWFsaXplckJhbmRcbiAqXG4gKiBAZXh0ZW5kcyBFdmVudHNcbiAqXG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gYXVkaW9Db250ZXh0IC0g0LrQvtC90YLQtdC60YHRgiBXZWIgQXVkaW8gQVBJXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSAtINGC0LjQvyDRhNC40LvRjNGC0YDQsFxuICogQHBhcmFtIHtOdW1iZXJ9IGZyZXF1ZW5jeSAtINGH0LDRgdGC0L7RgtCwINGE0LjQu9GM0YLRgNCwXG4gKlxuICogQGZpcmVzIHlhLkF1ZGlvLmZ4LkVxdWFsaXplcn5FcXVhbGl6ZXJCYW5kI2NoYW5nZVxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgRXF1YWxpemVyQmFuZCA9IGZ1bmN0aW9uKGF1ZGlvQ29udGV4dCwgdHlwZSwgZnJlcXVlbmN5KSB7XG4gICAgRXZlbnRzLmNhbGwodGhpcyk7XG5cbiAgICB0aGlzLnR5cGUgPSB0eXBlO1xuXG4gICAgdGhpcy5maWx0ZXIgPSBhdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgdGhpcy5maWx0ZXIudHlwZSA9IHR5cGU7XG4gICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gZnJlcXVlbmN5O1xuICAgIHRoaXMuZmlsdGVyLlEudmFsdWUgPSAxO1xuICAgIHRoaXMuZmlsdGVyLmdhaW4udmFsdWUgPSAwO1xufTtcbkV2ZW50cy5taXhpbihFcXVhbGl6ZXJCYW5kKTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINGH0LDRgdGC0L7RgtGDINC/0L7Qu9C+0YHRiyDQv9GA0L7Qv9GD0YHQutCw0L3QuNGPXG4gKiBAcmV0dXJucyB7TnVtYmVyfVxuICovXG5FcXVhbGl6ZXJCYW5kLnByb3RvdHlwZS5nZXRGcmVxID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS52YWx1ZTtcbn07XG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQt9C90LDRh9C10L3QuNC1INGD0YHQuNC70LXQvdC40Y9cbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkVxdWFsaXplckJhbmQucHJvdG90eXBlLmdldFZhbHVlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyLmdhaW4udmFsdWU7XG59O1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LjRgtGMINC30L3QsNGH0LXQvdC40LUg0YPRgdC40LvQtdC90LjRj1xuICogQHBhcmFtIHZhbHVlXG4gKi9cbkVxdWFsaXplckJhbmQucHJvdG90eXBlLnNldFZhbHVlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB0aGlzLmZpbHRlci5nYWluLnZhbHVlID0gdmFsdWU7XG4gICAgdGhpcy50cmlnZ2VyKEVxdWFsaXplci5FVkVOVF9DSEFOR0UsIHZhbHVlKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRXF1YWxpemVyO1xuIiwicmVxdWlyZSgnLi4vZXhwb3J0Jyk7XG5cbnlhLkF1ZGlvLmZ4LkVxdWFsaXplciA9IHJlcXVpcmUoJy4vZXF1YWxpemVyJyk7XG4iLCJyZXF1aXJlKCcuLi9leHBvcnQnKTtcblxueWEuQXVkaW8uZnggPSB7fTtcbiIsInZhciBMb2dnZXIgPSByZXF1aXJlKCcuLi9sb2dnZXIvbG9nZ2VyJyk7XG52YXIgbG9nZ2VyID0gbmV3IExvZ2dlcignQXVkaW9IVE1MNScpO1xuXG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgnLi4vbGliL2Jyb3dzZXIvZGV0ZWN0Jyk7XG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vbGliL2FzeW5jL2V2ZW50cycpO1xudmFyIEF1ZGlvU3RhdGljID0gcmVxdWlyZSgnLi4vYXVkaW8tc3RhdGljJyk7XG52YXIgUGxheWJhY2tFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yL3BsYXliYWNrLWVycm9yJyk7XG5cbnZhciBwbGF5ZXJJZCA9IDE7XG5cbmV4cG9ydHMuYXZhaWxhYmxlID0gKGZ1bmN0aW9uKCkge1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSDQkdCw0LfQvtCy0LDRjyDQv9GA0L7QstC10YDQutCwINC/0L7QtNC00LXRgNC20LrQuCDQsdGA0LDRg9C30LXRgNC+0LxcbiAgICB2YXIgaHRtbDVfYXZhaWxhYmxlID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgICAvL3NvbWUgYnJvd3NlcnMgZG9lc24ndCB1bmRlcnN0YW5kIG5ldyBBdWRpbygpXG4gICAgICAgIHZhciBhdWRpbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJyk7XG4gICAgICAgIHZhciBjYW5QbGF5ID0gYXVkaW8uY2FuUGxheVR5cGUoXCJhdWRpby9tcGVnXCIpO1xuICAgICAgICBpZiAoIWNhblBsYXkgfHwgY2FuUGxheSA9PT0gJ25vJykge1xuXG4gICAgICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcIkhUTUw1IGRldGVjdGlvbiBmYWlsZWQgd2l0aCByZWFzb25cIiwgY2FuUGxheSk7XG4gICAgICAgICAgICBodG1sNV9hdmFpbGFibGUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcIkhUTUw1IGRldGVjdGlvbiBmYWlsZWQgd2l0aCBlcnJvclwiLCBlKTtcbiAgICAgICAgaHRtbDVfYXZhaWxhYmxlID0gZmFsc2U7XG4gICAgfVxuXG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJkZXRlY3Rpb25cIiwgaHRtbDVfYXZhaWxhYmxlKTtcbiAgICByZXR1cm4gaHRtbDVfYXZhaWxhYmxlO1xufSkoKTtcblxudHJ5IHtcbiAgICB2YXIgYXVkaW9Db250ZXh0ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwiV2VuQXVkaW9BUEkgY29udGV4dCBjcmVhdGVkXCIpO1xufSBjYXRjaChlKSB7XG4gICAgYXVkaW9Db250ZXh0ID0gbnVsbDtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcIldlbkF1ZGlvQVBJIG5vdCBkZXRlY3RlZFwiKTtcbn1cblxuLyoqXG4gKiBAY2xhc3Mg0JrQu9Cw0YHRgSBodG1sNSDQsNGD0LTQuNC+LdC/0LvQtdC10YDQsFxuICogQGV4dGVuZHMgSUF1ZGlvSW1wbGVtZW50YXRpb25cbiAqXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jcGxheVxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI2VuZGVkXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jdm9sdW1lY2hhbmdlXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jY3Jhc2hlZFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI3N3YXBcbiAqXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jc3RvcFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI3BhdXNlXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jcHJvZ3Jlc3NcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNsb2FkaW5nXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jbG9hZGVkXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jZXJyb3JcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwcml2YXRlXG4gKi9cbnZhciBBdWRpb0hUTUw1ID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5uYW1lID0gcGxheWVySWQrKztcbiAgICBsb2dnZXIuZGVidWcodGhpcywgXCJjb25zdHJ1Y3RvclwiKTtcblxuICAgIEV2ZW50cy5jYWxsKHRoaXMpO1xuICAgIHRoaXMub24oXCIqXCIsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIm9uRXZlbnRcIiwgZXZlbnQpO1xuICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICB0aGlzLndlYkF1ZGlvQXBpID0gZmFsc2U7XG5cbiAgICB0aGlzLmFjdGl2ZUxvYWRlciA9IDA7XG5cbiAgICB0aGlzLmxvYWRlcnMgPSBbXTtcbiAgICB0aGlzLmxpc3RlbmVycyA9IFtdO1xuXG4gICAgdGhpcy5fYWRkTG9hZGVyKCk7XG4gICAgdGhpcy5fYWRkTG9hZGVyKCk7XG5cbiAgICB0aGlzLl9zZXRBY3RpdmUoMCk7XG59O1xuRXZlbnRzLm1peGluKEF1ZGlvSFRNTDUpO1xuQXVkaW9IVE1MNS50eXBlID0gQXVkaW9IVE1MNS5wcm90b3R5cGUudHlwZSA9IFwiaHRtbDVcIjtcblxuLyoqXG4gKiDQndCw0YLQuNCy0L3QvtC1INGB0L7QsdGL0YLQuNC1INC90LDRh9Cw0LvQsCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfUExBWSA9IFwicGxheVwiO1xuLyoqXG4gKiDQndCw0YLQuNCy0L3QvtC1INGB0L7QsdGL0YLQuNC1INC/0LDRg9C30YtcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfUEFVU0UgPSBcInBhdXNlXCI7XG4vKipcbiAqINCd0LDRgtC40LLQvdC+0LUg0YHQvtCx0YvRgtC40LUg0L7QsdC90L7QstC70LXQvdC40LUg0L/QvtC30LjRhtC40Lgg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDUuRVZFTlRfTkFUSVZFX1RJTUVVUERBVEUgPSBcInRpbWV1cGRhdGVcIjtcbi8qKlxuICog0J3QsNGC0LjQstC90L7QtSDRgdC+0LHRi9GC0LjQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDRgtGA0LXQutCwXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDUuRVZFTlRfTkFUSVZFX0VOREVEID0gXCJlbmRlZFwiO1xuLyoqXG4gKiDQndCw0YLQuNCy0L3QvtC1INGB0L7QsdGL0YLQuNC1INC40LfQvNC10L3QtdC90LjRjyDQtNC70LjRgtC10LvRjNC90L7RgdGC0LhcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfRFVSQVRJT04gPSBcImR1cmF0aW9uY2hhbmdlXCI7XG4vKipcbiAqINCd0LDRgtC40LLQvdC+0LUg0YHQvtCx0YvRgtC40LUg0LjQt9C80LXQvdC10L3QuNGPINC00LvQuNGC0LXQu9GM0L3QvtGB0YLQuCDQt9Cw0LPRgNGD0LbQtdC90L3QvtC5INGH0LDRgdGC0LhcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfTE9BRElORyA9IFwicHJvZ3Jlc3NcIjtcbi8qKlxuICog0J3QsNGC0LjQstC90L7QtSDRgdC+0LHRi9GC0LjQtSDQtNC+0YHRgtGD0L/QvdC+0YHRgtC4INC80LXRgtCwLdC00LDQvdC90YvRhSDRgtGA0LXQutCwXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDUuRVZFTlRfTkFUSVZFX01FVEEgPSBcImxvYWRlZG1ldGFkYXRhXCI7XG4vKipcbiAqINCd0LDRgtC40LLQvdC+0LUg0YHQvtCx0YvRgtC40LUg0LLQvtC30LzQvtC20L3QvtGB0YLQuCDQvdCw0YfQsNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1XG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDUuRVZFTlRfTkFUSVZFX0NBTlBMQVkgPSBcImNhbnBsYXlcIjtcbi8qKlxuICog0J3QsNGC0LjQstC90L7QtSDRgdC+0LHRi9GC0LjQtSDQvtGI0LjQsdC60LhcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfRVJST1IgPSBcImVycm9yXCI7XG5cbi8qKlxuICog0JTQvtCx0LDQstC40YLRjCDQt9Cw0LPRgNGD0LfRh9C40Log0LDRg9C00LjQvi3RhNCw0LnQu9C+0LJcbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLl9hZGRMb2FkZXIgPSBmdW5jdGlvbigpIHtcbiAgICBsb2dnZXIuZGVidWcodGhpcywgXCJfYWRkTG9hZGVyXCIpO1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdmFyIGxvYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJyk7XG4gICAgdmFyIGxpc3RlbmVyID0gbmV3IEV2ZW50cygpO1xuXG4gICAgbG9hZGVyLmxvb3AgPSBmYWxzZTsgLy8gZm9yIElFXG4gICAgbG9hZGVyLnByZWxvYWQgPSBsb2FkZXIuYXV0b2J1ZmZlciA9IFwiYXV0b1wiOyAvLyAxMDAlXG5cbiAgICBsb2FkZXIuc3RhcnRQbGF5ID0gZnVuY3Rpb24oKSB7IC8vSU5GTzog0Y3RgtCwINC60L7QvdGB0YLRgNGD0LrRhtC40Y8g0L3Rg9C20L3QsCwg0YfRgtC+0LHRiyDQvdC1INC80LXQvdGP0YLRjCDQu9C+0LPQuNC60YMg0L/RgNC4IHJlc3VtZVxuICAgICAgICBsb2FkZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1LkVWRU5UX05BVElWRV9NRVRBLCBsb2FkZXIuc3RhcnRQbGF5KTtcbiAgICAgICAgbG9hZGVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfQ0FOUExBWSwgbG9hZGVyLnN0YXJ0UGxheSk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxvYWRlci5wbGF5KCk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoc2VsZiwgXCJzdGFydFBsYXlcIik7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKHNlbGYsIFwiY3Jhc2hlZFwiLCBlKTtcbiAgICAgICAgICAgIGxpc3RlbmVyLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfQ1JBU0hFRCwgZSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIGxhc3RVcGRhdGUgPSAwO1xuICAgIHZhciB1cGRhdGVQcm9ncmVzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY3VycmVudFRpbWUgPSArbmV3IERhdGUoKTtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gbGFzdFVwZGF0ZSA8IDMwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBsYXN0VXBkYXRlID0gY3VycmVudFRpbWU7XG4gICAgICAgIGxpc3RlbmVyLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfUFJPR1JFU1MpO1xuICAgIH07XG5cbiAgICBsb2FkZXIuYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1LkVWRU5UX05BVElWRV9QQVVTRSwgbGlzdGVuZXIudHJpZ2dlci5iaW5kKGxpc3RlbmVyLCBBdWRpb1N0YXRpYy5FVkVOVF9QQVVTRSkpO1xuICAgIGxvYWRlci5hZGRFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDUuRVZFTlRfTkFUSVZFX1BMQVksIGxpc3RlbmVyLnRyaWdnZXIuYmluZChsaXN0ZW5lciwgQXVkaW9TdGF0aWMuRVZFTlRfUExBWSkpO1xuXG4gICAgbG9hZGVyLmFkZEV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfRU5ERUQsIGZ1bmN0aW9uKCkge1xuICAgICAgICBsaXN0ZW5lci50cmlnZ2VyKEF1ZGlvU3RhdGljLkVWRU5UX1BST0dSRVNTKTtcbiAgICAgICAgbGlzdGVuZXIudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9FTkRFRCk7XG4gICAgfSk7XG5cbiAgICBsb2FkZXIuYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1LkVWRU5UX05BVElWRV9USU1FVVBEQVRFLCB1cGRhdGVQcm9ncmVzcyk7XG4gICAgbG9hZGVyLmFkZEV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfRFVSQVRJT04sIHVwZGF0ZVByb2dyZXNzKTtcbiAgICBsb2FkZXIuYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1LkVWRU5UX05BVElWRV9MT0FESU5HLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdXBkYXRlUHJvZ3Jlc3MoKTtcblxuICAgICAgICBpZiAobG9hZGVyLmJ1ZmZlcmVkLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIGxvYWRlZCA9IGxvYWRlci5idWZmZXJlZC5lbmQoMCkgLSBsb2FkZXIuYnVmZmVyZWQuc3RhcnQoMCk7XG5cbiAgICAgICAgICAgIGlmIChsb2FkZXIubm90TG9hZGluZyAmJiBsb2FkZWQpIHtcbiAgICAgICAgICAgICAgICBsb2FkZXIubm90TG9hZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfTE9BRElORyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChsb2FkZWQgPj0gbG9hZGVkLmR1cmF0aW9uIC0gMC4xKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9MT0FERUQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBsb2FkZXIuYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1LkVWRU5UX05BVElWRV9FUlJPUiwgZnVuY3Rpb24oZSkge1xuICAgICAgICBpZiAoIWxvYWRlci5mYWtlKSB7XG4gICAgICAgICAgICB2YXIgZXJyb3IgPSBuZXcgUGxheWJhY2tFcnJvcihsb2FkZXIuZXJyb3JcbiAgICAgICAgICAgICAgICAgICAgPyBQbGF5YmFja0Vycm9yLmh0bWw1W2xvYWRlci5lcnJvci5jb2RlXVxuICAgICAgICAgICAgICAgICAgICA6IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IGUsXG4gICAgICAgICAgICAgICAgbG9hZGVyLnNyYyk7XG5cbiAgICAgICAgICAgIGxpc3RlbmVyLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfRVJST1IsIGVycm9yKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgbGlzdGVuZXIub24oXCIqXCIsIGZ1bmN0aW9uKGV2ZW50LCBkYXRhKSB7XG4gICAgICAgIHZhciBvZmZzZXQgPSAoc2VsZi5sb2FkZXJzLmxlbmd0aCArIGxvYWRlci5pbmRleCAtIHNlbGYuYWN0aXZlTG9hZGVyKSAlIHNlbGYubG9hZGVycy5sZW5ndGg7XG4gICAgICAgIHNlbGYudHJpZ2dlcihldmVudCwgb2Zmc2V0LCBkYXRhKTtcbiAgICB9KTtcblxuICAgIGxvYWRlci5pbmRleCA9IHRoaXMubG9hZGVycy5wdXNoKGxvYWRlcikgLSAxO1xuICAgIHRoaXMubGlzdGVuZXJzLnB1c2gobGlzdGVuZXIpO1xuXG4gICAgaWYgKHRoaXMud2ViQXVkaW9BcGkpIHtcbiAgICAgICAgdGhpcy5fYWRkU291cmNlKGxvYWRlcik7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQodC+0LfQtNCw0YLRjCAo0LXRgdC70Lgg0L3QtdC+0LHRhdC+0LTQuNC80L4pINC4INC/0L7QtNC60LvRjtGH0LjRgtGMINC40YHRgtC+0YfQvdC40Log0LfQstGD0LrQsCDQtNC70Y8gV2ViIEF1ZGlvIEFQSVxuICogQHBhcmFtIHtBdWRpb30gbG9hZGVyIC0g0LfQsNCz0YDRg9C30YfQuNC6INCw0YPQtNC40L5cbiAqIEBwYXJhbSB7QXVkaW9Ob2RlfSBzb3VyY2UgLSDRjdC60LfQtdC80L/Qu9GP0YAg0LjRgdGC0L7Rh9C90LjQutCwINC30LLRg9C60LBcbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLl9hZGRTb3VyY2UgPSBmdW5jdGlvbihsb2FkZXIsIHNvdXJjZSkge1xuICAgIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIl9hZGRTb3VyY2VcIiwgbG9hZGVyKTtcblxuICAgIGlmICghc291cmNlKSB7XG4gICAgICAgIHNvdXJjZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UobG9hZGVyKTtcbiAgICAgICAgdGhpcy5zb3VyY2VzLnB1c2goc291cmNlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzb3VyY2UuZGlzY29ubmVjdCgpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnByZXByb2Nlc3Nvcikge1xuICAgICAgICBzb3VyY2UuY29ubmVjdCh0aGlzLnByZXByb2Nlc3Nvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc291cmNlLmNvbm5lY3QodGhpcy5hdWRpb091dHB1dCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQo9GB0YLQsNC90L7QstC40YLRjCDQsNC60YLQuNCy0L3Ri9C5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHBhcmFtIHtpbnR9IG9mZnNldCAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuX3NldEFjdGl2ZSA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIl9zZXRBY3RpdmVcIiwgb2Zmc2V0KTtcblxuICAgIGlmIChvZmZzZXQgIT09IDApIHtcbiAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgfVxuXG4gICAgdGhpcy5hY3RpdmVMb2FkZXIgPSAodGhpcy5hY3RpdmVMb2FkZXIgKyBvZmZzZXQpICUgdGhpcy5sb2FkZXJzLmxlbmd0aDtcbiAgICB0aGlzLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfU1dBUCwgb2Zmc2V0KTtcbn07XG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQt9Cw0LPRgNGD0LfRh9C40Log0Lgg0L7RgtC/0LjRgdCw0YLRjCDQtdCz0L4g0L7RgiDRgdC+0LHRi9GC0LjQuSDRgdGC0LDRgNGC0LAg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge0Jvb2xlYW59IHVuc3Vic2NyaWJlIC0g0L7RgtC/0LjRgdCw0YLRjNGB0Y8g0L7RgiDRgdC+0LHRi9GC0LjQuVxuICogQHBhcmFtIHtpbnR9IG9mZnNldCAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge0F1ZGlvfVxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuX2dldExvYWRlciA9IGZ1bmN0aW9uKHVuc3Vic2NyaWJlLCBvZmZzZXQpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcbiAgICB2YXIgbG9hZGVyID0gdGhpcy5sb2FkZXJzWyh0aGlzLmFjdGl2ZUxvYWRlciArIG9mZnNldCkgJSB0aGlzLmxvYWRlcnMubGVuZ3RoXTtcbiAgICBpZiAodW5zdWJzY3JpYmUpIHtcbiAgICAgICAgbG9hZGVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfTUVUQSwgbG9hZGVyLnN0YXJ0UGxheSk7XG4gICAgICAgIGxvYWRlci5yZW1vdmVFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDUuRVZFTlRfTkFUSVZFX0NBTlBMQVksIGxvYWRlci5zdGFydFBsYXkpO1xuICAgIH1cblxuICAgIHJldHVybiBsb2FkZXI7XG59O1xuXG4vL0lORk86INGN0YLQsCDQutC+0L3RgdGC0YDRg9C60YbQuNGPINC90YPQttC90LAsINGH0YLQvtCx0Ysg0L3QtSDQvNC10L3Rj9GC0Ywg0LvQvtCz0LjQutGDINC/0YDQuCByZXN1bWVcbi8qKlxuICog0JfQsNC/0YPRgdC6INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICogQHBhcmFtIHtBdWRpb30gbG9hZGVyIC0g0LfQsNCz0YDRg9C30YfQuNC6INCw0YPQtNC40L5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLl9wbGF5ID0gZnVuY3Rpb24obG9hZGVyKSB7XG4gICAgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiX3BsYXlcIik7XG5cbiAgICBpZiAobG9hZGVyLnJlYWR5U3RhdGUgPiBsb2FkZXIuSEFWRV9NRVRBREFUQSkge1xuICAgICAgICBsb2FkZXIuc3RhcnRQbGF5KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gZmlyZWZveCB3YWl0cyB0b28gbG9uZyB0aWxsICdjYW5wbGF5JyBvciAnY2FucGxheXRocm91Z2gnXG4gICAgICAgIC8vIGJ1dCBpdCBjYW4gcGxheSByaWdodCBhZnRlciAnbG9hZGVkbWV0YWRhdGEnXG4gICAgICAgIC8vIHNvIHdlIHVzZSBib3RoIGV2ZW50c1xuICAgICAgICBsb2FkZXIuYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1LkVWRU5UX05BVElWRV9NRVRBLCBsb2FkZXIuc3RhcnRQbGF5KTtcbiAgICAgICAgbG9hZGVyLmFkZEV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNS5FVkVOVF9OQVRJVkVfQ0FOUExBWSwgbG9hZGVyLnN0YXJ0UGxheSk7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQn9C10YDQtdC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINC40YHQv9C+0LvRjNC30L7QstCw0L3QuNGPIFdlYiBBdWRpbyBBUEkuINCU0L7RgdGC0YPQv9C10L0g0YLQvtC70YzQutC+INC/0YDQuCBodG1sNS3RgNC10LDQu9C40LfQsNGG0LjQuCDQv9C70LXQtdGA0LAuXG4gKlxuICogKirQktC90LjQvNCw0L3QuNC1ISoqIC0g0L/QvtGB0LvQtSDQstC60LvRjtGH0LXQvdC40Y8g0YDQtdC20LjQvNCwIFdlYiBBdWRpbyBBUEkg0L7QvSDQvdC1INC+0YLQutC70Y7Rh9Cw0LXRgtGB0Y8g0L/QvtC70L3QvtGB0YLRjNGOLCDRgi7Qui4g0LTQu9GPINGN0YLQvtCz0L4g0YLRgNC10LHRg9C10YLRgdGPXG4gKiDRgNC10LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0L/Qu9C10LXRgNCwLCDQutC+0YLQvtGA0L7QuSDRgtGA0LXQsdGD0LXRgtGB0Y8g0LrQu9C40Log0L/QvtC70YzQt9C+0LLQsNGC0LXQu9GPLiDQn9GA0Lgg0L7RgtC60LvRjtGH0LXQvdC40Lgg0LjQtyDQs9GA0LDRhNCwINC+0LHRgNCw0LHQvtGC0LrQuCDQuNGB0LrQu9GO0YfQsNGO0YLRgdGPXG4gKiDQstGB0LUg0L3QvtC00Ysg0LrRgNC+0LzQtSDQvdC+0LQt0LjRgdGC0L7Rh9C90LjQutC+0LIg0Lgg0L3QvtC00Ysg0LLRi9Cy0L7QtNCwLCDRg9C/0YDQsNCy0LvQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0YzRjiDQv9C10YDQtdC60LvRjtGH0LDQtdGC0YHRjyDQvdCwINGN0LvQtdC80LXQvdGC0YsgYXVkaW8sINCx0LXQt1xuICog0LjRgdC/0L7Qu9GM0LfQvtCy0LDQvdC40Y8gR2Fpbk5vZGVcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gc3RhdGUgLSDQt9Cw0L/RgNCw0YjQuNCy0LDQtdC80YvQuSDRgdGC0LDRgtGD0YFcbiAqIEByZXR1cm5zIHtCb29sZWFufSAtLSDQuNGC0L7Qs9C+0LLRi9C5INGB0YLQsNGC0YPRgSDQv9C70LXQtdGA0LBcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUudG9nZ2xlV2ViQXVkaW9BUEkgPSBmdW5jdGlvbihzdGF0ZSkge1xuICAgIGlmICghYXVkaW9Db250ZXh0KSB7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwidG9nZ2xlV2ViQXVkaW9BUElFcnJvclwiLCBzdGF0ZSk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInRvZ2dsZVdlYkF1ZGlvQVBJXCIsIHN0YXRlKTtcblxuICAgIGlmICh0aGlzLndlYkF1ZGlvQXBpID09IHN0YXRlKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9XG5cbiAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgdGhpcy5hdWRpb091dHB1dCA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgICAgIHRoaXMuYXVkaW9PdXRwdXQuZ2FpbiA9IHRoaXMudm9sdW1lO1xuICAgICAgICB0aGlzLmF1ZGlvT3V0cHV0LmNvbm5lY3QoYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcblxuICAgICAgICBpZiAodGhpcy5wcmVwcm9jZXNzb3IpIHtcbiAgICAgICAgICAgIHRoaXMucHJlcHJvY2Vzc29yLm91dHB1dC5jb25uZWN0KHRoaXMuYXVkaW9PdXRwdXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zb3VyY2VzID0gdGhpcy5zb3VyY2VzIHx8IFtdO1xuICAgICAgICB0aGlzLmxvYWRlcnMuZm9yRWFjaChmdW5jdGlvbihsb2FkZXIsIGlkeCkge1xuICAgICAgICAgICAgbG9hZGVyLnZvbHVtZSA9IDE7XG4gICAgICAgICAgICB2YXIgcHJlcGFyZWQgPSBsb2FkZXIuY3Jvc3NPcmlnaW47XG4gICAgICAgICAgICBsb2FkZXIuY3Jvc3NPcmlnaW4gPSBcImFub255bW91c1wiO1xuICAgICAgICAgICAgdGhpcy5fYWRkU291cmNlKGxvYWRlciwgdGhpcy5zb3VyY2VzW2lkeF0pO1xuXG4gICAgICAgICAgICBpZiAoIXByZXBhcmVkKSB7IC8vIElORk86INC/0L7RgdC70LUg0YLQvtCz0L4g0LrQsNC6INC80Ysg0LLQutC70Y7Rh9C40LvQuCB3ZWJBdWRpb0FQSSDQtdCz0L4g0YPQttC1INC90LXQu9GM0LfRjyDQv9C+0LvQvdC+0YHRgtGM0Y4g0LLRi9C60LvRjtGH0LjRgtGMLlxuICAgICAgICAgICAgICAgIHZhciBwb3MgPSBsb2FkZXIuY3VycmVudFRpbWU7XG4gICAgICAgICAgICAgICAgdmFyIHBhdXNlZCA9IGxvYWRlci5wYXVzZWQ7XG4gICAgICAgICAgICAgICAgbG9hZGVyLmxvYWQoKTtcbiAgICAgICAgICAgICAgICBsb2FkZXIuY3VycmVudFRpbWUgPSBwb3M7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9hZGVyLnBsYXkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICB9IGVsc2UgaWYgKHRoaXMuYXVkaW9PdXRwdXQpIHtcbiAgICAgICAgaWYgKHRoaXMucHJlcHJvY2Vzc29yKSB7XG4gICAgICAgICAgICB0aGlzLnByZXByb2Nlc3Nvci5vdXRwdXQuZGlzY29ubmVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hdWRpb091dHB1dC5kaXNjb25uZWN0KCk7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmF1ZGlvT3V0cHV0O1xuXG4gICAgICAgIHRoaXMuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uKHNvdXJjZSkge1xuICAgICAgICAgICAgc291cmNlLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vZGVsZXRlIHRoaXMuc291cmNlcztcblxuICAgICAgICB0aGlzLmxvYWRlcnMuZm9yRWFjaChmdW5jdGlvbihsb2FkZXIsIGlkeCkge1xuICAgICAgICAgICAgbG9hZGVyLnZvbHVtZSA9IHRoaXMudm9sdW1lO1xuXG4gICAgICAgICAgICB2YXIgc291cmNlID0gdGhpcy5zb3VyY2VzW2lkeF07XG4gICAgICAgICAgICBpZiAoc291cmNlKSB7IC8vIElORk86INC/0L7RgdC70LUg0YLQvtCz0L4g0LrQsNC6INC80Ysg0LLQutC70Y7Rh9C40LvQuCB3ZWJBdWRpb0FQSSDQtdCz0L4g0YPQttC1INC90LXQu9GM0LfRjyDQv9C+0LvQvdC+0YHRgtGM0Y4g0LLRi9C60LvRjtGH0LjRgtGMLlxuICAgICAgICAgICAgICAgIHNvdXJjZS5jb25uZWN0KGF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfVxuXG4gICAgdGhpcy53ZWJBdWRpb0FwaSA9IHN0YXRlO1xuXG4gICAgcmV0dXJuIHN0YXRlO1xufTtcblxuLyoqXG4gKiDQn9C+0LTQutC70Y7Rh9C10L3QuNC1INCw0YPQtNC40L4g0L/RgNC10L/RgNC+0YbQtdGB0YHQvtGA0LAuINCS0YXQvtC0INC/0YDQtdC/0YDQvtGG0LXRgdGB0L7RgNCwINC/0L7QtNC60LvRjtGH0LDQtdGC0YHRjyDQuiDQsNGD0LTQuNC+LdGN0LvQtdC80LXQvdGC0YMg0YMg0LrQvtGC0L7RgNC+0LPQviDQstGL0YHRgtCw0LLQu9C10L3QsFxuICogMTAwJSDQs9GA0L7QvNC60L7RgdGC0YwuINCS0YvRhdC+0LQg0L/RgNC10L/RgNC+0YbQtdGB0YHQvtGA0LAg0L/QvtC00LrQu9GO0YfQsNC10YLRgdGPINC6IEdhaW5Ob2RlLCDQutC+0YLQvtGA0LDRjyDRgNC10LPRg9C70LjRgNGD0LXRgiDQuNGC0L7Qs9C+0LLRg9GOINCz0YDQvtC80LrQvtGB0YLRjFxuICogQHBhcmFtIHt5YS5BdWRpb35BdWRpb1ByZXByb2Nlc3Nvcn0gcHJlcHJvY2Vzc29yIC0g0L/RgNC10L/RgNC+0YbQtdGB0YHQvtGAXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gLS0g0YHRgtCw0YLRg9GBINGD0YHQv9C10YXQsFxuICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5zZXRBdWRpb1ByZXByb2Nlc3NvciA9IGZ1bmN0aW9uKHByZXByb2Nlc3Nvcikge1xuICAgIGlmICghdGhpcy53ZWJBdWRpb0FwaSkge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcInNldEF1ZGlvUHJlcHJvY2Vzc29yRXJyb3JcIiwgcHJlcHJvY2Vzc29yKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwic2V0QXVkaW9QcmVwcm9jZXNzb3JcIik7XG5cbiAgICBpZiAodGhpcy5wcmVwcm9jZXNzb3IgPT09IHByZXByb2Nlc3Nvcikge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucHJlcHJvY2Vzc29yKSB7XG4gICAgICAgIHRoaXMucHJlcHJvY2Vzc29yLm91dHB1dC5kaXNjb25uZWN0KCk7XG4gICAgfVxuXG4gICAgdGhpcy5wcmVwcm9jZXNzb3IgPSBwcmVwcm9jZXNzb3I7XG5cbiAgICBpZiAoIXByZXByb2Nlc3Nvcikge1xuICAgICAgICB0aGlzLnNvdXJjZXMuZm9yRWFjaChmdW5jdGlvbihzb3VyY2UpIHtcbiAgICAgICAgICAgIHNvdXJjZS5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICBzb3VyY2UuY29ubmVjdCh0aGlzLmF1ZGlvT3V0cHV0KTtcbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc291cmNlcy5mb3JFYWNoKGZ1bmN0aW9uKHNvdXJjZSkge1xuICAgICAgICBzb3VyY2UuZGlzY29ubmVjdCgpO1xuICAgICAgICBzb3VyY2UuY29ubmVjdChwcmVwcm9jZXNzb3IuaW5wdXQpO1xuICAgIH0pO1xuICAgIHByZXByb2Nlc3Nvci5vdXRwdXQuY29ubmVjdCh0aGlzLmF1ZGlvT3V0cHV0KTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LjQs9GA0LDRgtGMINGC0YDQtdC6XG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dIC0g0JTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LAgKNC90LUg0LjRgdC/0L7Qu9GM0LfRg9C10YLRgdGPKVxuICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24oc3JjLCBkdXJhdGlvbikge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwicGxheVwiLCBzcmMpO1xuXG4gICAgdmFyIGxvYWRlciA9IHRoaXMuX2dldExvYWRlcih0cnVlKTtcblxuICAgIGxvYWRlci5mYWtlID0gZmFsc2U7XG4gICAgbG9hZGVyLnNyYyA9IHNyYztcbiAgICBsb2FkZXIuX3NyYyA9IHNyYztcbiAgICBsb2FkZXIubm90TG9hZGluZyA9IHRydWU7XG4gICAgbG9hZGVyLmxvYWQoKTtcblxuICAgIHRoaXMuX3BsYXkobG9hZGVyKTtcbn07XG5cbi8qKiDQn9C+0YHRgtCw0LLQuNGC0Ywg0YLRgNC10Log0L3QsCDQv9Cw0YPQt9GDICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwicGF1c2VcIik7XG4gICAgdmFyIGxvYWRlciA9IHRoaXMuX2dldExvYWRlcih0cnVlKTtcbiAgICBsb2FkZXIucGF1c2UoKTtcbn07XG5cbi8qKiDQodC90Y/RgtGMINGC0YDQtdC6INGBINC/0LDRg9C30YsgKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLnJlc3VtZSA9IGZ1bmN0aW9uKCkge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwicmVzdW1lXCIpO1xuICAgIHZhciBsb2FkZXIgPSB0aGlzLl9nZXRMb2FkZXIodHJ1ZSk7XG4gICAgdGhpcy5fcGxheShsb2FkZXIpO1xufTtcblxuLyoqXG4gKiDQntGB0YLQsNC90L7QstC40YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0Lgg0LfQsNCz0YDRg9C30LrRgyDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INC00LvRjyDRgtC10LrRg9GJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwLCAxOiDQtNC70Y8g0YHQu9C10LTRg9GO0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LBcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwic3RvcFwiKTtcbiAgICB2YXIgbG9hZGVyID0gdGhpcy5fZ2V0TG9hZGVyKHRydWUsIG9mZnNldCB8fCAwKTtcblxuICAgIGxvYWRlci5mYWtlID0gdHJ1ZTtcbiAgICBsb2FkZXIuc3JjID0gXCJcIjtcbiAgICBsb2FkZXIuX3NyYyA9IGZhbHNlO1xuICAgIGxvYWRlci5ub3RMb2FkaW5nID0gdHJ1ZTtcbiAgICBsb2FkZXIubG9hZCgpO1xuXG4gICAgdGhpcy50cmlnZ2VyKEF1ZGlvU3RhdGljLkVWRU5UX1NUT1ApO1xufTtcblxuLyoqXG4gKiDQn9GA0LXQtNC30LDQs9GA0YPQt9C40YLRjCDRgtGA0LXQulxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINCh0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge051bWJlcn0gW2R1cmF0aW9uXSAtINCU0LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwICjQvdC1INC40YHQv9C+0LvRjNC30YPQtdGC0YHRjylcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTFdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLnByZWxvYWQgPSBmdW5jdGlvbihzcmMsIGR1cmF0aW9uLCBvZmZzZXQpIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInByZWxvYWRcIiwgc3JjLCBvZmZzZXQpO1xuICAgIG9mZnNldCA9IG9mZnNldCA9PSBudWxsID8gMSA6IDA7XG4gICAgdmFyIGxvYWRlciA9IHRoaXMuX2dldExvYWRlcih0cnVlLCBvZmZzZXQpO1xuXG4gICAgbG9hZGVyLnNyYyA9IHNyYztcbiAgICBsb2FkZXIuX3NyYyA9IHNyYztcbiAgICBsb2FkZXIubm90TG9hZGluZyA9IHRydWU7XG4gICAgbG9hZGVyLmxvYWQoKTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQv9GA0LXQtNC30LDQs9GA0YPQttCw0LXRgtGB0Y9cbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5pc1ByZWxvYWRlZCA9IGZ1bmN0aW9uKHNyYywgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0ID09IG51bGwgPyAxIDogMDtcbiAgICB2YXIgbG9hZGVyID0gdGhpcy5fZ2V0TG9hZGVyKGZhbHNlLCBvZmZzZXQpO1xuICAgIHJldHVybiBsb2FkZXIuX3NyYyA9PT0gc3JjICYmICFsb2FkZXIubm90TG9hZGluZztcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQvdCw0YfQsNC7INC/0YDQtdC00LfQsNCz0YDRg9C20LDRgtGM0YHRj1xuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0xXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmlzUHJlbG9hZGluZyA9IGZ1bmN0aW9uKHNyYywgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0ID09IG51bGwgPyAxIDogMDtcbiAgICB2YXIgbG9hZGVyID0gdGhpcy5fZ2V0TG9hZGVyKGZhbHNlLCBvZmZzZXQpO1xuICAgIHJldHVybiBsb2FkZXIuX3NyYyA9PT0gc3JjO1xufTtcblxuLyoqXG4gKiDQl9Cw0L/Rg9GB0YLQuNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INC/0YDQtdC00LfQsNCz0YDRg9C20LXQvdC90L7Qs9C+INGC0YDQtdC60LBcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTFdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gLS0g0LTQvtGB0YLRg9C/0L3QvtGB0YLRjCDQtNCw0L3QvdC+0LPQviDQtNC10LnRgdGC0LLQuNGPXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLnBsYXlQcmVsb2FkZWQgPSBmdW5jdGlvbihvZmZzZXQpIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInBsYXlQcmVsb2FkZWRcIiwgb2Zmc2V0KTtcbiAgICBvZmZzZXQgPSBvZmZzZXQgPT0gbnVsbCA/IDEgOiAwO1xuICAgIHZhciBsb2FkZXIgPSB0aGlzLl9nZXRMb2FkZXIoZmFsc2UsIG9mZnNldCk7XG5cbiAgICBpZiAoIWxvYWRlci5fc3JjKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB0aGlzLl9zZXRBY3RpdmUob2Zmc2V0KTtcbiAgICB0aGlzLl9wbGF5KHRoaXMuX2dldExvYWRlcih0cnVlKSk7XG5cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQv9C+0LfQuNGG0LjRjiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmdldFBvc2l0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX2dldExvYWRlcigpLmN1cnJlbnRUaW1lO1xufTtcblxuLyoqXG4gKiDQo9GB0YLQsNC90L7QstC40YLRjCDRgtC10LrRg9GJ0YPRjiDQv9C+0LfQuNGG0LjRjiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEBwYXJhbSB7bnVtYmVyfSBwb3NpdGlvblxuICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5zZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKHBvc2l0aW9uKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJzZXRQb3NpdGlvblwiLCBwb3NpdGlvbik7XG4gICAgdGhpcy5fZ2V0TG9hZGVyKCkuY3VycmVudFRpbWUgPSBwb3NpdGlvbiAtIDAuMDAxO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuZ2V0RHVyYXRpb24gPSBmdW5jdGlvbihvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0TG9hZGVyKGZhbHNlLCBvZmZzZXQpLmR1cmF0aW9uO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQt9Cw0LPRgNGD0LbQtdC90L3QvtC5INGH0LDRgdGC0Lgg0YLRgNC10LrQsFxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmdldExvYWRlZCA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIHZhciBsb2FkZXIgPSB0aGlzLl9nZXRMb2FkZXIoZmFsc2UsIG9mZnNldCk7XG5cbiAgICBpZiAobG9hZGVyLmJ1ZmZlcmVkLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gbG9hZGVyLmJ1ZmZlcmVkLmVuZCgwKSAtIGxvYWRlci5idWZmZXJlZC5zdGFydCgwKTtcbiAgICB9XG4gICAgcmV0dXJuIDA7XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0YLQtdC60YPRidC10LUg0LfQvdCw0YfQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0LhcbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmdldFZvbHVtZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnZvbHVtZTtcbn07XG5cbi8qKlxuICog0KPRgdGC0LDQvdC+0LLQuNGC0Ywg0LfQvdCw0YfQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0LhcbiAqIEBwYXJhbSB7bnVtYmVyfSB2b2x1bWVcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuc2V0Vm9sdW1lID0gZnVuY3Rpb24odm9sdW1lKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJzZXRWb2x1bWVcIiwgdm9sdW1lKTtcbiAgICB0aGlzLnZvbHVtZSA9IHZvbHVtZTtcblxuICAgIGlmICh0aGlzLndlYkF1ZGlvQXBpKSB7XG4gICAgICAgIHRoaXMuYXVkaW9PdXRwdXQuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxvYWRlcnMuZm9yRWFjaChmdW5jdGlvbihsb2FkZXIpIHtcbiAgICAgICAgICAgIGxvYWRlci52b2x1bWUgPSB2b2x1bWU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9WT0xVTUUpO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINGB0YHRi9C70LrRgyDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge1N0cmluZ3xCb29sZWFufSAtLSDQodGB0YvQu9C60LAg0L3QsCDRgtGA0LXQuiDQuNC70LggZmFsc2UsINC10YHQu9C4INC90LXRgiDQt9Cw0LPRgNGD0LbQsNC10LzQvtCz0L4g0YLRgNC10LrQsFxuICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5nZXRTcmMgPSBmdW5jdGlvbihvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0TG9hZGVyKGZhbHNlLCBvZmZzZXQpLl9zcmM7XG59O1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC40YLRjCDQtNC+0YHRgtGD0L/QtdC9INC70Lgg0L/RgNC+0LPRgNCw0LzQvNC90YvQuSDQutC+0L3RgtGA0L7Qu9GMINCz0YDQvtC80LrQvtGB0YLQuFxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmlzRGV2aWNlVm9sdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGRldGVjdC5vbmx5RGV2aWNlVm9sdW1lO1xufTtcblxuLyoqXG4gKiDQktGB0L/QvtC80L7Qs9Cw0YLQtdC70YzQvdCw0Y8g0YTRg9C90LrRhtC40Y8g0LTQu9GPINC+0YLQvtCx0YDQsNC20LXQvdC40Y8g0YHQvtGB0YLQvtGP0L3QuNGPINC/0LvQtdC10YDQsCDQsiDQu9C+0LPQtS5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLl9sb2dnZXIgPSBmdW5jdGlvbigpIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWFpbjogdGhpcy5nZXRTcmMoMCksXG4gICAgICAgICAgICBwcmVsb2FkZXI6IHRoaXMuZ2V0U3JjKDEpXG4gICAgICAgIH07XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn07XG5cbmV4cG9ydHMuYXVkaW9Db250ZXh0ID0gYXVkaW9Db250ZXh0O1xuZXhwb3J0cy5BdWRpb0ltcGxlbWVudGF0aW9uID0gQXVkaW9IVE1MNTtcbiIsInZhciBZYW5kZXhBdWRpbyA9IHJlcXVpcmUoJy4vZXhwb3J0Jyk7XG5yZXF1aXJlKCcuL2Vycm9yL2V4cG9ydCcpO1xucmVxdWlyZSgnLi9saWIvbmV0L2Vycm9yL2V4cG9ydCcpO1xucmVxdWlyZSgnLi9sb2dnZXIvZXhwb3J0Jyk7XG5yZXF1aXJlKCcuL2Z4L2VxdWFsaXplci9leHBvcnQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBZYW5kZXhBdWRpbztcbiIsInZhciBQcm9taXNlID0gcmVxdWlyZSgnLi9wcm9taXNlJyk7XG52YXIgbm9vcCA9IHJlcXVpcmUoJy4uL25vb3AnKTtcblxuLyoqXG4gKiBAY2xhc3Mg0J7RgtC70L7QttC10L3QvdC+0LUg0LTQtdC50YHRgtCy0LjQtVxuICogQGNvbnN0cnVjdG9yXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgRGVmZXJyZWQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgX3Byb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqINCg0LDQt9GA0LXRiNC40YLRjCDQvtCx0LXRidCw0L3QuNC1XG4gICAgICAgICAqIEBtZXRob2QgRGVmZXJyZWQjcmVzb2x2ZVxuICAgICAgICAgKiBAcGFyYW0geyp9IGRhdGEgLSDQv9C10YDQtdC00LDRgtGMINC00LDQvdC90YvQtSDQsiDQvtCx0LXRidCw0L3QuNC1XG4gICAgICAgICAqL1xuICAgICAgICBzZWxmLnJlc29sdmUgPSByZXNvbHZlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQntGC0LrQu9C+0L3QuNGC0Ywg0L7QsdC10YnQsNC90LjQtVxuICAgICAgICAgKiBAbWV0aG9kIERlZmVycmVkI3JlamVjdFxuICAgICAgICAgKiBAcGFyYW0ge0Vycm9yfSBlcnJvciAtINC/0LXRgNC10LTQsNGC0Ywg0L7RiNC40LHQutGDXG4gICAgICAgICAqL1xuICAgICAgICBzZWxmLnJlamVjdCA9IHJlamVjdDtcbiAgICB9KTtcblxuICAgIHZhciBwcm9taXNlID0gX3Byb21pc2UudGhlbihmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgIHNlbGYucmVzb2x2ZWQgPSB0cnVlO1xuICAgICAgICBzZWxmLnBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgIHNlbGYucmVqZWN0ZWQgPSB0cnVlO1xuICAgICAgICBzZWxmLnBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgIH0pO1xuICAgIHByb21pc2VbXCJjYXRjaFwiXShub29wKTsgLy8gRG9uJ3QgdGhyb3cgZXJyb3JzIHRvIGNvbnNvbGVcblxuICAgIC8qKlxuICAgICAqINCS0YvQv9C+0LvQvdC40LvQvtGB0Ywg0LvQuCDQvtCx0LXRidCw0L3QuNC1XG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgdGhpcy5wZW5kaW5nID0gdHJ1ZTtcblxuICAgIC8qKlxuICAgICAqINCe0YLQutC70L7QvdC40LvQvtGB0Ywg0LvQuCDQvtCx0LXRidCw0L3QuNC1XG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICovXG4gICAgdGhpcy5yZWplY3RlZCA9IGZhbHNlO1xuXG4gICAgLyoqXG4gICAgICog0J/QvtC70YPRh9C40YLRjCDQvtCx0LXRidCw0L3QuNC1XG4gICAgICogQG1ldGhvZCBEZWZlcnJlZCNwcm9taXNlXG4gICAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAgICovXG4gICAgdGhpcy5wcm9taXNlID0gZnVuY3Rpb24oKSB7IHJldHVybiBwcm9taXNlOyB9O1xufTtcblxuLyoqXG4gKiDQntC20LjQtNCw0L3QuNC1INCy0YvQv9C+0LvQvdC10L3QuNGPINGB0L/QuNGB0LrQsCDQvtCx0LXRidCw0L3QuNC5XG4gKiBAcGFyYW0gey4uLip9IGFyZ3MgLSDQvtCx0LXRidCw0L3QuNGPLCDQutC+0YLQvtGA0YvQtSDRgtGA0LXQsdGD0LXRgtGB0Y8g0L7QttC40LTQsNGC0YxcbiAqIEByZXR1cm5zIEFib3J0YWJsZVByb21pc2VcbiAqL1xuRGVmZXJyZWQud2hlbiA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZCgpO1xuXG4gICAgdmFyIGxpc3QgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgdmFyIHBlbmRpbmcgPSBsaXN0Lmxlbmd0aDtcblxuICAgIHZhciByZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHBlbmRpbmctLTtcblxuICAgICAgICBpZiAocGVuZGluZyA8PSAwKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgbGlzdC5mb3JFYWNoKGZ1bmN0aW9uKHByb21pc2UpIHtcbiAgICAgICAgcHJvbWlzZS50aGVuKHJlc29sdmUsIGRlZmVycmVkLnJlamVjdCk7XG4gICAgfSk7XG4gICAgbGlzdCA9IG51bGw7XG5cbiAgICBkZWZlcnJlZC5wcm9taXNlLmFib3J0ID0gZGVmZXJyZWQucmVqZWN0O1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRGVmZXJyZWQ7XG4iLCJ2YXIgbWVyZ2UgPSByZXF1aXJlKCcuLi9kYXRhL21lcmdlJyk7XG5cbnZhciBMSVNURU5FUlNfTkFNRSA9IFwiX2xpc3RlbmVyc1wiO1xudmFyIE1VVEVfT1BUSU9OID0gXCJfbXV0ZWRcIjtcblxuLyoqXG4gKiDQlNC40YHQv9C10YLRh9C10YAg0YHQvtCx0YvRgtC40LlcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gICAgLyoqINCa0L7QvdGC0LXQudC90LXRgCDQtNC70Y8g0YHQv9C40YHQutC+0LIg0YHQu9GD0YjQsNGC0LXQu9C10Lkg0YHQvtCx0YvRgtC40LlcbiAgICAgKiBAYWxpYXMgRXZlbnRzI19saXN0ZW5lcnNcbiAgICAgKiBAdHlwZSB7T2JqZWN0LjxTdHJpbmcsIEFycmF5LjxGdW5jdGlvbj4+fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpc1tMSVNURU5FUlNfTkFNRV0gPSB7fTtcblxuICAgIC8qKiDQpNC70LDQsyDQstC60LvRjtGH0LXQvdC40Y8v0LLRi9C60LvRjtGH0LXQvdC40Y8g0YHQvtCx0YvRgtC40LlcbiAgICAgKiBAYWxpYXMgRXZlbnRzI19tdXRlc1xuICAgICAqIEB0eXBlIHtCb29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpc1tNVVRFX09QVElPTl0gPSBmYWxzZTtcbn07XG5cbi8qKlxuICog0KDQsNGB0YjQuNGA0LjRgtGMINC/0YDQvtC40LfQstC+0LvRjNC90YvQuSDQutC70LDRgdGBINGB0LLQvtC50YHRgtCy0LDQvNC4INC00LjRgdC/0LXRgtGH0LXRgNCwINGB0L7QsdGL0YLQuNC5XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjbGFzc0NvbnN0cnVjdG9yIC0g0LrQvtC90YHRgtGA0YPQutGC0L7RgCDQutC70LDRgdGB0LBcbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gLS0g0YLQvtGCINC20LUg0LrQvtC90YHRgtGA0YPQutGC0L7RgCDQutC70LDRgdGB0LAsINGA0LDRgdGI0LjRgNC10L3QvdGL0Lkg0YHQstC+0LnRgdGC0LLQsNC80Lgg0LTQuNGB0L/QtdGC0YfQtdGA0LAg0YHQvtCx0YvRgtC40LlcbiAqL1xuRXZlbnRzLm1peGluID0gZnVuY3Rpb24oY2xhc3NDb25zdHJ1Y3Rvcikge1xuICAgIG1lcmdlKGNsYXNzQ29uc3RydWN0b3IucHJvdG90eXBlLCBFdmVudHMucHJvdG90eXBlLCB0cnVlKTtcbiAgICByZXR1cm4gY2xhc3NDb25zdHJ1Y3Rvcjtcbn07XG5cbi8qKlxuICog0KDQsNGB0YjQuNGA0LjRgtGMINC/0YDQvtC40LfQstC+0LvRjNC90YvQuSDQvtCx0YrQtdC60YIg0YHQstC+0LnRgdGC0LLQsNC80Lgg0LTQuNGB0L/QtdGC0YfQtdGA0LAg0YHQvtCx0YvRgtC40LlcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgLSDQvtCx0YrQtdC60YJcbiAqIEByZXR1cm5zIHtPYmplY3R9IC0tINGC0L7RgiDQttC1INC+0LHRitC10LrRgiwg0YDQsNGB0YjQuNGA0LXQvdC90YvQuSDRgdCy0L7QudGB0YLQstCw0LzQuCDQtNC40YHQv9C10YLRh9C10YDQsCDRgdC+0LHRi9GC0LjQuVxuICovXG5FdmVudHMuZXZlbnRpemUgPSBmdW5jdGlvbihvYmplY3QpIHtcbiAgICBtZXJnZShvYmplY3QsIEV2ZW50cy5wcm90b3R5cGUsIHRydWUpO1xuICAgIEV2ZW50cy5jYWxsKG9iamVjdCk7XG4gICAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8qKlxuICog0J/QvtC00L/QuNGB0LDRgtGM0YHRjyDQvdCwINGB0L7QsdGL0YLQuNC1XG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSDQuNC80Y8g0YHQvtCx0YvRgtC40Y9cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0g0L7QsdGA0LDQsdC+0YLRh9C40Log0YHQvtCx0YvRgtC40Y9cbiAqIEByZXR1cm5zIHtFdmVudHN9IC0tINGG0LXQv9C+0YfQvdGL0Lkg0LzQtdGC0L7QtCwg0LLQvtC30LLRgNCw0YnQsNC10YIg0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRglxuICovXG5FdmVudHMucHJvdG90eXBlLm9uID0gZnVuY3Rpb24oZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCF0aGlzW0xJU1RFTkVSU19OQU1FXVtldmVudF0pIHtcbiAgICAgICAgdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdID0gW107XG4gICAgfVxuXG4gICAgdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdLnB1c2goY2FsbGJhY2spO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiDQntGC0L/QuNGB0LDRgtGM0YHRjyDQvtGCINGB0L7QsdGL0YLQuNGPXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSDQuNC80Y8g0YHQvtCx0YvRgtC40Y9cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0g0L7QsdGA0LDQsdC+0YLRh9C40Log0YHQvtCx0YvRgtC40Y9cbiAqIEByZXR1cm5zIHtFdmVudHN9IC0tINGG0LXQv9C+0YfQvdGL0Lkg0LzQtdGC0L7QtCwg0LLQvtC30LLRgNCw0YnQsNC10YIg0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRglxuICovXG5FdmVudHMucHJvdG90eXBlLm9mZiA9IGZ1bmN0aW9uKGV2ZW50LCBjYWxsYmFjaykge1xuICAgIGlmICghdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGlmICghY2FsbGJhY2spIHtcbiAgICAgICAgZGVsZXRlIHRoaXNbTElTVEVORVJTX05BTUVdW2V2ZW50XTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdmFyIGNhbGxiYWNrcyA9IHRoaXNbTElTVEVORVJTX05BTUVdW2V2ZW50XTtcbiAgICBmb3IgKHZhciBrID0gMCwgbCA9IGNhbGxiYWNrcy5sZW5ndGg7IGsgPCBsOyBrKyspIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrc1trXSA9PT0gY2FsbGJhY2sgfHwgY2FsbGJhY2tzW2tdLmNhbGxiYWNrID09PSBjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2tzLnNwbGljZShrLCAxKTtcbiAgICAgICAgICAgIGlmICghY2FsbGJhY2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzW0xJU1RFTkVSU19OQU1FXVtldmVudF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiDQn9C+0LTQv9C40YHQsNGC0YzRgdGPINC90LAg0YHQvtCx0YvRgtC40LUsINC+0YLQv9C40YHQsNGC0YzRgdGPINGB0YDQsNC30YMg0L/QvtGB0LvQtSDQv9C10YDQstC+0LPQviDQstC+0LfQvdC40LrQvdC+0LLQtdC90LjRjyDRgdC+0LHRi9GC0LjRj1xuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IC0g0LjQvNGPINGB0L7QsdGL0YLQuNGPXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtINC+0LHRgNCw0LHQvtGC0YfQuNC6INGB0L7QsdGL0YLQuNGPXG4gKiBAcmV0dXJucyB7RXZlbnRzfSAtLSDRhtC10L/QvtGH0L3Ri9C5INC80LXRgtC+0LQsINCy0L7Qt9Cy0YDQsNGJ0LDQtdGCINGB0YHRi9C70LrRgyDQvdCwINC60L7QvdGC0LXQutGB0YJcbiAqL1xuRXZlbnRzLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24oZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdmFyIHdyYXBwZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgc2VsZi5vZmYoZXZlbnQsIHdyYXBwZXIpO1xuICAgICAgICBjYWxsYmFjay5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG5cbiAgICB3cmFwcGVyLmNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgc2VsZi5vbihldmVudCwgd3JhcHBlcik7XG5cbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICog0JfQsNC/0YPRgdGC0LjRgtGMINGB0L7QsdGL0YLQuNC1XG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSDQuNC80Y8g0YHQvtCx0YvRgtC40Y9cbiAqIEBwYXJhbSB7Li4uYXJnc30gYXJncyAtINC/0LDRgNCw0LzQtdGC0YDRiyDQtNC70Y8g0L/QtdGA0LXQtNCw0YfQuCDQstC80LXRgdGC0LUg0YEg0YHQvtCx0YvRgtC40LXQvFxuICogQHJldHVybnMge0V2ZW50c30gLS0g0YbQtdC/0L7Rh9C90YvQuSDQvNC10YLQvtC0LCDQstC+0LfQstGA0LDRidCw0LXRgiDRgdGB0YvQu9C60YMg0L3QsCDQutC+0L3RgtC10LrRgdGCXG4gKi9cbkV2ZW50cy5wcm90b3R5cGUudHJpZ2dlciA9IGZ1bmN0aW9uKGV2ZW50LCBhcmdzKSB7XG4gICAgaWYgKHRoaXNbTVVURV9PUFRJT05dKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cbiAgICBpZiAoZXZlbnQgIT09IFwiKlwiKSB7XG4gICAgICAgIEV2ZW50cy5wcm90b3R5cGUudHJpZ2dlci5hcHBseSh0aGlzLCBbXCIqXCIsIGV2ZW50XS5jb25jYXQoYXJncykpO1xuICAgIH1cblxuICAgIGlmICghdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHZhciBjYWxsYmFja3MgPSBbXS5jb25jYXQodGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdKTtcbiAgICBmb3IgKHZhciBrID0gMCwgbCA9IGNhbGxiYWNrcy5sZW5ndGg7IGsgPCBsOyBrKyspIHtcbiAgICAgICAgY2FsbGJhY2tzW2tdLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiDQntGC0L/QuNGB0LDRgtGM0YHRjyDQvtGCINCy0YHQtdGFINGB0LvRg9GI0LDRgtC10LvQtdC5INGB0L7QsdGL0YLQuNC5XG4gKiBAcmV0dXJucyB7RXZlbnRzfSAtLSDRhtC10L/QvtGH0L3Ri9C5INC80LXRgtC+0LQsINCy0L7Qt9Cy0YDQsNGJ0LDQtdGCINGB0YHRi9C70LrRgyDQvdCwINC60L7QvdGC0LXQutGB0YJcbiAqL1xuRXZlbnRzLnByb3RvdHlwZS5jbGVhckxpc3RlbmVycyA9IGZ1bmN0aW9uKCkge1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzW0xJU1RFTkVSU19OQU1FXSkge1xuICAgICAgICBpZiAodGhpc1tMSVNURU5FUlNfTkFNRV0uaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXNbTElTVEVORVJTX05BTUVdW2tleV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICog0JTQtdC70LXQs9C40YDQvtCy0LDRgtGMINCy0YHQtSDRgdC+0LHRi9GC0LjRjyDQtNGA0YPQs9C+0LzRgyDQtNC40YHQv9C10YLRh9C10YDRgyDRgdC+0LHRi9GC0LjQuVxuICogQHBhcmFtIHtFdmVudHN9IGFjY2VwdG9yIC0g0L/QvtC70YPRh9Cw0YLQtdC70Ywg0YHQvtCx0YvRgtC40LlcbiAqIEByZXR1cm5zIHtFdmVudHN9IC0tINGG0LXQv9C+0YfQvdGL0Lkg0LzQtdGC0L7QtCwg0LLQvtC30LLRgNCw0YnQsNC10YIg0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRglxuICovXG5FdmVudHMucHJvdG90eXBlLnBpcGVFdmVudHMgPSBmdW5jdGlvbihhY2NlcHRvcikge1xuICAgIHRoaXMub24oXCIqXCIsIEV2ZW50cy5wcm90b3R5cGUudHJpZ2dlci5iaW5kKGFjY2VwdG9yKSk7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqINCe0YHRgtCw0L3QvtCy0LjRgtGMINC30LDQv9GD0YHQuiDRgdC+0LHRi9GC0LjQuVxuICogQHJldHVybnMge0V2ZW50c30gLS0g0YbQtdC/0L7Rh9C90YvQuSDQvNC10YLQvtC0LCDQstC+0LfQstGA0LDRidCw0LXRgiDRgdGB0YvQu9C60YMg0L3QsCDQutC+0L3RgtC10LrRgdGCXG4gKi9cbkV2ZW50cy5wcm90b3R5cGUubXV0ZUV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXNbTVVURV9PUFRJT05dID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICog0JLQvtC30L7QsdC90L7QstC40YLRjCDQt9Cw0L/Rg9GB0Log0YHQvtCx0YvRgtC40LlcbiAqIEByZXR1cm5zIHtFdmVudHN9IC0tINGG0LXQv9C+0YfQvdGL0Lkg0LzQtdGC0L7QtCwg0LLQvtC30LLRgNCw0YnQsNC10YIg0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRglxuICovXG5FdmVudHMucHJvdG90eXBlLnVubXV0ZUV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIGRlbGV0ZSB0aGlzW01VVEVfT1BUSU9OXTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwidmFyIHZvdyA9IHJlcXVpcmUoJ3ZvdycpO1xudmFyIGRldGVjdCA9IHJlcXVpcmUoJy4uL2Jyb3dzZXIvZGV0ZWN0Jyk7XG5cbi8qKlxuICoge0BsaW5rIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL3J1L2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL1Byb21pc2V8RVMtNiBQcm9taXNlfVxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBQcm9taXNlO1xuaWYgKHR5cGVvZiB3aW5kb3cuUHJvbWlzZSAhPT0gXCJmdW5jdGlvblwiXG4gICAgfHwgZGV0ZWN0LmJyb3dzZXIubmFtZSA9PT0gXCJtc2llXCIgfHwgZGV0ZWN0LmJyb3dzZXIubmFtZSA9PT0gXCJlZGdlXCIgLy8g0LzQtdC70LrQuNC1INC80Y/Qs9C60LjQtSDQutCw0Log0LLRgdC10LPQtNCwINC90LjRh9C10LPQviDQvdC1INGD0LzQtdGO0YIg0LTQtdC70LDRgtGMINC/0YDQsNCy0LjQu9GM0L3QvlxuKSB7XG4gICAgUHJvbWlzZSA9IHZvdy5Qcm9taXNlO1xufSBlbHNlIHtcbiAgICBQcm9taXNlID0gd2luZG93LlByb21pc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUHJvbWlzZTtcblxuLyoqXG4gKiDQodC+0LfQtNCw0YLRjCDQvtCx0LXRidCw0L3QuNC1INGA0LDQt9GA0LXRiNGR0L3QvdC+0LUg0L/QtdGA0LXQtNCw0L3QvdGL0LzQuCDQtNCw0L3QvdGL0LzQuFxuICogQG1ldGhvZCBQcm9taXNlLnJlc29sdmVcbiAqIEBwYXJhbSB7Kn0gZGF0YSAtINC00LDQvdC90YvQtSwg0LrQvtGC0L7RgNGL0LzQuCDRgNCw0LfRgNC10YjQuNGC0Ywg0L7QsdC10YnQsNC90LjQtVxuICogQHN0YXRpY1xuICogQHJldHVybnMge1Byb21pc2V9XG4gKi9cblxuLyoqXG4gKiDQodC+0LfQtNCw0YLRjCDQvtCx0LXRidCw0L3QuNC1INC+0YLQutC70L7QvdGR0L3QvdC+0LUg0L/QtdGA0LXQtNCw0L3QvdGL0LzQuCDQtNCw0L3QvdGL0LzQuFxuICogQG1ldGhvZCBQcm9taXNlLnJlamVjdFxuICogQHBhcmFtIHsqfSBkYXRhIC0g0LTQsNC90L3Ri9C1LCDQutC+0YLQvtGA0YvQvNC4INC+0YLQutC70L7QvdC40YLRjCDQvtCx0LXRidCw0L3QuNC1XG4gKiBAc3RhdGljXG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqL1xuXG4vKipcbiAqINCh0L7Qt9C00LDRgtGMINC+0LHQtdGJ0LDQvdC40LUsINC60L7RgtC+0YDQvtC1INCy0YvQv9C+0LvQvdC40YLRgdGPINGC0L7Qs9C00LAsINC60L7Qs9C00LAg0LHRg9C00YPRgiDQstGL0L/QvtC70L3QtdC90Ysg0LLRgdC1INC/0LXRgNC10LTQsNC90L3Ri9C1INC+0LHQtdGJ0LDQvdC40Y8uXG4gKiBAbWV0aG9kIFByb21pc2UuYWxsXG4gKiBAcGFyYW0ge0FycmF5LjxQcm9taXNlPn0gcHJvbWlzZXMgLSDRgdC/0LjRgdC+0Log0L7QsdC10YnQsNC90LjQuVxuICogQHN0YXRpY1xuICogQHJldHVybnMge1Byb21pc2V9XG4gKi9cblxuLyoqXG4gKiDQodC+0LfQtNCw0YLRjCDQvtCx0LXRidCw0L3QuNC1LCDQutC+0YLQvtGA0L7QtSDQstGL0L/QvtC70L3QuNGC0YHRjyDRgtC+0LPQtNCwLCDQutC+0LPQtNCwINCx0YPQtNC10YIg0LLRi9C/0L7Qu9C90LXQvdC+INGF0L7RgtGPINCx0Ysg0L7QtNC90L4g0LjQtyDQv9C10YDQtdC00LDQvdC90YvRhSDQvtCx0LXRidCw0L3QuNC5LlxuICogQG1ldGhvZCBQcm9taXNlLnJhY2VcbiAqIEBwYXJhbSB7QXJyYXkuPFByb21pc2U+fSBwcm9taXNlcyAtINGB0L/QuNGB0L7QuiDQvtCx0LXRidCw0L3QuNC5XG4gKiBAc3RhdGljXG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqL1xuXG4vKipcbiAqINCd0LDQt9C90LDRh9C40YLRjCDQvtCx0YDQsNCx0L7RgtGH0LjQutC4INGA0LDQt9GA0LXRiNC10L3QuNGPINC4INC+0YLQutC70L7QvdC10L3QuNGPINC+0LHQtdGJ0LDQvdC40Y9cbiAqIEBtZXRob2QgUHJvbWlzZSN0aGVuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtINC+0LHRgNCw0LHQvtGC0YfQuNC6INGD0YHQv9C10YXQsFxuICogQHBhcmFtIHtudWxsfGZ1bmN0aW9ufSBbZXJyYmFja10gLSDQvtCx0YDQsNCx0L7RgtGH0LjQuiDQvtGI0LjQsdC60LhcbiAqIEByZXR1cm5zIHtQcm9taXNlfSAtLSDQvdC+0LLQvtC1INC+0LHQtdGJ0LDQvdC40LUg0LjQtyDRgNC10LfRg9C70YzRgtCw0YLQvtCyINC+0LHRgNCw0LHQvtGC0YfQuNC60LBcbiAqL1xuXG4vKipcbiAqINCd0LDQt9C90LDRh9C40YLRjCDQvtCx0YDQsNCx0L7RgtGH0LjQuiDQvtGC0LrQu9C+0L3QtdC90LjRjyDQvtCx0LXRidCw0L3QuNGPXG4gKiBAbWV0aG9kIFByb21pc2UjY2F0Y2hcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGVycmJhY2sgLSAg0L7QsdGA0LDQsdC+0YLRh9C40Log0L7RiNC40LHQutC4XG4gKiBAcmV0dXJucyB7UHJvbWlzZX0gLS0g0L3QvtCy0L7QtSDQvtCx0LXRidCw0L3QuNC1INC40Lcg0YDQtdC30YPQu9GM0YLQsNGC0L7QsiDQvtCx0YDQsNCx0L7RgtGH0LjQutCwXG4gKi9cblxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIEFib3J0YWJsZVByb21pc2Vcbi8qKlxuICog0J7QsdC10YnQsNC90LjQtSDRgSDQstC+0LfQvNC+0LbQvdC+0YHRgtGM0Y4g0L7RgtC80LXQvdGLINGB0LLRj9C30LDQvdC90L7Qs9C+INGBINC90LjQvCDQtNC10LnRgdGC0LLQuNGPLlxuICogQGNsYXNzIEFib3J0YWJsZVByb21pc2VcbiAqIEBleHRlbmRzIFByb21pc2VcbiAqL1xuXG4vKipcbiAqINCe0YLQvNC10L3QsCDQtNC10LnRgdGC0LLQuNGPINGB0LLRj9C30LDQvdC90L7Qs9C+INGBINC+0LHQtdGJ0LDQtdC90LjQtdC8XG4gKiBAYWJzdHJhY3RcbiAqIEBtZXRob2QgQWJvcnRhYmxlUHJvbWlzZSNhYm9ydFxuICogQHBhcmFtIHtTdHJpbmd8RXJyb3J9IHJlYXNvbiAtINC/0YDQuNGH0LjQvdCwINC+0YLQvNC10L3RiyDQtNC10LnRgdGC0LLQuNGPXG4gKi9cbiIsInZhciBub29wID0gcmVxdWlyZSgnLi4vbm9vcCcpO1xudmFyIFByb21pc2UgPSByZXF1aXJlKCcuL3Byb21pc2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlamVjdChkYXRhKTtcbiAgICBwcm9taXNlW1wiY2F0Y2hcIl0obm9vcCk7XG4gICAgcmV0dXJuIHByb21pc2U7XG59O1xuIiwidmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQnJvd3NlciBkZXRlY3Rpb25cbi8vIFVzZXJhZ2VudCBSZWdFeHBcbnZhciByd2Via2l0ID0gLyh3ZWJraXQpWyBcXC9dKFtcXHcuXSspLztcbnZhciByeWFicm8gPSAvKHlhYnJvd3NlcilbIFxcL10oW1xcdy5dKykvO1xudmFyIHJvcGVyYSA9IC8ob3BlcmEpKD86Lip2ZXJzaW9uKT9bIFxcL10oW1xcdy5dKykvO1xudmFyIHJtc2llID0gLyhtc2llKSAoW1xcdy5dKykvO1xudmFyIHJlZGdlID0gLyhlZGdlKVxcLyhbXFx3Ll0rKS87XG52YXIgcm1vemlsbGEgPSAvKG1vemlsbGEpKD86Lio/IHJ2OihbXFx3Ll0rKSk/LztcbnZhciByc2FmYXJpID0gL14oKD8hY2hyb21lKS4pKnZlcnNpb25cXC8oW1xcZFxcd1xcLl0rKS4qKHNhZmFyaSkvO1xuXG52YXIgbWF0Y2ggPSByc2FmYXJpLmV4ZWModWEpIHx8IHJ5YWJyby5leGVjKHVhKSB8fCByZWRnZS5leGVjKHVhKSB8fCByd2Via2l0LmV4ZWModWEpIHx8IHJvcGVyYS5leGVjKHVhKSB8fCBybXNpZS5leGVjKHVhKSB8fCB1YS5pbmRleE9mKFwiY29tcGF0aWJsZVwiKSA8IDBcbiAgICAmJiBybW96aWxsYS5leGVjKHVhKVxuICAgIHx8IFtdO1xuXG52YXIgYnJvd3NlciA9IHtuYW1lOiBtYXRjaFsxXSB8fCBcIlwiLCB2ZXJzaW9uOiBtYXRjaFsyXSB8fCBcIjBcIn07XG5cbmlmIChtYXRjaFszXSA9PT0gXCJzYWZhcmlcIikge1xuICAgIGJyb3dzZXIubmFtZSA9IG1hdGNoWzNdO1xufVxuXG5pZiAoYnJvd3Nlci5uYW1lID09PSAnbXNpZScpIHtcbiAgICBpZiAoZG9jdW1lbnQuZG9jdW1lbnRNb2RlKSB7IC8vIElFOCBvciBsYXRlclxuICAgICAgICBicm93c2VyLmRvY3VtZW50TW9kZSA9IGRvY3VtZW50LmRvY3VtZW50TW9kZTtcbiAgICB9IGVsc2UgeyAvLyBJRSA1LTdcbiAgICAgICAgYnJvd3Nlci5kb2N1bWVudE1vZGUgPSA1OyAvLyBBc3N1bWUgcXVpcmtzIG1vZGUgdW5sZXNzIHByb3ZlbiBvdGhlcndpc2VcbiAgICAgICAgaWYgKGRvY3VtZW50LmNvbXBhdE1vZGUpIHtcbiAgICAgICAgICAgIGlmIChkb2N1bWVudC5jb21wYXRNb2RlID09PSBcIkNTUzFDb21wYXRcIikge1xuICAgICAgICAgICAgICAgIGJyb3dzZXIuZG9jdW1lbnRNb2RlID0gNzsgLy8gc3RhbmRhcmRzIG1vZGVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIFBsYXRmb3JtIGRldGVjdGlvblxuLy8gVXNlcmFnZW50IFJlZ0V4cFxudmFyIHJwbGF0Zm9ybSA9IC8oaXBhZHxpcGhvbmV8aXBvZHxhbmRyb2lkfGJsYWNrYmVycnl8cGxheWJvb2t8d2luZG93cyBjZXx3ZWJvcykvO1xudmFyIHJ0YWJsZXQgPSAvKGlwYWR8cGxheWJvb2spLztcbnZhciByYW5kcm9pZCA9IC8oYW5kcm9pZCkvO1xudmFyIHJtb2JpbGUgPSAvKG1vYmlsZSkvO1xuXG5wbGF0Zm9ybSA9IHJwbGF0Zm9ybS5leGVjKHVhKSB8fCBbXTtcbnZhciB0YWJsZXQgPSBydGFibGV0LmV4ZWModWEpIHx8ICFybW9iaWxlLmV4ZWModWEpICYmIHJhbmRyb2lkLmV4ZWModWEpIHx8IFtdO1xuXG5pZiAocGxhdGZvcm1bMV0pIHtcbiAgICBwbGF0Zm9ybVsxXSA9IHBsYXRmb3JtWzFdLnJlcGxhY2UoL1xccy9nLCBcIl9cIik7IC8vIENoYW5nZSB3aGl0ZXNwYWNlIHRvIHVuZGVyc2NvcmUuIEVuYWJsZXMgZG90IG5vdGF0aW9uLlxufVxuXG52YXIgcGxhdGZvcm0gPSB7XG4gICAgdHlwZTogcGxhdGZvcm1bMV0gfHwgXCJcIixcbiAgICB0YWJsZXQ6ICEhdGFibGV0WzFdLFxuICAgIG1vYmlsZTogcGxhdGZvcm1bMV0gJiYgIXRhYmxldFsxXSB8fCBmYWxzZVxufTtcbmlmICghcGxhdGZvcm0udHlwZSkge1xuICAgIHBsYXRmb3JtLnR5cGUgPSAncGMnO1xufVxuXG5wbGF0Zm9ybS5vcyA9IHBsYXRmb3JtLnR5cGU7XG5pZiAocGxhdGZvcm0udHlwZSA9PT0gJ2lwYWQnIHx8IHBsYXRmb3JtLnR5cGUgPT09ICdpcGhvbmUnIHx8IHBsYXRmb3JtLnR5cGUgPT09ICdpcG9kJykge1xuICAgIHBsYXRmb3JtLm9zID0gJ2lvcyc7XG59IGVsc2UgaWYgKHBsYXRmb3JtLnR5cGUgPT09ICdhbmRyb2lkJykge1xuICAgIHBsYXRmb3JtLm9zID0gJ2FuZHJvaWQnO1xufSBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKFwiV2luXCIpICE9PSAtMSkge1xuICAgIHBsYXRmb3JtLm9zID0gXCJ3aW5kb3dzXCI7XG4gICAgcGxhdGZvcm0udmVyc2lvbiA9IG5hdmlnYXRvci51c2VyQWdlbnQubWF0Y2goL3dpblteIF0qIChbXjtdKikvaSk7XG4gICAgcGxhdGZvcm0udmVyc2lvbiA9IHBsYXRmb3JtLnZlcnNpb24gJiYgcGxhdGZvcm0udmVyc2lvblsxXTtcbn0gZWxzZSBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZihcIk1hY1wiKSAhPT0gLTEpIHtcbiAgICBwbGF0Zm9ybS5vcyA9IFwibWFjb3NcIjtcbn0gZWxzZSBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZihcIlgxMVwiKSAhPT0gLTEpIHtcbiAgICBwbGF0Zm9ybS5vcyA9IFwidW5peFwiO1xufSBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKFwiTGludXhcIikgIT09IC0xKSB7XG4gICAgcGxhdGZvcm0ub3MgPSBcImxpbnV4XCI7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSDQlNC10YLQtdC60YLQuNGA0L7QstCw0L3QuNC1INCx0LvQvtC60LjRgNC+0LLQutC4INCz0YDQvtC80LrQvtGB0YLQuFxudmFyIG5vVm9sdW1lID0gdHJ1ZTtcbnRyeSB7XG4gICAgdmFyIGF1ZGlvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXVkaW8nKTtcbiAgICBhdWRpby52b2x1bWUgPSAwLjYzO1xuICAgIG5vVm9sdW1lID0gTWF0aC5hYnMoYXVkaW8udm9sdW1lIC0gMC42MykgPiAwLjAxO1xufSBjYXRjaChlKSB7XG4gICAgbm9Wb2x1bWUgPSB0cnVlO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0g0K3QutGB0L/QvtGA0YJcbi8qKlxuICog0JjQvdGE0L7RgNC80LDRhtC40Y8g0L7QsSDQvtC60YDRg9C20LXQvdC40LhcbiAqIEBuYW1lc3BhY2VcbiAqIEBwcml2YXRlXG4gKi9cbnZhciBkZXRlY3QgPSB7XG4gICAgLyoqXG4gICAgICog0JjQvdGE0L7RgNC80LDRhtC40Y8g0L4g0LHRgNCw0YPQt9C10YDQtVxuICAgICAqIEB0eXBlIHtvYmplY3R9XG4gICAgICogQHByb3BlcnR5IHtzdHJpbmd9IG5hbWUgLSDQvdCw0LfQstCw0L3QuNC1INCx0YDQsNGD0LfQtdGA0LBcbiAgICAgKiBAcHJvcGVydHkge3N0cmluZ30gdmVyc2lvbiAtINCy0LXRgNGB0LjRj1xuICAgICAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBbZG9jdW1lbnRNb2RlXSAtINCy0LXRgNGB0LjRjyDQtNC+0LrRg9C80LXQvdGC0LBcbiAgICAgKi9cbiAgICBicm93c2VyOiBicm93c2VyLFxuXG4gICAgLyoqXG4gICAgICog0JjQvdGE0L7RgNC80LDRhtC40Y8g0L4g0L/Qu9Cw0YLRhNC+0YDQvNC1XG4gICAgICogQHR5cGUge29iamVjdH1cbiAgICAgKiBAcHJvcGVydHkge3N0cmluZ30gb3MgLSDRgtC40L8g0L7Qv9C10YDQsNGG0LjQvtC90L3QvtC5INGB0LjRgdGC0LXQvNGLXG4gICAgICogQHByb3BlcnR5IHtzdHJpbmd9IHR5cGUgLSDRgtC40L8g0L/Qu9Cw0YLRhNC+0YDQvNGLXG4gICAgICogQHByb3BlcnR5IHtib29sZWFufSB0YWJsZXQgLSDQv9C70LDQvdGI0LXRglxuICAgICAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gbW9iaWxlIC0g0LzQvtCx0LjQu9GM0L3Ri9C5XG4gICAgICovXG4gICAgcGxhdGZvcm06IHBsYXRmb3JtLFxuXG4gICAgLyoqXG4gICAgICog0J3QsNGB0YLRgNC+0LnQutCwINCz0YDQvtC80LrQvtGB0YLQuFxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIG9ubHlEZXZpY2VWb2x1bWU6IG5vVm9sdW1lXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRldGVjdDtcbiIsIi8qKlxuICogQGxpY2Vuc2UgU1dGT2JqZWN0IHYyLjIgPGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9zd2ZvYmplY3QvPlxuICogaXMgcmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlIDxodHRwOi8vd3d3Lm9wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlLnBocD5cbiAqIEBwcml2YXRlXG4qL1xudmFyIHN3Zm9iamVjdCA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgVU5ERUYgPSBcInVuZGVmaW5lZFwiLFxuXHRcdE9CSkVDVCA9IFwib2JqZWN0XCIsXG5cdFx0U0hPQ0tXQVZFX0ZMQVNIID0gXCJTaG9ja3dhdmUgRmxhc2hcIixcblx0XHRTSE9DS1dBVkVfRkxBU0hfQVggPSBcIlNob2Nrd2F2ZUZsYXNoLlNob2Nrd2F2ZUZsYXNoXCIsXG5cdFx0RkxBU0hfTUlNRV9UWVBFID0gXCJhcHBsaWNhdGlvbi94LXNob2Nrd2F2ZS1mbGFzaFwiLFxuXHRcdEVYUFJFU1NfSU5TVEFMTF9JRCA9IFwiU1dGT2JqZWN0RXhwckluc3RcIixcblx0XHRPTl9SRUFEWV9TVEFURV9DSEFOR0UgPSBcIm9ucmVhZHlzdGF0ZWNoYW5nZVwiLFxuXHRcdHdpbiA9IHdpbmRvdyxcblx0XHRkb2MgPSBkb2N1bWVudCxcblx0XHRuYXYgPSBuYXZpZ2F0b3IsXG5cdFx0cGx1Z2luID0gZmFsc2UsXG5cdFx0ZG9tTG9hZEZuQXJyID0gW21haW5dLFxuXHRcdHJlZ09iakFyciA9IFtdLFxuXHRcdG9iaklkQXJyID0gW10sXG5cdFx0bGlzdGVuZXJzQXJyID0gW10sXG5cdFx0c3RvcmVkQWx0Q29udGVudCxcblx0XHRzdG9yZWRBbHRDb250ZW50SWQsXG5cdFx0c3RvcmVkQ2FsbGJhY2tGbixcblx0XHRzdG9yZWRDYWxsYmFja09iaixcblx0XHRpc0RvbUxvYWRlZCA9IGZhbHNlLFxuXHRcdGlzRXhwcmVzc0luc3RhbGxBY3RpdmUgPSBmYWxzZSxcblx0XHRkeW5hbWljU3R5bGVzaGVldCxcblx0XHRkeW5hbWljU3R5bGVzaGVldE1lZGlhLFxuXHRcdGF1dG9IaWRlU2hvdyA9IHRydWUsXG5cdC8qIENlbnRyYWxpemVkIGZ1bmN0aW9uIGZvciBicm93c2VyIGZlYXR1cmUgZGV0ZWN0aW9uXG5cdFx0LSBVc2VyIGFnZW50IHN0cmluZyBkZXRlY3Rpb24gaXMgb25seSB1c2VkIHdoZW4gbm8gZ29vZCBhbHRlcm5hdGl2ZSBpcyBwb3NzaWJsZVxuXHRcdC0gSXMgZXhlY3V0ZWQgZGlyZWN0bHkgZm9yIG9wdGltYWwgcGVyZm9ybWFuY2Vcblx0Ki9cblx0dWEgPSBmdW5jdGlvbigpIHtcblx0XHR2YXIgdzNjZG9tID0gdHlwZW9mIGRvYy5nZXRFbGVtZW50QnlJZCAhPSBVTkRFRiAmJiB0eXBlb2YgZG9jLmdldEVsZW1lbnRzQnlUYWdOYW1lICE9IFVOREVGICYmIHR5cGVvZiBkb2MuY3JlYXRlRWxlbWVudCAhPSBVTkRFRixcblx0XHRcdHUgPSBuYXYudXNlckFnZW50LnRvTG93ZXJDYXNlKCksXG5cdFx0XHRwID0gbmF2LnBsYXRmb3JtLnRvTG93ZXJDYXNlKCksXG5cdFx0XHR3aW5kb3dzID0gcCA/IC93aW4vLnRlc3QocCkgOiAvd2luLy50ZXN0KHUpLFxuXHRcdFx0bWFjID0gcCA/IC9tYWMvLnRlc3QocCkgOiAvbWFjLy50ZXN0KHUpLFxuXHRcdFx0d2Via2l0ID0gL3dlYmtpdC8udGVzdCh1KSA/IHBhcnNlRmxvYXQodS5yZXBsYWNlKC9eLip3ZWJraXRcXC8oXFxkKyhcXC5cXGQrKT8pLiokLywgXCIkMVwiKSkgOiBmYWxzZSwgLy8gcmV0dXJucyBlaXRoZXIgdGhlIHdlYmtpdCB2ZXJzaW9uIG9yIGZhbHNlIGlmIG5vdCB3ZWJraXRcblx0XHRcdGllID0gIStcIlxcdjFcIiwgLy8gZmVhdHVyZSBkZXRlY3Rpb24gYmFzZWQgb24gQW5kcmVhIEdpYW1tYXJjaGkncyBzb2x1dGlvbjogaHR0cDovL3dlYnJlZmxlY3Rpb24uYmxvZ3Nwb3QuY29tLzIwMDkvMDEvMzItYnl0ZXMtdG8ta25vdy1pZi15b3VyLWJyb3dzZXItaXMtaWUuaHRtbFxuXHRcdFx0cGxheWVyVmVyc2lvbiA9IFswLDAsMF0sXG5cdFx0XHRkID0gbnVsbDtcblx0XHRpZiAodHlwZW9mIG5hdi5wbHVnaW5zICE9IFVOREVGICYmIHR5cGVvZiBuYXYucGx1Z2luc1tTSE9DS1dBVkVfRkxBU0hdID09IE9CSkVDVCkge1xuXHRcdFx0ZCA9IG5hdi5wbHVnaW5zW1NIT0NLV0FWRV9GTEFTSF0uZGVzY3JpcHRpb247XG5cdFx0XHRpZiAoZCAmJiAhKHR5cGVvZiBuYXYubWltZVR5cGVzICE9IFVOREVGICYmIG5hdi5taW1lVHlwZXNbRkxBU0hfTUlNRV9UWVBFXSAmJiAhbmF2Lm1pbWVUeXBlc1tGTEFTSF9NSU1FX1RZUEVdLmVuYWJsZWRQbHVnaW4pKSB7IC8vIG5hdmlnYXRvci5taW1lVHlwZXNbXCJhcHBsaWNhdGlvbi94LXNob2Nrd2F2ZS1mbGFzaFwiXS5lbmFibGVkUGx1Z2luIGluZGljYXRlcyB3aGV0aGVyIHBsdWctaW5zIGFyZSBlbmFibGVkIG9yIGRpc2FibGVkIGluIFNhZmFyaSAzK1xuXHRcdFx0XHRwbHVnaW4gPSB0cnVlO1xuXHRcdFx0XHRpZSA9IGZhbHNlOyAvLyBjYXNjYWRlZCBmZWF0dXJlIGRldGVjdGlvbiBmb3IgSW50ZXJuZXQgRXhwbG9yZXJcblx0XHRcdFx0ZCA9IGQucmVwbGFjZSgvXi4qXFxzKyhcXFMrXFxzK1xcUyskKS8sIFwiJDFcIik7XG5cdFx0XHRcdHBsYXllclZlcnNpb25bMF0gPSBwYXJzZUludChkLnJlcGxhY2UoL14oLiopXFwuLiokLywgXCIkMVwiKSwgMTApO1xuXHRcdFx0XHRwbGF5ZXJWZXJzaW9uWzFdID0gcGFyc2VJbnQoZC5yZXBsYWNlKC9eLipcXC4oLiopXFxzLiokLywgXCIkMVwiKSwgMTApO1xuXHRcdFx0XHRwbGF5ZXJWZXJzaW9uWzJdID0gL1thLXpBLVpdLy50ZXN0KGQpID8gcGFyc2VJbnQoZC5yZXBsYWNlKC9eLipbYS16QS1aXSsoLiopJC8sIFwiJDFcIiksIDEwKSA6IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHR5cGVvZiB3aW4uQWN0aXZlWE9iamVjdCAhPSBVTkRFRikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dmFyIGEgPSBuZXcgQWN0aXZlWE9iamVjdChTSE9DS1dBVkVfRkxBU0hfQVgpO1xuXHRcdFx0XHRpZiAoYSkgeyAvLyBhIHdpbGwgcmV0dXJuIG51bGwgd2hlbiBBY3RpdmVYIGlzIGRpc2FibGVkXG5cdFx0XHRcdFx0ZCA9IGEuR2V0VmFyaWFibGUoXCIkdmVyc2lvblwiKTtcblx0XHRcdFx0XHRpZiAoZCkge1xuXHRcdFx0XHRcdFx0aWUgPSB0cnVlOyAvLyBjYXNjYWRlZCBmZWF0dXJlIGRldGVjdGlvbiBmb3IgSW50ZXJuZXQgRXhwbG9yZXJcblx0XHRcdFx0XHRcdGQgPSBkLnNwbGl0KFwiIFwiKVsxXS5zcGxpdChcIixcIik7XG5cdFx0XHRcdFx0XHRwbGF5ZXJWZXJzaW9uID0gW3BhcnNlSW50KGRbMF0sIDEwKSwgcGFyc2VJbnQoZFsxXSwgMTApLCBwYXJzZUludChkWzJdLCAxMCldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2F0Y2goZSkge31cblx0XHR9XG5cdFx0cmV0dXJuIHsgdzM6dzNjZG9tLCBwdjpwbGF5ZXJWZXJzaW9uLCB3azp3ZWJraXQsIGllOmllLCB3aW46d2luZG93cywgbWFjOm1hYyB9O1xuXHR9KCksXG5cdC8qIENyb3NzLWJyb3dzZXIgb25Eb21Mb2FkXG5cdFx0LSBXaWxsIGZpcmUgYW4gZXZlbnQgYXMgc29vbiBhcyB0aGUgRE9NIG9mIGEgd2ViIHBhZ2UgaXMgbG9hZGVkXG5cdFx0LSBJbnRlcm5ldCBFeHBsb3JlciB3b3JrYXJvdW5kIGJhc2VkIG9uIERpZWdvIFBlcmluaSdzIHNvbHV0aW9uOiBodHRwOi8vamF2YXNjcmlwdC5ud2JveC5jb20vSUVDb250ZW50TG9hZGVkL1xuXHRcdC0gUmVndWxhciBvbmxvYWQgc2VydmVzIGFzIGZhbGxiYWNrXG5cdCovXG5cdG9uRG9tTG9hZCA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmICghdWEudzMpIHsgcmV0dXJuOyB9XG5cdFx0aWYgKCh0eXBlb2YgZG9jLnJlYWR5U3RhdGUgIT0gVU5ERUYgJiYgZG9jLnJlYWR5U3RhdGUgPT0gXCJjb21wbGV0ZVwiKSB8fCAodHlwZW9mIGRvYy5yZWFkeVN0YXRlID09IFVOREVGICYmIChkb2MuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJib2R5XCIpWzBdIHx8IGRvYy5ib2R5KSkpIHsgLy8gZnVuY3Rpb24gaXMgZmlyZWQgYWZ0ZXIgb25sb2FkLCBlLmcuIHdoZW4gc2NyaXB0IGlzIGluc2VydGVkIGR5bmFtaWNhbGx5XG5cdFx0XHRjYWxsRG9tTG9hZEZ1bmN0aW9ucygpO1xuXHRcdH1cblx0XHRpZiAoIWlzRG9tTG9hZGVkKSB7XG5cdFx0XHRpZiAodHlwZW9mIGRvYy5hZGRFdmVudExpc3RlbmVyICE9IFVOREVGKSB7XG5cdFx0XHRcdGRvYy5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBjYWxsRG9tTG9hZEZ1bmN0aW9ucywgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVhLmllICYmIHVhLndpbikge1xuXHRcdFx0XHRkb2MuYXR0YWNoRXZlbnQoT05fUkVBRFlfU1RBVEVfQ0hBTkdFLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRpZiAoZG9jLnJlYWR5U3RhdGUgPT0gXCJjb21wbGV0ZVwiKSB7XG5cdFx0XHRcdFx0XHRkb2MuZGV0YWNoRXZlbnQoT05fUkVBRFlfU1RBVEVfQ0hBTkdFLCBhcmd1bWVudHMuY2FsbGVlKTtcblx0XHRcdFx0XHRcdGNhbGxEb21Mb2FkRnVuY3Rpb25zKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHdpbiA9PSB0b3ApIHsgLy8gaWYgbm90IGluc2lkZSBhbiBpZnJhbWVcblx0XHRcdFx0XHQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHRcdGlmIChpc0RvbUxvYWRlZCkgeyByZXR1cm47IH1cblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGRvYy5kb2N1bWVudEVsZW1lbnQuZG9TY3JvbGwoXCJsZWZ0XCIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2F0Y2goZSkge1xuXHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsIDApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjYWxsRG9tTG9hZEZ1bmN0aW9ucygpO1xuXHRcdFx0XHRcdH0pKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh1YS53aykge1xuXHRcdFx0XHQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHRpZiAoaXNEb21Mb2FkZWQpIHsgcmV0dXJuOyB9XG5cdFx0XHRcdFx0aWYgKCEvbG9hZGVkfGNvbXBsZXRlLy50ZXN0KGRvYy5yZWFkeVN0YXRlKSkge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLCAwKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FsbERvbUxvYWRGdW5jdGlvbnMoKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdH1cblx0XHRcdGFkZExvYWRFdmVudChjYWxsRG9tTG9hZEZ1bmN0aW9ucyk7XG5cdFx0fVxuXHR9KCk7XG5cdGZ1bmN0aW9uIGNhbGxEb21Mb2FkRnVuY3Rpb25zKCkge1xuXHRcdGlmIChpc0RvbUxvYWRlZCkgeyByZXR1cm47IH1cblx0XHR0cnkgeyAvLyB0ZXN0IGlmIHdlIGNhbiByZWFsbHkgYWRkL3JlbW92ZSBlbGVtZW50cyB0by9mcm9tIHRoZSBET007IHdlIGRvbid0IHdhbnQgdG8gZmlyZSBpdCB0b28gZWFybHlcblx0XHRcdHZhciB0ID0gZG9jLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYm9keVwiKVswXS5hcHBlbmRDaGlsZChjcmVhdGVFbGVtZW50KFwic3BhblwiKSk7XG5cdFx0XHR0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodCk7XG5cdFx0fVxuXHRcdGNhdGNoIChlKSB7IHJldHVybjsgfVxuXHRcdGlzRG9tTG9hZGVkID0gdHJ1ZTtcblx0XHR2YXIgZGwgPSBkb21Mb2FkRm5BcnIubGVuZ3RoO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgZGw7IGkrKykge1xuXHRcdFx0ZG9tTG9hZEZuQXJyW2ldKCk7XG5cdFx0fVxuXHR9XG5cdGZ1bmN0aW9uIGFkZERvbUxvYWRFdmVudChmbikge1xuXHRcdGlmIChpc0RvbUxvYWRlZCkge1xuXHRcdFx0Zm4oKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRkb21Mb2FkRm5BcnJbZG9tTG9hZEZuQXJyLmxlbmd0aF0gPSBmbjsgLy8gQXJyYXkucHVzaCgpIGlzIG9ubHkgYXZhaWxhYmxlIGluIElFNS41K1xuXHRcdH1cblx0fVxuXHQvKiBDcm9zcy1icm93c2VyIG9ubG9hZFxuXHRcdC0gQmFzZWQgb24gSmFtZXMgRWR3YXJkcycgc29sdXRpb246IGh0dHA6Ly9icm90aGVyY2FrZS5jb20vc2l0ZS9yZXNvdXJjZXMvc2NyaXB0cy9vbmxvYWQvXG5cdFx0LSBXaWxsIGZpcmUgYW4gZXZlbnQgYXMgc29vbiBhcyBhIHdlYiBwYWdlIGluY2x1ZGluZyBhbGwgb2YgaXRzIGFzc2V0cyBhcmUgbG9hZGVkXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGRMb2FkRXZlbnQoZm4pIHtcblx0XHRpZiAodHlwZW9mIHdpbi5hZGRFdmVudExpc3RlbmVyICE9IFVOREVGKSB7XG5cdFx0XHR3aW4uYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgZm4sIGZhbHNlKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZW9mIGRvYy5hZGRFdmVudExpc3RlbmVyICE9IFVOREVGKSB7XG5cdFx0XHRkb2MuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgZm4sIGZhbHNlKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZW9mIHdpbi5hdHRhY2hFdmVudCAhPSBVTkRFRikge1xuXHRcdFx0YWRkTGlzdGVuZXIod2luLCBcIm9ubG9hZFwiLCBmbik7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHR5cGVvZiB3aW4ub25sb2FkID09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0dmFyIGZuT2xkID0gd2luLm9ubG9hZDtcblx0XHRcdHdpbi5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0Zm5PbGQoKTtcblx0XHRcdFx0Zm4oKTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0d2luLm9ubG9hZCA9IGZuO1xuXHRcdH1cblx0fVxuXHQvKiBNYWluIGZ1bmN0aW9uXG5cdFx0LSBXaWxsIHByZWZlcmFibHkgZXhlY3V0ZSBvbkRvbUxvYWQsIG90aGVyd2lzZSBvbmxvYWQgKGFzIGEgZmFsbGJhY2spXG5cdCovXG5cdGZ1bmN0aW9uIG1haW4oKSB7XG5cdFx0aWYgKHBsdWdpbikge1xuXHRcdFx0dGVzdFBsYXllclZlcnNpb24oKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRtYXRjaFZlcnNpb25zKCk7XG5cdFx0fVxuXHR9XG5cdC8qIERldGVjdCB0aGUgRmxhc2ggUGxheWVyIHZlcnNpb24gZm9yIG5vbi1JbnRlcm5ldCBFeHBsb3JlciBicm93c2Vyc1xuXHRcdC0gRGV0ZWN0aW5nIHRoZSBwbHVnLWluIHZlcnNpb24gdmlhIHRoZSBvYmplY3QgZWxlbWVudCBpcyBtb3JlIHByZWNpc2UgdGhhbiB1c2luZyB0aGUgcGx1Z2lucyBjb2xsZWN0aW9uIGl0ZW0ncyBkZXNjcmlwdGlvbjpcblx0XHQgIGEuIEJvdGggcmVsZWFzZSBhbmQgYnVpbGQgbnVtYmVycyBjYW4gYmUgZGV0ZWN0ZWRcblx0XHQgIGIuIEF2b2lkIHdyb25nIGRlc2NyaXB0aW9ucyBieSBjb3JydXB0IGluc3RhbGxlcnMgcHJvdmlkZWQgYnkgQWRvYmVcblx0XHQgIGMuIEF2b2lkIHdyb25nIGRlc2NyaXB0aW9ucyBieSBtdWx0aXBsZSBGbGFzaCBQbGF5ZXIgZW50cmllcyBpbiB0aGUgcGx1Z2luIEFycmF5LCBjYXVzZWQgYnkgaW5jb3JyZWN0IGJyb3dzZXIgaW1wb3J0c1xuXHRcdC0gRGlzYWR2YW50YWdlIG9mIHRoaXMgbWV0aG9kIGlzIHRoYXQgaXQgZGVwZW5kcyBvbiB0aGUgYXZhaWxhYmlsaXR5IG9mIHRoZSBET00sIHdoaWxlIHRoZSBwbHVnaW5zIGNvbGxlY3Rpb24gaXMgaW1tZWRpYXRlbHkgYXZhaWxhYmxlXG5cdCovXG5cdGZ1bmN0aW9uIHRlc3RQbGF5ZXJWZXJzaW9uKCkge1xuXHRcdHZhciBiID0gZG9jLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYm9keVwiKVswXTtcblx0XHR2YXIgbyA9IGNyZWF0ZUVsZW1lbnQoT0JKRUNUKTtcblx0XHRvLnNldEF0dHJpYnV0ZShcInR5cGVcIiwgRkxBU0hfTUlNRV9UWVBFKTtcblx0XHR2YXIgdCA9IGIuYXBwZW5kQ2hpbGQobyk7XG5cdFx0aWYgKHQpIHtcblx0XHRcdHZhciBjb3VudGVyID0gMDtcblx0XHRcdChmdW5jdGlvbigpe1xuXHRcdFx0XHRpZiAodHlwZW9mIHQuR2V0VmFyaWFibGUgIT0gVU5ERUYpIHtcblx0XHRcdFx0XHR2YXIgZCA9IHQuR2V0VmFyaWFibGUoXCIkdmVyc2lvblwiKTtcblx0XHRcdFx0XHRpZiAoZCkge1xuXHRcdFx0XHRcdFx0ZCA9IGQuc3BsaXQoXCIgXCIpWzFdLnNwbGl0KFwiLFwiKTtcblx0XHRcdFx0XHRcdHVhLnB2ID0gW3BhcnNlSW50KGRbMF0sIDEwKSwgcGFyc2VJbnQoZFsxXSwgMTApLCBwYXJzZUludChkWzJdLCAxMCldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChjb3VudGVyIDwgMTApIHtcblx0XHRcdFx0XHRjb3VudGVyKys7XG5cdFx0XHRcdFx0c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLCAxMCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGIucmVtb3ZlQ2hpbGQobyk7XG5cdFx0XHRcdHQgPSBudWxsO1xuXHRcdFx0XHRtYXRjaFZlcnNpb25zKCk7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdG1hdGNoVmVyc2lvbnMoKTtcblx0XHR9XG5cdH1cblx0LyogUGVyZm9ybSBGbGFzaCBQbGF5ZXIgYW5kIFNXRiB2ZXJzaW9uIG1hdGNoaW5nOyBzdGF0aWMgcHVibGlzaGluZyBvbmx5XG5cdCovXG5cdGZ1bmN0aW9uIG1hdGNoVmVyc2lvbnMoKSB7XG5cdFx0dmFyIHJsID0gcmVnT2JqQXJyLmxlbmd0aDtcblx0XHRpZiAocmwgPiAwKSB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHJsOyBpKyspIHsgLy8gZm9yIGVhY2ggcmVnaXN0ZXJlZCBvYmplY3QgZWxlbWVudFxuXHRcdFx0XHR2YXIgaWQgPSByZWdPYmpBcnJbaV0uaWQ7XG5cdFx0XHRcdHZhciBjYiA9IHJlZ09iakFycltpXS5jYWxsYmFja0ZuO1xuXHRcdFx0XHR2YXIgY2JPYmogPSB7c3VjY2VzczpmYWxzZSwgaWQ6aWR9O1xuXHRcdFx0XHRpZiAodWEucHZbMF0gPiAwKSB7XG5cdFx0XHRcdFx0dmFyIG9iaiA9IGdldEVsZW1lbnRCeUlkKGlkKTtcblx0XHRcdFx0XHRpZiAob2JqKSB7XG5cdFx0XHRcdFx0XHRpZiAoaGFzUGxheWVyVmVyc2lvbihyZWdPYmpBcnJbaV0uc3dmVmVyc2lvbikgJiYgISh1YS53ayAmJiB1YS53ayA8IDMxMikpIHsgLy8gRmxhc2ggUGxheWVyIHZlcnNpb24gPj0gcHVibGlzaGVkIFNXRiB2ZXJzaW9uOiBIb3VzdG9uLCB3ZSBoYXZlIGEgbWF0Y2ghXG5cdFx0XHRcdFx0XHRcdHNldFZpc2liaWxpdHkoaWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY2IpIHtcblx0XHRcdFx0XHRcdFx0XHRjYk9iai5zdWNjZXNzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRjYk9iai5yZWYgPSBnZXRPYmplY3RCeUlkKGlkKTtcblx0XHRcdFx0XHRcdFx0XHRjYihjYk9iaik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKHJlZ09iakFycltpXS5leHByZXNzSW5zdGFsbCAmJiBjYW5FeHByZXNzSW5zdGFsbCgpKSB7IC8vIHNob3cgdGhlIEFkb2JlIEV4cHJlc3MgSW5zdGFsbCBkaWFsb2cgaWYgc2V0IGJ5IHRoZSB3ZWIgcGFnZSBhdXRob3IgYW5kIGlmIHN1cHBvcnRlZFxuXHRcdFx0XHRcdFx0XHR2YXIgYXR0ID0ge307XG5cdFx0XHRcdFx0XHRcdGF0dC5kYXRhID0gcmVnT2JqQXJyW2ldLmV4cHJlc3NJbnN0YWxsO1xuXHRcdFx0XHRcdFx0XHRhdHQud2lkdGggPSBvYmouZ2V0QXR0cmlidXRlKFwid2lkdGhcIikgfHwgXCIwXCI7XG5cdFx0XHRcdFx0XHRcdGF0dC5oZWlnaHQgPSBvYmouZ2V0QXR0cmlidXRlKFwiaGVpZ2h0XCIpIHx8IFwiMFwiO1xuXHRcdFx0XHRcdFx0XHRpZiAob2JqLmdldEF0dHJpYnV0ZShcImNsYXNzXCIpKSB7IGF0dC5zdHlsZWNsYXNzID0gb2JqLmdldEF0dHJpYnV0ZShcImNsYXNzXCIpOyB9XG5cdFx0XHRcdFx0XHRcdGlmIChvYmouZ2V0QXR0cmlidXRlKFwiYWxpZ25cIikpIHsgYXR0LmFsaWduID0gb2JqLmdldEF0dHJpYnV0ZShcImFsaWduXCIpOyB9XG5cdFx0XHRcdFx0XHRcdC8vIHBhcnNlIEhUTUwgb2JqZWN0IHBhcmFtIGVsZW1lbnQncyBuYW1lLXZhbHVlIHBhaXJzXG5cdFx0XHRcdFx0XHRcdHZhciBwYXIgPSB7fTtcblx0XHRcdFx0XHRcdFx0dmFyIHAgPSBvYmouZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJhbVwiKTtcblx0XHRcdFx0XHRcdFx0dmFyIHBsID0gcC5sZW5ndGg7XG5cdFx0XHRcdFx0XHRcdGZvciAodmFyIGogPSAwOyBqIDwgcGw7IGorKykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwW2pdLmdldEF0dHJpYnV0ZShcIm5hbWVcIikudG9Mb3dlckNhc2UoKSAhPSBcIm1vdmllXCIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHBhcltwW2pdLmdldEF0dHJpYnV0ZShcIm5hbWVcIildID0gcFtqXS5nZXRBdHRyaWJ1dGUoXCJ2YWx1ZVwiKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0c2hvd0V4cHJlc3NJbnN0YWxsKGF0dCwgcGFyLCBpZCwgY2IpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZSB7IC8vIEZsYXNoIFBsYXllciBhbmQgU1dGIHZlcnNpb24gbWlzbWF0Y2ggb3IgYW4gb2xkZXIgV2Via2l0IGVuZ2luZSB0aGF0IGlnbm9yZXMgdGhlIEhUTUwgb2JqZWN0IGVsZW1lbnQncyBuZXN0ZWQgcGFyYW0gZWxlbWVudHM6IGRpc3BsYXkgYWx0ZXJuYXRpdmUgY29udGVudCBpbnN0ZWFkIG9mIFNXRlxuXHRcdFx0XHRcdFx0XHRkaXNwbGF5QWx0Q29udGVudChvYmopO1xuXHRcdFx0XHRcdFx0XHRpZiAoY2IpIHsgY2IoY2JPYmopOyB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1x0Ly8gaWYgbm8gRmxhc2ggUGxheWVyIGlzIGluc3RhbGxlZCBvciB0aGUgZnAgdmVyc2lvbiBjYW5ub3QgYmUgZGV0ZWN0ZWQgd2UgbGV0IHRoZSBIVE1MIG9iamVjdCBlbGVtZW50IGRvIGl0cyBqb2IgKGVpdGhlciBzaG93IGEgU1dGIG9yIGFsdGVybmF0aXZlIGNvbnRlbnQpXG5cdFx0XHRcdFx0c2V0VmlzaWJpbGl0eShpZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0aWYgKGNiKSB7XG5cdFx0XHRcdFx0XHR2YXIgbyA9IGdldE9iamVjdEJ5SWQoaWQpOyAvLyB0ZXN0IHdoZXRoZXIgdGhlcmUgaXMgYW4gSFRNTCBvYmplY3QgZWxlbWVudCBvciBub3Rcblx0XHRcdFx0XHRcdGlmIChvICYmIHR5cGVvZiBvLlNldFZhcmlhYmxlICE9IFVOREVGKSB7XG5cdFx0XHRcdFx0XHRcdGNiT2JqLnN1Y2Nlc3MgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjYk9iai5yZWYgPSBvO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2IoY2JPYmopO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRmdW5jdGlvbiBnZXRPYmplY3RCeUlkKG9iamVjdElkU3RyKSB7XG5cdFx0dmFyIHIgPSBudWxsO1xuXHRcdHZhciBvID0gZ2V0RWxlbWVudEJ5SWQob2JqZWN0SWRTdHIpO1xuXHRcdGlmIChvICYmIG8ubm9kZU5hbWUgPT0gXCJPQkpFQ1RcIikge1xuXHRcdFx0aWYgKHR5cGVvZiBvLlNldFZhcmlhYmxlICE9IFVOREVGKSB7XG5cdFx0XHRcdHIgPSBvO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHZhciBuID0gby5nZXRFbGVtZW50c0J5VGFnTmFtZShPQkpFQ1QpWzBdO1xuXHRcdFx0XHRpZiAobikge1xuXHRcdFx0XHRcdHIgPSBuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cdC8qIFJlcXVpcmVtZW50cyBmb3IgQWRvYmUgRXhwcmVzcyBJbnN0YWxsXG5cdFx0LSBvbmx5IG9uZSBpbnN0YW5jZSBjYW4gYmUgYWN0aXZlIGF0IGEgdGltZVxuXHRcdC0gZnAgNi4wLjY1IG9yIGhpZ2hlclxuXHRcdC0gV2luL01hYyBPUyBvbmx5XG5cdFx0LSBubyBXZWJraXQgZW5naW5lcyBvbGRlciB0aGFuIHZlcnNpb24gMzEyXG5cdCovXG5cdGZ1bmN0aW9uIGNhbkV4cHJlc3NJbnN0YWxsKCkge1xuXHRcdHJldHVybiAhaXNFeHByZXNzSW5zdGFsbEFjdGl2ZSAmJiBoYXNQbGF5ZXJWZXJzaW9uKFwiNi4wLjY1XCIpICYmICh1YS53aW4gfHwgdWEubWFjKSAmJiAhKHVhLndrICYmIHVhLndrIDwgMzEyKTtcblx0fVxuXHQvKiBTaG93IHRoZSBBZG9iZSBFeHByZXNzIEluc3RhbGwgZGlhbG9nXG5cdFx0LSBSZWZlcmVuY2U6IGh0dHA6Ly93d3cuYWRvYmUuY29tL2NmdXNpb24va25vd2xlZGdlYmFzZS9pbmRleC5jZm0/aWQ9NmEyNTNiNzVcblx0Ki9cblx0ZnVuY3Rpb24gc2hvd0V4cHJlc3NJbnN0YWxsKGF0dCwgcGFyLCByZXBsYWNlRWxlbUlkU3RyLCBjYWxsYmFja0ZuKSB7XG5cdFx0aXNFeHByZXNzSW5zdGFsbEFjdGl2ZSA9IHRydWU7XG5cdFx0c3RvcmVkQ2FsbGJhY2tGbiA9IGNhbGxiYWNrRm4gfHwgbnVsbDtcblx0XHRzdG9yZWRDYWxsYmFja09iaiA9IHtzdWNjZXNzOmZhbHNlLCBpZDpyZXBsYWNlRWxlbUlkU3RyfTtcblx0XHR2YXIgb2JqID0gZ2V0RWxlbWVudEJ5SWQocmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0aWYgKG9iaikge1xuXHRcdFx0aWYgKG9iai5ub2RlTmFtZSA9PSBcIk9CSkVDVFwiKSB7IC8vIHN0YXRpYyBwdWJsaXNoaW5nXG5cdFx0XHRcdHN0b3JlZEFsdENvbnRlbnQgPSBhYnN0cmFjdEFsdENvbnRlbnQob2JqKTtcblx0XHRcdFx0c3RvcmVkQWx0Q29udGVudElkID0gbnVsbDtcblx0XHRcdH1cblx0XHRcdGVsc2UgeyAvLyBkeW5hbWljIHB1Ymxpc2hpbmdcblx0XHRcdFx0c3RvcmVkQWx0Q29udGVudCA9IG9iajtcblx0XHRcdFx0c3RvcmVkQWx0Q29udGVudElkID0gcmVwbGFjZUVsZW1JZFN0cjtcblx0XHRcdH1cblx0XHRcdGF0dC5pZCA9IEVYUFJFU1NfSU5TVEFMTF9JRDtcblx0XHRcdGlmICh0eXBlb2YgYXR0LndpZHRoID09IFVOREVGIHx8ICghLyUkLy50ZXN0KGF0dC53aWR0aCkgJiYgcGFyc2VJbnQoYXR0LndpZHRoLCAxMCkgPCAzMTApKSB7IGF0dC53aWR0aCA9IFwiMzEwXCI7IH1cblx0XHRcdGlmICh0eXBlb2YgYXR0LmhlaWdodCA9PSBVTkRFRiB8fCAoIS8lJC8udGVzdChhdHQuaGVpZ2h0KSAmJiBwYXJzZUludChhdHQuaGVpZ2h0LCAxMCkgPCAxMzcpKSB7IGF0dC5oZWlnaHQgPSBcIjEzN1wiOyB9XG5cdFx0XHRkb2MudGl0bGUgPSBkb2MudGl0bGUuc2xpY2UoMCwgNDcpICsgXCIgLSBGbGFzaCBQbGF5ZXIgSW5zdGFsbGF0aW9uXCI7XG5cdFx0XHR2YXIgcHQgPSB1YS5pZSAmJiB1YS53aW4gPyBcIkFjdGl2ZVhcIiA6IFwiUGx1Z0luXCIsXG5cdFx0XHRcdGZ2ID0gXCJNTXJlZGlyZWN0VVJMPVwiICsgd2luLmxvY2F0aW9uLnRvU3RyaW5nKCkucmVwbGFjZSgvJi9nLFwiJTI2XCIpICsgXCImTU1wbGF5ZXJUeXBlPVwiICsgcHQgKyBcIiZNTWRvY3RpdGxlPVwiICsgZG9jLnRpdGxlO1xuXHRcdFx0aWYgKHR5cGVvZiBwYXIuZmxhc2h2YXJzICE9IFVOREVGKSB7XG5cdFx0XHRcdHBhci5mbGFzaHZhcnMgKz0gXCImXCIgKyBmdjtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRwYXIuZmxhc2h2YXJzID0gZnY7XG5cdFx0XHR9XG5cdFx0XHQvLyBJRSBvbmx5OiB3aGVuIGEgU1dGIGlzIGxvYWRpbmcgKEFORDogbm90IGF2YWlsYWJsZSBpbiBjYWNoZSkgd2FpdCBmb3IgdGhlIHJlYWR5U3RhdGUgb2YgdGhlIG9iamVjdCBlbGVtZW50IHRvIGJlY29tZSA0IGJlZm9yZSByZW1vdmluZyBpdCxcblx0XHRcdC8vIGJlY2F1c2UgeW91IGNhbm5vdCBwcm9wZXJseSBjYW5jZWwgYSBsb2FkaW5nIFNXRiBmaWxlIHdpdGhvdXQgYnJlYWtpbmcgYnJvd3NlciBsb2FkIHJlZmVyZW5jZXMsIGFsc28gb2JqLm9ucmVhZHlzdGF0ZWNoYW5nZSBkb2Vzbid0IHdvcmtcblx0XHRcdGlmICh1YS5pZSAmJiB1YS53aW4gJiYgb2JqLnJlYWR5U3RhdGUgIT0gNCkge1xuXHRcdFx0XHR2YXIgbmV3T2JqID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRcdFx0cmVwbGFjZUVsZW1JZFN0ciArPSBcIlNXRk9iamVjdE5ld1wiO1xuXHRcdFx0XHRuZXdPYmouc2V0QXR0cmlidXRlKFwiaWRcIiwgcmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0XHRcdG9iai5wYXJlbnROb2RlLmluc2VydEJlZm9yZShuZXdPYmosIG9iaik7IC8vIGluc2VydCBwbGFjZWhvbGRlciBkaXYgdGhhdCB3aWxsIGJlIHJlcGxhY2VkIGJ5IHRoZSBvYmplY3QgZWxlbWVudCB0aGF0IGxvYWRzIGV4cHJlc3NpbnN0YWxsLnN3ZlxuXHRcdFx0XHRvYmouc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXHRcdFx0XHQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHRpZiAob2JqLnJlYWR5U3RhdGUgPT0gNCkge1xuXHRcdFx0XHRcdFx0b2JqLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQob2JqKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsIDEwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHR9XG5cdFx0XHRjcmVhdGVTV0YoYXR0LCBwYXIsIHJlcGxhY2VFbGVtSWRTdHIpO1xuXHRcdH1cblx0fVxuXHQvKiBGdW5jdGlvbnMgdG8gYWJzdHJhY3QgYW5kIGRpc3BsYXkgYWx0ZXJuYXRpdmUgY29udGVudFxuXHQqL1xuXHRmdW5jdGlvbiBkaXNwbGF5QWx0Q29udGVudChvYmopIHtcblx0XHRpZiAodWEuaWUgJiYgdWEud2luICYmIG9iai5yZWFkeVN0YXRlICE9IDQpIHtcblx0XHRcdC8vIElFIG9ubHk6IHdoZW4gYSBTV0YgaXMgbG9hZGluZyAoQU5EOiBub3QgYXZhaWxhYmxlIGluIGNhY2hlKSB3YWl0IGZvciB0aGUgcmVhZHlTdGF0ZSBvZiB0aGUgb2JqZWN0IGVsZW1lbnQgdG8gYmVjb21lIDQgYmVmb3JlIHJlbW92aW5nIGl0LFxuXHRcdFx0Ly8gYmVjYXVzZSB5b3UgY2Fubm90IHByb3Blcmx5IGNhbmNlbCBhIGxvYWRpbmcgU1dGIGZpbGUgd2l0aG91dCBicmVha2luZyBicm93c2VyIGxvYWQgcmVmZXJlbmNlcywgYWxzbyBvYmoub25yZWFkeXN0YXRlY2hhbmdlIGRvZXNuJ3Qgd29ya1xuXHRcdFx0dmFyIGVsID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRcdG9iai5wYXJlbnROb2RlLmluc2VydEJlZm9yZShlbCwgb2JqKTsgLy8gaW5zZXJ0IHBsYWNlaG9sZGVyIGRpdiB0aGF0IHdpbGwgYmUgcmVwbGFjZWQgYnkgdGhlIGFsdGVybmF0aXZlIGNvbnRlbnRcblx0XHRcdGVsLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGFic3RyYWN0QWx0Q29udGVudChvYmopLCBlbCk7XG5cdFx0XHRvYmouc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXHRcdFx0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdGlmIChvYmoucmVhZHlTdGF0ZSA9PSA0KSB7XG5cdFx0XHRcdFx0b2JqLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQob2JqKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsIDEwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRvYmoucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoYWJzdHJhY3RBbHRDb250ZW50KG9iaiksIG9iaik7XG5cdFx0fVxuXHR9XG5cdGZ1bmN0aW9uIGFic3RyYWN0QWx0Q29udGVudChvYmopIHtcblx0XHR2YXIgYWMgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHRcdGlmICh1YS53aW4gJiYgdWEuaWUpIHtcblx0XHRcdGFjLmlubmVySFRNTCA9IG9iai5pbm5lckhUTUw7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0dmFyIG5lc3RlZE9iaiA9IG9iai5nZXRFbGVtZW50c0J5VGFnTmFtZShPQkpFQ1QpWzBdO1xuXHRcdFx0aWYgKG5lc3RlZE9iaikge1xuXHRcdFx0XHR2YXIgYyA9IG5lc3RlZE9iai5jaGlsZE5vZGVzO1xuXHRcdFx0XHRpZiAoYykge1xuXHRcdFx0XHRcdHZhciBjbCA9IGMubGVuZ3RoO1xuXHRcdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgY2w7IGkrKykge1xuXHRcdFx0XHRcdFx0aWYgKCEoY1tpXS5ub2RlVHlwZSA9PSAxICYmIGNbaV0ubm9kZU5hbWUgPT0gXCJQQVJBTVwiKSAmJiAhKGNbaV0ubm9kZVR5cGUgPT0gOCkpIHtcblx0XHRcdFx0XHRcdFx0YWMuYXBwZW5kQ2hpbGQoY1tpXS5jbG9uZU5vZGUodHJ1ZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYWM7XG5cdH1cblx0LyogQ3Jvc3MtYnJvd3NlciBkeW5hbWljIFNXRiBjcmVhdGlvblxuXHQqL1xuXHRmdW5jdGlvbiBjcmVhdGVTV0YoYXR0T2JqLCBwYXJPYmosIGlkKSB7XG5cdFx0dmFyIHIsIGVsID0gZ2V0RWxlbWVudEJ5SWQoaWQpO1xuXHRcdGlmICh1YS53ayAmJiB1YS53ayA8IDMxMikgeyByZXR1cm4gcjsgfVxuXHRcdGlmIChlbCkge1xuXHRcdFx0aWYgKHR5cGVvZiBhdHRPYmouaWQgPT0gVU5ERUYpIHsgLy8gaWYgbm8gJ2lkJyBpcyBkZWZpbmVkIGZvciB0aGUgb2JqZWN0IGVsZW1lbnQsIGl0IHdpbGwgaW5oZXJpdCB0aGUgJ2lkJyBmcm9tIHRoZSBhbHRlcm5hdGl2ZSBjb250ZW50XG5cdFx0XHRcdGF0dE9iai5pZCA9IGlkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVhLmllICYmIHVhLndpbikgeyAvLyBJbnRlcm5ldCBFeHBsb3JlciArIHRoZSBIVE1MIG9iamVjdCBlbGVtZW50ICsgVzNDIERPTSBtZXRob2RzIGRvIG5vdCBjb21iaW5lOiBmYWxsIGJhY2sgdG8gb3V0ZXJIVE1MXG5cdFx0XHRcdHZhciBhdHQgPSBcIlwiO1xuXHRcdFx0XHRmb3IgKHZhciBpIGluIGF0dE9iaikge1xuXHRcdFx0XHRcdGlmIChhdHRPYmpbaV0gIT0gT2JqZWN0LnByb3RvdHlwZVtpXSkgeyAvLyBmaWx0ZXIgb3V0IHByb3RvdHlwZSBhZGRpdGlvbnMgZnJvbSBvdGhlciBwb3RlbnRpYWwgbGlicmFyaWVzXG5cdFx0XHRcdFx0XHRpZiAoaS50b0xvd2VyQ2FzZSgpID09IFwiZGF0YVwiKSB7XG5cdFx0XHRcdFx0XHRcdHBhck9iai5tb3ZpZSA9IGF0dE9ialtpXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKGkudG9Mb3dlckNhc2UoKSA9PSBcInN0eWxlY2xhc3NcIikgeyAvLyAnY2xhc3MnIGlzIGFuIEVDTUE0IHJlc2VydmVkIGtleXdvcmRcblx0XHRcdFx0XHRcdFx0YXR0ICs9ICcgY2xhc3M9XCInICsgYXR0T2JqW2ldICsgJ1wiJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKGkudG9Mb3dlckNhc2UoKSAhPSBcImNsYXNzaWRcIikge1xuXHRcdFx0XHRcdFx0XHRhdHQgKz0gJyAnICsgaSArICc9XCInICsgYXR0T2JqW2ldICsgJ1wiJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dmFyIHBhciA9IFwiXCI7XG5cdFx0XHRcdGZvciAodmFyIGogaW4gcGFyT2JqKSB7XG5cdFx0XHRcdFx0aWYgKHBhck9ialtqXSAhPSBPYmplY3QucHJvdG90eXBlW2pdKSB7IC8vIGZpbHRlciBvdXQgcHJvdG90eXBlIGFkZGl0aW9ucyBmcm9tIG90aGVyIHBvdGVudGlhbCBsaWJyYXJpZXNcblx0XHRcdFx0XHRcdHBhciArPSAnPHBhcmFtIG5hbWU9XCInICsgaiArICdcIiB2YWx1ZT1cIicgKyBwYXJPYmpbal0gKyAnXCIgLz4nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlbC5vdXRlckhUTUwgPSAnPG9iamVjdCBjbGFzc2lkPVwiY2xzaWQ6RDI3Q0RCNkUtQUU2RC0xMWNmLTk2QjgtNDQ0NTUzNTQwMDAwXCInICsgYXR0ICsgJz4nICsgcGFyICsgJzwvb2JqZWN0Pic7XG5cdFx0XHRcdG9iaklkQXJyW29iaklkQXJyLmxlbmd0aF0gPSBhdHRPYmouaWQ7IC8vIHN0b3JlZCB0byBmaXggb2JqZWN0ICdsZWFrcycgb24gdW5sb2FkIChkeW5hbWljIHB1Ymxpc2hpbmcgb25seSlcblx0XHRcdFx0ciA9IGdldEVsZW1lbnRCeUlkKGF0dE9iai5pZCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHsgLy8gd2VsbC1iZWhhdmluZyBicm93c2Vyc1xuXHRcdFx0XHR2YXIgbyA9IGNyZWF0ZUVsZW1lbnQoT0JKRUNUKTtcblx0XHRcdFx0by5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIEZMQVNIX01JTUVfVFlQRSk7XG5cdFx0XHRcdGZvciAodmFyIG0gaW4gYXR0T2JqKSB7XG5cdFx0XHRcdFx0aWYgKGF0dE9ialttXSAhPSBPYmplY3QucHJvdG90eXBlW21dKSB7IC8vIGZpbHRlciBvdXQgcHJvdG90eXBlIGFkZGl0aW9ucyBmcm9tIG90aGVyIHBvdGVudGlhbCBsaWJyYXJpZXNcblx0XHRcdFx0XHRcdGlmIChtLnRvTG93ZXJDYXNlKCkgPT0gXCJzdHlsZWNsYXNzXCIpIHsgLy8gJ2NsYXNzJyBpcyBhbiBFQ01BNCByZXNlcnZlZCBrZXl3b3JkXG5cdFx0XHRcdFx0XHRcdG8uc2V0QXR0cmlidXRlKFwiY2xhc3NcIiwgYXR0T2JqW21dKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKG0udG9Mb3dlckNhc2UoKSAhPSBcImNsYXNzaWRcIikgeyAvLyBmaWx0ZXIgb3V0IElFIHNwZWNpZmljIGF0dHJpYnV0ZVxuXHRcdFx0XHRcdFx0XHRvLnNldEF0dHJpYnV0ZShtLCBhdHRPYmpbbV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKHZhciBuIGluIHBhck9iaikge1xuXHRcdFx0XHRcdGlmIChwYXJPYmpbbl0gIT0gT2JqZWN0LnByb3RvdHlwZVtuXSAmJiBuLnRvTG93ZXJDYXNlKCkgIT0gXCJtb3ZpZVwiKSB7IC8vIGZpbHRlciBvdXQgcHJvdG90eXBlIGFkZGl0aW9ucyBmcm9tIG90aGVyIHBvdGVudGlhbCBsaWJyYXJpZXMgYW5kIElFIHNwZWNpZmljIHBhcmFtIGVsZW1lbnRcblx0XHRcdFx0XHRcdGNyZWF0ZU9ialBhcmFtKG8sIG4sIHBhck9ialtuXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVsLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKG8sIGVsKTtcblx0XHRcdFx0ciA9IG87XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cdGZ1bmN0aW9uIGNyZWF0ZU9ialBhcmFtKGVsLCBwTmFtZSwgcFZhbHVlKSB7XG5cdFx0dmFyIHAgPSBjcmVhdGVFbGVtZW50KFwicGFyYW1cIik7XG5cdFx0cC5zZXRBdHRyaWJ1dGUoXCJuYW1lXCIsIHBOYW1lKTtcblx0XHRwLnNldEF0dHJpYnV0ZShcInZhbHVlXCIsIHBWYWx1ZSk7XG5cdFx0ZWwuYXBwZW5kQ2hpbGQocCk7XG5cdH1cblx0LyogQ3Jvc3MtYnJvd3NlciBTV0YgcmVtb3ZhbFxuXHRcdC0gRXNwZWNpYWxseSBuZWVkZWQgdG8gc2FmZWx5IGFuZCBjb21wbGV0ZWx5IHJlbW92ZSBhIFNXRiBpbiBJbnRlcm5ldCBFeHBsb3JlclxuXHQqL1xuXHRmdW5jdGlvbiByZW1vdmVTV0YoaWQpIHtcblx0XHR2YXIgb2JqID0gZ2V0RWxlbWVudEJ5SWQoaWQpO1xuXHRcdGlmIChvYmogJiYgb2JqLm5vZGVOYW1lID09IFwiT0JKRUNUXCIpIHtcblx0XHRcdGlmICh1YS5pZSAmJiB1YS53aW4pIHtcblx0XHRcdFx0b2JqLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblx0XHRcdFx0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0aWYgKG9iai5yZWFkeVN0YXRlID09IDQpIHtcblx0XHRcdFx0XHRcdHJlbW92ZU9iamVjdEluSUUoaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwgMTApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRvYmoucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChvYmopO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRmdW5jdGlvbiByZW1vdmVPYmplY3RJbklFKGlkKSB7XG5cdFx0dmFyIG9iaiA9IGdldEVsZW1lbnRCeUlkKGlkKTtcblx0XHRpZiAob2JqKSB7XG5cdFx0XHRmb3IgKHZhciBpIGluIG9iaikge1xuXHRcdFx0XHRpZiAodHlwZW9mIG9ialtpXSA9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0XHRvYmpbaV0gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRvYmoucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChvYmopO1xuXHRcdH1cblx0fVxuXHQvKiBGdW5jdGlvbnMgdG8gb3B0aW1pemUgSmF2YVNjcmlwdCBjb21wcmVzc2lvblxuXHQqL1xuXHRmdW5jdGlvbiBnZXRFbGVtZW50QnlJZChpZCkge1xuXHRcdHZhciBlbCA9IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdGVsID0gZG9jLmdldEVsZW1lbnRCeUlkKGlkKTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGUpIHt9XG5cdFx0cmV0dXJuIGVsO1xuXHR9XG5cdGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQoZWwpIHtcblx0XHRyZXR1cm4gZG9jLmNyZWF0ZUVsZW1lbnQoZWwpO1xuXHR9XG5cdC8qIFVwZGF0ZWQgYXR0YWNoRXZlbnQgZnVuY3Rpb24gZm9yIEludGVybmV0IEV4cGxvcmVyXG5cdFx0LSBTdG9yZXMgYXR0YWNoRXZlbnQgaW5mb3JtYXRpb24gaW4gYW4gQXJyYXksIHNvIG9uIHVubG9hZCB0aGUgZGV0YWNoRXZlbnQgZnVuY3Rpb25zIGNhbiBiZSBjYWxsZWQgdG8gYXZvaWQgbWVtb3J5IGxlYWtzXG5cdCovXG5cdGZ1bmN0aW9uIGFkZExpc3RlbmVyKHRhcmdldCwgZXZlbnRUeXBlLCBmbikge1xuXHRcdHRhcmdldC5hdHRhY2hFdmVudChldmVudFR5cGUsIGZuKTtcblx0XHRsaXN0ZW5lcnNBcnJbbGlzdGVuZXJzQXJyLmxlbmd0aF0gPSBbdGFyZ2V0LCBldmVudFR5cGUsIGZuXTtcblx0fVxuXHQvKiBGbGFzaCBQbGF5ZXIgYW5kIFNXRiBjb250ZW50IHZlcnNpb24gbWF0Y2hpbmdcblx0Ki9cblx0ZnVuY3Rpb24gaGFzUGxheWVyVmVyc2lvbihydikge1xuXHRcdHZhciBwdiA9IHVhLnB2LCB2ID0gcnYuc3BsaXQoXCIuXCIpO1xuXHRcdHZbMF0gPSBwYXJzZUludCh2WzBdLCAxMCk7XG5cdFx0dlsxXSA9IHBhcnNlSW50KHZbMV0sIDEwKSB8fCAwOyAvLyBzdXBwb3J0cyBzaG9ydCBub3RhdGlvbiwgZS5nLiBcIjlcIiBpbnN0ZWFkIG9mIFwiOS4wLjBcIlxuXHRcdHZbMl0gPSBwYXJzZUludCh2WzJdLCAxMCkgfHwgMDtcblx0XHRyZXR1cm4gKHB2WzBdID4gdlswXSB8fCAocHZbMF0gPT0gdlswXSAmJiBwdlsxXSA+IHZbMV0pIHx8IChwdlswXSA9PSB2WzBdICYmIHB2WzFdID09IHZbMV0gJiYgcHZbMl0gPj0gdlsyXSkpID8gdHJ1ZSA6IGZhbHNlO1xuXHR9XG5cdC8qIENyb3NzLWJyb3dzZXIgZHluYW1pYyBDU1MgY3JlYXRpb25cblx0XHQtIEJhc2VkIG9uIEJvYmJ5IHZhbiBkZXIgU2x1aXMnIHNvbHV0aW9uOiBodHRwOi8vd3d3LmJvYmJ5dmFuZGVyc2x1aXMuY29tL2FydGljbGVzL2R5bmFtaWNDU1MucGhwXG5cdCovXG5cdGZ1bmN0aW9uIGNyZWF0ZUNTUyhzZWwsIGRlY2wsIG1lZGlhLCBuZXdTdHlsZSkge1xuXHRcdGlmICh1YS5pZSAmJiB1YS5tYWMpIHsgcmV0dXJuOyB9XG5cdFx0dmFyIGggPSBkb2MuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJoZWFkXCIpWzBdO1xuXHRcdGlmICghaCkgeyByZXR1cm47IH0gLy8gdG8gYWxzbyBzdXBwb3J0IGJhZGx5IGF1dGhvcmVkIEhUTUwgcGFnZXMgdGhhdCBsYWNrIGEgaGVhZCBlbGVtZW50XG5cdFx0dmFyIG0gPSAobWVkaWEgJiYgdHlwZW9mIG1lZGlhID09IFwic3RyaW5nXCIpID8gbWVkaWEgOiBcInNjcmVlblwiO1xuXHRcdGlmIChuZXdTdHlsZSkge1xuXHRcdFx0ZHluYW1pY1N0eWxlc2hlZXQgPSBudWxsO1xuXHRcdFx0ZHluYW1pY1N0eWxlc2hlZXRNZWRpYSA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICghZHluYW1pY1N0eWxlc2hlZXQgfHwgZHluYW1pY1N0eWxlc2hlZXRNZWRpYSAhPSBtKSB7XG5cdFx0XHQvLyBjcmVhdGUgZHluYW1pYyBzdHlsZXNoZWV0ICsgZ2V0IGEgZ2xvYmFsIHJlZmVyZW5jZSB0byBpdFxuXHRcdFx0dmFyIHMgPSBjcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG5cdFx0XHRzLnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L2Nzc1wiKTtcblx0XHRcdHMuc2V0QXR0cmlidXRlKFwibWVkaWFcIiwgbSk7XG5cdFx0XHRkeW5hbWljU3R5bGVzaGVldCA9IGguYXBwZW5kQ2hpbGQocyk7XG5cdFx0XHRpZiAodWEuaWUgJiYgdWEud2luICYmIHR5cGVvZiBkb2Muc3R5bGVTaGVldHMgIT0gVU5ERUYgJiYgZG9jLnN0eWxlU2hlZXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZHluYW1pY1N0eWxlc2hlZXQgPSBkb2Muc3R5bGVTaGVldHNbZG9jLnN0eWxlU2hlZXRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0fVxuXHRcdFx0ZHluYW1pY1N0eWxlc2hlZXRNZWRpYSA9IG07XG5cdFx0fVxuXHRcdC8vIGFkZCBzdHlsZSBydWxlXG5cdFx0aWYgKHVhLmllICYmIHVhLndpbikge1xuXHRcdFx0aWYgKGR5bmFtaWNTdHlsZXNoZWV0ICYmIHR5cGVvZiBkeW5hbWljU3R5bGVzaGVldC5hZGRSdWxlID09IE9CSkVDVCkge1xuXHRcdFx0XHRkeW5hbWljU3R5bGVzaGVldC5hZGRSdWxlKHNlbCwgZGVjbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKGR5bmFtaWNTdHlsZXNoZWV0ICYmIHR5cGVvZiBkb2MuY3JlYXRlVGV4dE5vZGUgIT0gVU5ERUYpIHtcblx0XHRcdFx0ZHluYW1pY1N0eWxlc2hlZXQuYXBwZW5kQ2hpbGQoZG9jLmNyZWF0ZVRleHROb2RlKHNlbCArIFwiIHtcIiArIGRlY2wgKyBcIn1cIikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRmdW5jdGlvbiBzZXRWaXNpYmlsaXR5KGlkLCBpc1Zpc2libGUpIHtcblx0XHRpZiAoIWF1dG9IaWRlU2hvdykgeyByZXR1cm47IH1cblx0XHR2YXIgdiA9IGlzVmlzaWJsZSA/IFwidmlzaWJsZVwiIDogXCJoaWRkZW5cIjtcblx0XHRpZiAoaXNEb21Mb2FkZWQgJiYgZ2V0RWxlbWVudEJ5SWQoaWQpKSB7XG5cdFx0XHRnZXRFbGVtZW50QnlJZChpZCkuc3R5bGUudmlzaWJpbGl0eSA9IHY7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Y3JlYXRlQ1NTKFwiI1wiICsgaWQsIFwidmlzaWJpbGl0eTpcIiArIHYpO1xuXHRcdH1cblx0fVxuXHQvKiBGaWx0ZXIgdG8gYXZvaWQgWFNTIGF0dGFja3Ncblx0Ki9cblx0ZnVuY3Rpb24gdXJsRW5jb2RlSWZOZWNlc3Nhcnkocykge1xuXHRcdHZhciByZWdleCA9IC9bXFxcXFxcXCI8PlxcLjtdLztcblx0XHR2YXIgaGFzQmFkQ2hhcnMgPSByZWdleC5leGVjKHMpICE9IG51bGw7XG5cdFx0cmV0dXJuIGhhc0JhZENoYXJzICYmIHR5cGVvZiBlbmNvZGVVUklDb21wb25lbnQgIT0gVU5ERUYgPyBlbmNvZGVVUklDb21wb25lbnQocykgOiBzO1xuXHR9XG5cdC8qIFJlbGVhc2UgbWVtb3J5IHRvIGF2b2lkIG1lbW9yeSBsZWFrcyBjYXVzZWQgYnkgY2xvc3VyZXMsIGZpeCBoYW5naW5nIGF1ZGlvL3ZpZGVvIHRocmVhZHMgYW5kIGZvcmNlIG9wZW4gc29ja2V0cy9OZXRDb25uZWN0aW9ucyB0byBkaXNjb25uZWN0IChJbnRlcm5ldCBFeHBsb3JlciBvbmx5KVxuXHQqL1xuXHR2YXIgY2xlYW51cCA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh1YS5pZSAmJiB1YS53aW4pIHtcblx0XHRcdHdpbmRvdy5hdHRhY2hFdmVudChcIm9udW5sb2FkXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyByZW1vdmUgbGlzdGVuZXJzIHRvIGF2b2lkIG1lbW9yeSBsZWFrc1xuXHRcdFx0XHR2YXIgbGwgPSBsaXN0ZW5lcnNBcnIubGVuZ3RoO1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGxsOyBpKyspIHtcblx0XHRcdFx0XHRsaXN0ZW5lcnNBcnJbaV1bMF0uZGV0YWNoRXZlbnQobGlzdGVuZXJzQXJyW2ldWzFdLCBsaXN0ZW5lcnNBcnJbaV1bMl0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGNsZWFudXAgZHluYW1pY2FsbHkgZW1iZWRkZWQgb2JqZWN0cyB0byBmaXggYXVkaW8vdmlkZW8gdGhyZWFkcyBhbmQgZm9yY2Ugb3BlbiBzb2NrZXRzIGFuZCBOZXRDb25uZWN0aW9ucyB0byBkaXNjb25uZWN0XG5cdFx0XHRcdHZhciBpbCA9IG9iaklkQXJyLmxlbmd0aDtcblx0XHRcdFx0Zm9yICh2YXIgaiA9IDA7IGogPCBpbDsgaisrKSB7XG5cdFx0XHRcdFx0cmVtb3ZlU1dGKG9iaklkQXJyW2pdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBjbGVhbnVwIGxpYnJhcnkncyBtYWluIGNsb3N1cmVzIHRvIGF2b2lkIG1lbW9yeSBsZWFrc1xuXHRcdFx0XHRmb3IgKHZhciBrIGluIHVhKSB7XG5cdFx0XHRcdFx0dWFba10gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVhID0gbnVsbDtcblx0XHRcdFx0Zm9yICh2YXIgbCBpbiBzd2ZvYmplY3QpIHtcblx0XHRcdFx0XHRzd2ZvYmplY3RbbF0gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN3Zm9iamVjdCA9IG51bGw7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0oKTtcblx0cmV0dXJuIHtcblx0XHQvKiBQdWJsaWMgQVBJXG5cdFx0XHQtIFJlZmVyZW5jZTogaHR0cDovL2NvZGUuZ29vZ2xlLmNvbS9wL3N3Zm9iamVjdC93aWtpL2RvY3VtZW50YXRpb25cblx0XHQqL1xuXHRcdHJlZ2lzdGVyT2JqZWN0OiBmdW5jdGlvbihvYmplY3RJZFN0ciwgc3dmVmVyc2lvblN0ciwgeGlTd2ZVcmxTdHIsIGNhbGxiYWNrRm4pIHtcblx0XHRcdGlmICh1YS53MyAmJiBvYmplY3RJZFN0ciAmJiBzd2ZWZXJzaW9uU3RyKSB7XG5cdFx0XHRcdHZhciByZWdPYmogPSB7fTtcblx0XHRcdFx0cmVnT2JqLmlkID0gb2JqZWN0SWRTdHI7XG5cdFx0XHRcdHJlZ09iai5zd2ZWZXJzaW9uID0gc3dmVmVyc2lvblN0cjtcblx0XHRcdFx0cmVnT2JqLmV4cHJlc3NJbnN0YWxsID0geGlTd2ZVcmxTdHI7XG5cdFx0XHRcdHJlZ09iai5jYWxsYmFja0ZuID0gY2FsbGJhY2tGbjtcblx0XHRcdFx0cmVnT2JqQXJyW3JlZ09iakFyci5sZW5ndGhdID0gcmVnT2JqO1xuXHRcdFx0XHRzZXRWaXNpYmlsaXR5KG9iamVjdElkU3RyLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChjYWxsYmFja0ZuKSB7XG5cdFx0XHRcdGNhbGxiYWNrRm4oe3N1Y2Nlc3M6ZmFsc2UsIGlkOm9iamVjdElkU3RyfSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRnZXRPYmplY3RCeUlkOiBmdW5jdGlvbihvYmplY3RJZFN0cikge1xuXHRcdFx0aWYgKHVhLnczKSB7XG5cdFx0XHRcdHJldHVybiBnZXRPYmplY3RCeUlkKG9iamVjdElkU3RyKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGVtYmVkU1dGOiBmdW5jdGlvbihzd2ZVcmxTdHIsIHJlcGxhY2VFbGVtSWRTdHIsIHdpZHRoU3RyLCBoZWlnaHRTdHIsIHN3ZlZlcnNpb25TdHIsIHhpU3dmVXJsU3RyLCBmbGFzaHZhcnNPYmosIHBhck9iaiwgYXR0T2JqLCBjYWxsYmFja0ZuKSB7XG5cdFx0XHR2YXIgY2FsbGJhY2tPYmogPSB7c3VjY2VzczpmYWxzZSwgaWQ6cmVwbGFjZUVsZW1JZFN0cn07XG5cdFx0XHRpZiAodWEudzMgJiYgISh1YS53ayAmJiB1YS53ayA8IDMxMikgJiYgc3dmVXJsU3RyICYmIHJlcGxhY2VFbGVtSWRTdHIgJiYgd2lkdGhTdHIgJiYgaGVpZ2h0U3RyICYmIHN3ZlZlcnNpb25TdHIpIHtcblx0XHRcdFx0c2V0VmlzaWJpbGl0eShyZXBsYWNlRWxlbUlkU3RyLCBmYWxzZSk7XG5cdFx0XHRcdGFkZERvbUxvYWRFdmVudChmdW5jdGlvbigpIHtcblx0XHRcdFx0XHR3aWR0aFN0ciArPSBcIlwiOyAvLyBhdXRvLWNvbnZlcnQgdG8gc3RyaW5nXG5cdFx0XHRcdFx0aGVpZ2h0U3RyICs9IFwiXCI7XG5cdFx0XHRcdFx0dmFyIGF0dCA9IHt9O1xuXHRcdFx0XHRcdGlmIChhdHRPYmogJiYgdHlwZW9mIGF0dE9iaiA9PT0gT0JKRUNUKSB7XG5cdFx0XHRcdFx0XHRmb3IgKHZhciBpIGluIGF0dE9iaikgeyAvLyBjb3B5IG9iamVjdCB0byBhdm9pZCB0aGUgdXNlIG9mIHJlZmVyZW5jZXMsIGJlY2F1c2Ugd2ViIGF1dGhvcnMgb2Z0ZW4gcmV1c2UgYXR0T2JqIGZvciBtdWx0aXBsZSBTV0ZzXG5cdFx0XHRcdFx0XHRcdGF0dFtpXSA9IGF0dE9ialtpXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXR0LmRhdGEgPSBzd2ZVcmxTdHI7XG5cdFx0XHRcdFx0YXR0LndpZHRoID0gd2lkdGhTdHI7XG5cdFx0XHRcdFx0YXR0LmhlaWdodCA9IGhlaWdodFN0cjtcblx0XHRcdFx0XHR2YXIgcGFyID0ge307XG5cdFx0XHRcdFx0aWYgKHBhck9iaiAmJiB0eXBlb2YgcGFyT2JqID09PSBPQkpFQ1QpIHtcblx0XHRcdFx0XHRcdGZvciAodmFyIGogaW4gcGFyT2JqKSB7IC8vIGNvcHkgb2JqZWN0IHRvIGF2b2lkIHRoZSB1c2Ugb2YgcmVmZXJlbmNlcywgYmVjYXVzZSB3ZWIgYXV0aG9ycyBvZnRlbiByZXVzZSBwYXJPYmogZm9yIG11bHRpcGxlIFNXRnNcblx0XHRcdFx0XHRcdFx0cGFyW2pdID0gcGFyT2JqW2pdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZmxhc2h2YXJzT2JqICYmIHR5cGVvZiBmbGFzaHZhcnNPYmogPT09IE9CSkVDVCkge1xuXHRcdFx0XHRcdFx0Zm9yICh2YXIgayBpbiBmbGFzaHZhcnNPYmopIHsgLy8gY29weSBvYmplY3QgdG8gYXZvaWQgdGhlIHVzZSBvZiByZWZlcmVuY2VzLCBiZWNhdXNlIHdlYiBhdXRob3JzIG9mdGVuIHJldXNlIGZsYXNodmFyc09iaiBmb3IgbXVsdGlwbGUgU1dGc1xuXHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIHBhci5mbGFzaHZhcnMgIT0gVU5ERUYpIHtcblx0XHRcdFx0XHRcdFx0XHRwYXIuZmxhc2h2YXJzICs9IFwiJlwiICsgayArIFwiPVwiICsgZmxhc2h2YXJzT2JqW2tdO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHBhci5mbGFzaHZhcnMgPSBrICsgXCI9XCIgKyBmbGFzaHZhcnNPYmpba107XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGhhc1BsYXllclZlcnNpb24oc3dmVmVyc2lvblN0cikpIHsgLy8gY3JlYXRlIFNXRlxuXHRcdFx0XHRcdFx0dmFyIG9iaiA9IGNyZWF0ZVNXRihhdHQsIHBhciwgcmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0XHRcdFx0XHRpZiAoYXR0LmlkID09IHJlcGxhY2VFbGVtSWRTdHIpIHtcblx0XHRcdFx0XHRcdFx0c2V0VmlzaWJpbGl0eShyZXBsYWNlRWxlbUlkU3RyLCB0cnVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhbGxiYWNrT2JqLnN1Y2Nlc3MgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2tPYmoucmVmID0gb2JqO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIGlmICh4aVN3ZlVybFN0ciAmJiBjYW5FeHByZXNzSW5zdGFsbCgpKSB7IC8vIHNob3cgQWRvYmUgRXhwcmVzcyBJbnN0YWxsXG5cdFx0XHRcdFx0XHRhdHQuZGF0YSA9IHhpU3dmVXJsU3RyO1xuXHRcdFx0XHRcdFx0c2hvd0V4cHJlc3NJbnN0YWxsKGF0dCwgcGFyLCByZXBsYWNlRWxlbUlkU3RyLCBjYWxsYmFja0ZuKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7IC8vIHNob3cgYWx0ZXJuYXRpdmUgY29udGVudFxuXHRcdFx0XHRcdFx0c2V0VmlzaWJpbGl0eShyZXBsYWNlRWxlbUlkU3RyLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNhbGxiYWNrRm4pIHsgY2FsbGJhY2tGbihjYWxsYmFja09iaik7IH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChjYWxsYmFja0ZuKSB7IGNhbGxiYWNrRm4oY2FsbGJhY2tPYmopO1x0fVxuXHRcdH0sXG5cdFx0c3dpdGNoT2ZmQXV0b0hpZGVTaG93OiBmdW5jdGlvbigpIHtcblx0XHRcdGF1dG9IaWRlU2hvdyA9IGZhbHNlO1xuXHRcdH0sXG5cdFx0dWE6IHVhLFxuXHRcdGdldEZsYXNoUGxheWVyVmVyc2lvbjogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4geyBtYWpvcjp1YS5wdlswXSwgbWlub3I6dWEucHZbMV0sIHJlbGVhc2U6dWEucHZbMl0gfTtcblx0XHR9LFxuXHRcdGhhc0ZsYXNoUGxheWVyVmVyc2lvbjogaGFzUGxheWVyVmVyc2lvbixcblx0XHRjcmVhdGVTV0Y6IGZ1bmN0aW9uKGF0dE9iaiwgcGFyT2JqLCByZXBsYWNlRWxlbUlkU3RyKSB7XG5cdFx0XHRpZiAodWEudzMpIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZVNXRihhdHRPYmosIHBhck9iaiwgcmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHNob3dFeHByZXNzSW5zdGFsbDogZnVuY3Rpb24oYXR0LCBwYXIsIHJlcGxhY2VFbGVtSWRTdHIsIGNhbGxiYWNrRm4pIHtcblx0XHRcdGlmICh1YS53MyAmJiBjYW5FeHByZXNzSW5zdGFsbCgpKSB7XG5cdFx0XHRcdHNob3dFeHByZXNzSW5zdGFsbChhdHQsIHBhciwgcmVwbGFjZUVsZW1JZFN0ciwgY2FsbGJhY2tGbik7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZW1vdmVTV0Y6IGZ1bmN0aW9uKG9iakVsZW1JZFN0cikge1xuXHRcdFx0aWYgKHVhLnczKSB7XG5cdFx0XHRcdHJlbW92ZVNXRihvYmpFbGVtSWRTdHIpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y3JlYXRlQ1NTOiBmdW5jdGlvbihzZWxTdHIsIGRlY2xTdHIsIG1lZGlhU3RyLCBuZXdTdHlsZUJvb2xlYW4pIHtcblx0XHRcdGlmICh1YS53Mykge1xuXHRcdFx0XHRjcmVhdGVDU1Moc2VsU3RyLCBkZWNsU3RyLCBtZWRpYVN0ciwgbmV3U3R5bGVCb29sZWFuKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGFkZERvbUxvYWRFdmVudDogYWRkRG9tTG9hZEV2ZW50LFxuXHRcdGFkZExvYWRFdmVudDogYWRkTG9hZEV2ZW50LFxuXHRcdGdldFF1ZXJ5UGFyYW1WYWx1ZTogZnVuY3Rpb24ocGFyYW0pIHtcblx0XHRcdHZhciBxID0gZG9jLmxvY2F0aW9uLnNlYXJjaCB8fCBkb2MubG9jYXRpb24uaGFzaDtcblx0XHRcdGlmIChxKSB7XG5cdFx0XHRcdGlmICgvXFw/Ly50ZXN0KHEpKSB7IHEgPSBxLnNwbGl0KFwiP1wiKVsxXTsgfSAvLyBzdHJpcCBxdWVzdGlvbiBtYXJrXG5cdFx0XHRcdGlmIChwYXJhbSA9PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVybEVuY29kZUlmTmVjZXNzYXJ5KHEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZhciBwYWlycyA9IHEuc3BsaXQoXCImXCIpO1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHBhaXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKHBhaXJzW2ldLnN1YnN0cmluZygwLCBwYWlyc1tpXS5pbmRleE9mKFwiPVwiKSkgPT0gcGFyYW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiB1cmxFbmNvZGVJZk5lY2Vzc2FyeShwYWlyc1tpXS5zdWJzdHJpbmcoKHBhaXJzW2ldLmluZGV4T2YoXCI9XCIpICsgMSkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBcIlwiO1xuXHRcdH0sXG5cdFx0Ly8gRm9yIGludGVybmFsIHVzYWdlIG9ubHlcblx0XHRleHByZXNzSW5zdGFsbENhbGxiYWNrOiBmdW5jdGlvbigpIHtcblx0XHRcdGlmIChpc0V4cHJlc3NJbnN0YWxsQWN0aXZlKSB7XG5cdFx0XHRcdHZhciBvYmogPSBnZXRFbGVtZW50QnlJZChFWFBSRVNTX0lOU1RBTExfSUQpO1xuXHRcdFx0XHRpZiAob2JqICYmIHN0b3JlZEFsdENvbnRlbnQpIHtcblx0XHRcdFx0XHRvYmoucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoc3RvcmVkQWx0Q29udGVudCwgb2JqKTtcblx0XHRcdFx0XHRpZiAoc3RvcmVkQWx0Q29udGVudElkKSB7XG5cdFx0XHRcdFx0XHRzZXRWaXNpYmlsaXR5KHN0b3JlZEFsdENvbnRlbnRJZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRpZiAodWEuaWUgJiYgdWEud2luKSB7IHN0b3JlZEFsdENvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc3RvcmVkQ2FsbGJhY2tGbikgeyBzdG9yZWRDYWxsYmFja0ZuKHN0b3JlZENhbGxiYWNrT2JqKTsgfVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRXhwcmVzc0luc3RhbGxBY3RpdmUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG59KCk7XG5tb2R1bGUuZXhwb3J0cyA9IHN3Zm9iamVjdDtcbiIsIi8qKlxuICog0KHQvtC30LTQsNGR0YIg0Y3QutC30LXQvNC/0LvRj9GAINC60LvQsNGB0YHQsCwg0L3QviDQvdC1INC30LDQv9GD0YHQutCw0LXRgiDQtdCz0L4g0LrQvtC90YHRgtGA0YPQutGC0L7RgFxuICogQHBhcmFtIHtmdW5jdGlvbn0gT3JpZ2luYWxDbGFzcyAtINC60LvQsNGB0YFcbiAqIEByZXR1cm5zIHtPcmlnaW5hbENsYXNzfVxuICogQHByaXZhdGVcbiAqL1xudmFyIGNsZWFySW5zdGFuY2UgPSBmdW5jdGlvbihPcmlnaW5hbENsYXNzKSB7XG4gICAgdmFyIENsZWFyQ2xhc3MgPSBmdW5jdGlvbigpe307XG4gICAgQ2xlYXJDbGFzcy5wcm90b3R5cGUgPSBPcmlnaW5hbENsYXNzLnByb3RvdHlwZTtcbiAgICByZXR1cm4gbmV3IENsZWFyQ2xhc3MoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gY2xlYXJJbnN0YW5jZTtcbiIsInZhciBjbGVhckluc3RhbmNlID0gcmVxdWlyZSgnLi9jbGVhci1pbnN0YW5jZScpO1xuXG4vKipcbiAqIENsYXNzaWMgRXJyb3IgYWN0cyBsaWtlIGEgZmFicmljOiBFcnJvci5jYWxsKHRoaXMsIG1lc3NhZ2UpIGp1c3QgY3JlYXRlIG5ldyBvYmplY3QuXG4gKiBFcnJvckNsYXNzIGFjdHMgbW9yZSBsaWtlIGEgY2xhc3M6IEVycm9yQ2xhc3MuY2FsbCh0aGlzLCBtZXNzYWdlKSBtb2RpZnkgJ3RoaXMnIG9iamVjdC5cbiAqIEBwYXJhbSB7U3RyaW5nfSBbbWVzc2FnZV0gLSBlcnJvciBtZXNzYWdlXG4gKiBAcGFyYW0ge051bWJlcn0gW2lkXSAtIGVycm9yIGlkXG4gKiBAZXh0ZW5kcyBFcnJvclxuICogQGNvbnN0cnVjdG9yXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgRXJyb3JDbGFzcyA9IGZ1bmN0aW9uKG1lc3NhZ2UsIGlkKSB7XG4gICAgdmFyIGVyciA9IG5ldyBFcnJvcihtZXNzYWdlLCBpZCk7XG4gICAgZXJyLm5hbWUgPSB0aGlzLm5hbWU7XG5cbiAgICB0aGlzLm1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcbiAgICB0aGlzLnN0YWNrID0gZXJyLnN0YWNrO1xufTtcblxuLyoqXG4gKiBTdWdhci4gSnVzdCBjcmVhdGUgaW5oZXJpdGFuY2UgZnJvbSBFcnJvckNsYXNzIGFuZCBkZWZpbmUgbmFtZSBwcm9wZXJ0eVxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSBuYW1lIG9mIGVycm9yIHR5cGVcbiAqIEByZXR1cm5zIHtFcnJvckNsYXNzfVxuICovXG5FcnJvckNsYXNzLmNyZWF0ZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgZXJyQ2xhc3MgPSBjbGVhckluc3RhbmNlKEVycm9yQ2xhc3MpO1xuICAgIGVyckNsYXNzLm5hbWUgPSBuYW1lO1xuICAgIHJldHVybiBlcnJDbGFzcztcbn07XG5cbkVycm9yQ2xhc3MucHJvdG90eXBlID0gY2xlYXJJbnN0YW5jZShFcnJvcik7XG5FcnJvckNsYXNzLnByb3RvdHlwZS5uYW1lID0gXCJFcnJvckNsYXNzXCI7XG5cbm1vZHVsZS5leHBvcnRzID0gRXJyb3JDbGFzcztcbiIsInZhciBFdmVudHMgPSByZXF1aXJlKCcuLi9hc3luYy9ldmVudHMnKTtcblxuLyoqXG4gKiBAY2xhc3Mg0J/RgNC+0LrRgdC4LdC60LvQsNGB0YEuINCS0YvQtNCw0ZHRgiDQvdCw0YDRg9C20YMg0LvQuNGI0Ywg0L/Rg9Cx0LvQuNGH0L3Ri9C1INC80LXRgtC+0LTRiyDQvtCx0YrQtdC60YLQsCDQuCDRgdGC0LDRgtC40YfQtdGB0LrQuNC1INGB0LLQvtC50YHRgtCy0LAuXG4gKiDQndC1INC60L7Qv9C40YDRg9C10YIg0LzQtdGC0L7QtNGLINC40LcgT2JqZWN0LnByb3RvdHlwZS4g0JLRgdC1INC80LXRgtC+0LTRiyDQuNC80LXRjtGCINC/0YDQuNCy0Y/Qt9C60YMg0LrQvtC90YLQtdC60YHRgtCwINC6INC/0YDQvtC60YHQuNGA0YPQtdC80L7QvNGDINC+0LHRitC10LrRgtGDLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb2JqZWN0XSAtINC+0LHRitC10LrRgiwg0LrQvtGC0L7RgNGL0Lkg0YLRgNC10LHRg9C10YLRgdGPINC/0YDQvtC60YHQuNGA0L7QstCw0YLRjFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgUHJveHkgPSBmdW5jdGlvbihvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0KSB7XG4gICAgICAgIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcbiAgICAgICAgICAgIGlmIChrZXlbMF0gPT09IFwiX1wiXG4gICAgICAgICAgICAgICAgfHwgdHlwZW9mIG9iamVjdFtrZXldICE9PSBcImZ1bmN0aW9uXCJcbiAgICAgICAgICAgICAgICB8fCBvYmplY3Rba2V5XSA9PT0gT2JqZWN0LnByb3RvdHlwZVtrZXldXG4gICAgICAgICAgICAgICAgfHwgb2JqZWN0Lmhhc093blByb3BlcnR5KGtleSlcbiAgICAgICAgICAgICAgICB8fCBFdmVudHMucHJvdG90eXBlLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpc1trZXldID0gb2JqZWN0W2tleV0uYmluZChvYmplY3QpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9iamVjdC5waXBlRXZlbnRzKSB7XG4gICAgICAgICAgICBFdmVudHMuY2FsbCh0aGlzKTtcblxuICAgICAgICAgICAgdGhpcy5vbiA9IEV2ZW50cy5wcm90b3R5cGUub247XG4gICAgICAgICAgICB0aGlzLm9uY2UgPSBFdmVudHMucHJvdG90eXBlLm9uY2U7XG4gICAgICAgICAgICB0aGlzLm9mZiA9IEV2ZW50cy5wcm90b3R5cGUub2ZmO1xuICAgICAgICAgICAgdGhpcy5jbGVhckxpc3RlbmVycyA9IEV2ZW50cy5wcm90b3R5cGUuY2xlYXJMaXN0ZW5lcnM7XG5cbiAgICAgICAgICAgIG9iamVjdC5waXBlRXZlbnRzKHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuLyoqXG4gKiDQrdC60YHQv9C+0YDRgtC40YDRg9C10YIg0YHRgtCw0YLQuNGH0LXRgdC60LjQtSDRgdCy0L7QudGB0YLQstCwINC40Lcg0L7QtNC90L7Qs9C+INC+0LHRitC10LrRgtCwINCyINC00YDRg9Cz0L7QuSwg0LjRgdC60LvRjtGH0LDRjyDRg9C60LDQt9Cw0L3QvdGL0LUsINC/0YDQuNCy0LDRgtC90YvQtSDQuCDQv9GA0L7RgtC+0YLQuNC/XG4gKiBAcGFyYW0ge09iamVjdH0gZnJvbSAtINC+0YLQutGD0LTQsCDQutC+0L/QuNGA0L7QstCw0YLRjFxuICogQHBhcmFtIHtPYmplY3R9IHRvIC0g0LrRg9C00LAg0LrQvtC/0LjRgNC+0LLQsNGC0YxcbiAqIEBwYXJhbSB7QXJyYXkuPFN0cmluZz59IFtleGNsdWRlXSAtINGB0LLQvtC50YHRgtCy0LAg0LrQvtGC0L7RgNGL0LUg0YLRgNC10LHRg9C10YLRgdGPINC40YHQutC70Y7Rh9C40YLRjFxuICovXG5Qcm94eS5leHBvcnRTdGF0aWMgPSBmdW5jdGlvbihmcm9tLCB0bywgZXhjbHVkZSkge1xuICAgIGV4Y2x1ZGUgPSBleGNsdWRlIHx8IFtdO1xuXG4gICAgT2JqZWN0LmtleXMoZnJvbSkuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgaWYgKCFmcm9tLmhhc093blByb3BlcnR5KGtleSlcbiAgICAgICAgICAgIHx8IGtleVswXSA9PT0gXCJfXCJcbiAgICAgICAgICAgIHx8IGtleSA9PT0gXCJwcm90b3R5cGVcIlxuICAgICAgICAgICAgfHwgZXhjbHVkZS5pbmRleE9mKGtleSkgIT09IC0xKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0b1trZXldID0gZnJvbVtrZXldO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiDQodC+0LfQtNCw0L3QuNC1INC/0YDQvtC60YHQuC3Qv9C70LDRgdGB0LAg0L/RgNC40LLRj9C30LDQvdC90L7Qs9C+INC6INGD0LrQsNC30LDQvdC90L7QvNGDINC60LvQsNGB0YHRgy4g0JzQvtC20L3QviDQvdCw0LfQvdCw0YfQuNGC0Ywg0YDQvtC00LjRgtC10LvRjNGB0LrQuNC5INC60LvQsNGB0YEuXG4gKiDQoyDRgNC+0LTQuNGC0LXQu9GM0YHQutC+0LPQviDQutC70LDRgdGB0LAg0L/QvtGP0LLQu9GP0LXRgtGB0Y8g0L/RgNC40LLQsNGC0L3Ri9C5INC80LXRgtC+0LQgX3Byb3h5LCDQutC+0YLQvtGA0YvQuSDQstGL0LTQsNGR0YIg0L/RgNC+0LrRgdC4LdC+0LHRitC10LrRgiDQtNC70Y9cbiAqINC00LDQvdC90L7Qs9C+INGN0LrQt9C10LzQu9GP0YDQsC4g0KLQsNC60LbQtSDQv9C+0Y/QstC70Y/QtdGC0YHRjyDRgdCy0L7QudGB0YLQstC+IF9fcHJveHksINGB0L7QtNC10YDQttCw0YnQtdC1INGB0YHRi9C70LrRgyDQvdCwINGB0L7Qt9C00LDQvdC90YvQuSDQv9GA0L7QutGB0Lgt0L7QsdGK0LXQutGCXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gT3JpZ2luYWxDbGFzcyAtINC+0YDQuNCz0LjQvdCw0LvRjNC90YvQuSDQutC70LDRgdGBXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBQYXJlbnRQcm94eUNsYXNzIC0g0YDQvtC00LjRgtC10LvRjNGB0LrQuNC5INC60LvQsNGB0YFcbiAqIEByZXR1cm5zIHtmdW5jdGlvbn0gLS0g0LrQvtC90YHRgtGA0YPRgtC+0YAg0L/RgNC+0LrRgdC40YDQvtCy0LDQvdC90L7Qs9C+INC60LvQsNGB0YHQsFxuICovXG5Qcm94eS5jcmVhdGVDbGFzcyA9IGZ1bmN0aW9uKE9yaWdpbmFsQ2xhc3MsIFBhcmVudFByb3h5Q2xhc3MpIHtcblxuICAgIHZhciBQcm94eUNsYXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBPcmlnaW5hbENsYXNzQ29uc3RydWN0b3IgPSBmdW5jdGlvbigpIHt9O1xuICAgICAgICBPcmlnaW5hbENsYXNzQ29uc3RydWN0b3IucHJvdG90eXBlID0gT3JpZ2luYWxDbGFzcy5wcm90b3R5cGU7XG5cbiAgICAgICAgdmFyIG9yaWdpbmFsID0gbmV3IE9yaWdpbmFsQ2xhc3NDb25zdHJ1Y3RvcigpO1xuICAgICAgICBPcmlnaW5hbENsYXNzLmFwcGx5KG9yaWdpbmFsLCBhcmd1bWVudHMpO1xuXG4gICAgICAgIHJldHVybiBvcmlnaW5hbC5fcHJveHkoKTtcbiAgICB9O1xuXG4gICAgdmFyIFBhcmVudFByb3h5Q2xhc3NDb25zdHJ1Y3RvciA9IGZ1bmN0aW9uKCkge307XG4gICAgUGFyZW50UHJveHlDbGFzc0NvbnN0cnVjdG9yLnByb3RvdHlwZSA9IChQYXJlbnRQcm94eUNsYXNzIHx8IFByb3h5KS5wcm90b3R5cGU7XG4gICAgUHJveHlDbGFzcy5wcm90b3R5cGUgPSBuZXcgUGFyZW50UHJveHlDbGFzc0NvbnN0cnVjdG9yKCk7XG5cbiAgICB2YXIgdmFsO1xuICAgIGZvciAodmFyIGsgaW4gT3JpZ2luYWxDbGFzcy5wcm90b3R5cGUpIHtcbiAgICAgICAgdmFsID0gT3JpZ2luYWxDbGFzcy5wcm90b3R5cGVba107XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlW2tdID09IHZhbCB8fCB0eXBlb2YgdmFsID09PSBcImZ1bmN0aW9uXCIgfHwga1swXSA9PT0gXCJfXCIpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW2tdID0gdmFsO1xuICAgIH1cblxuICAgIHZhciBjcmVhdGVQcm94eSA9IGZ1bmN0aW9uKG9yaWdpbmFsKSB7XG4gICAgICAgIHZhciBwcm90byA9IFByb3h5LnByb3RvdHlwZTtcbiAgICAgICAgUHJveHkucHJvdG90eXBlID0gUHJveHlDbGFzcy5wcm90b3R5cGU7XG4gICAgICAgIHZhciBwcm94eSA9IG5ldyBQcm94eShvcmlnaW5hbCk7XG4gICAgICAgIFByb3h5LnByb3RvdHlwZSA9IHByb3RvO1xuICAgICAgICByZXR1cm4gcHJveHk7XG4gICAgfTtcblxuICAgIE9yaWdpbmFsQ2xhc3MucHJvdG90eXBlLl9wcm94eSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuX19wcm94eSkge1xuICAgICAgICAgICAgdGhpcy5fX3Byb3h5ID0gY3JlYXRlUHJveHkodGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fX3Byb3h5O1xuICAgIH07XG5cbiAgICBQcm94eS5leHBvcnRTdGF0aWMoT3JpZ2luYWxDbGFzcywgUHJveHlDbGFzcyk7XG5cbiAgICByZXR1cm4gUHJveHlDbGFzcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUHJveHk7XG4iLCIvKipcbiAqINCh0LrQvtC/0LjRgNC+0LLQsNGC0Ywg0YHQstC+0LnRgdGC0LLQsCDQstGB0LXRhSDQv9C10YDQtdGH0LjRgdC70LXQvdC90YvRhSDQvtCx0YrQtdC60YLQvtCyINCyINC+0LTQuNC9LlxuICogQHBhcmFtIHtPYmplY3R9IGluaXRpYWwgLSDQtdGB0LvQuCDQv9C+0YHQu9C10LTQvdC40Lkg0LDRgNCz0YPQvNC10L3RgiB0cnVlLCDRgtC+INC90L7QstGL0Lkg0L7QsdGK0LXQutGCINC90LUg0YHQvtC30LTQsNGR0YLRgdGPLCDQsCDQuNGB0L/QvtC70YzQt9GD0LXRgtGB0Y8g0LTQsNC90L3Ri9C5XG4gKiBAcGFyYW0gey4uLk9iamVjdHxCb29sZWFufSBhcmdzIC0g0YHQv9C40YHQvtC6INC+0LHRitC10LrRgtC+0LIg0LjQtyDQutC+0YLQvtGA0YvRhSDQutC+0L/QuNGA0L7QstCw0YLRjCDRgdCy0L7QudGB0YLQstCwLiDQn9C+0YHQu9C10LTQvdC40Lkg0LDRgNCz0YPQvNC10L3RgiDQvNC+0LbQtdGCINCx0YvRgtGMINC70LjQsdC+XG4gKiDQvtCx0YrQtdC60YLQvtC8LCDQu9C40LHQviB0cnVlLlxuICogQHJldHVybnMge09iamVjdH1cbiAqIEBwcml2YXRlXG4gKi9cbnZhciBtZXJnZSA9IGZ1bmN0aW9uIChpbml0aWFsKSB7XG4gICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgdmFyIG9iamVjdDtcbiAgICB2YXIga2V5O1xuXG4gICAgaWYgKGFyZ3NbYXJncy5sZW5ndGggLSAxXSA9PT0gdHJ1ZSkge1xuICAgICAgICBvYmplY3QgPSBpbml0aWFsO1xuICAgICAgICBhcmdzLnBvcCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdCA9IHt9O1xuICAgICAgICBmb3IgKGtleSBpbiBpbml0aWFsKSB7XG4gICAgICAgICAgICBpZiAoaW5pdGlhbC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgb2JqZWN0W2tleV0gPSBpbml0aWFsW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKHZhciBrID0gMCwgbCA9IGFyZ3MubGVuZ3RoOyBrIDwgbDsgaysrKSB7XG4gICAgICAgIGZvciAoa2V5IGluIGFyZ3Nba10pIHtcbiAgICAgICAgICAgIGlmIChhcmdzW2tdLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICBvYmplY3Rba2V5XSA9IGFyZ3Nba11ba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvYmplY3Q7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1lcmdlO1xuIiwicmVxdWlyZSgnLi4vLi4vLi4vZXhwb3J0Jyk7XG5cbnZhciBMb2FkZXJFcnJvciA9IHJlcXVpcmUoJy4vbG9hZGVyLWVycm9yJyk7XG5cbnlhLkF1ZGlvLkxvYWRlckVycm9yID0gTG9hZGVyRXJyb3I7XG4iLCJ2YXIgRXJyb3JDbGFzcyA9IHJlcXVpcmUoJy4uLy4uL2NsYXNzL2Vycm9yLWNsYXNzJyk7XG5cbi8qKlxuICog0JrQu9Cw0YHRgSDQvtGI0LjQsdC+0Log0LfQsNCz0YDRg9C30YfQuNC60LBcbiAqIEBhbGlhcyB5YS5BdWRpby5Mb2FkZXJFcnJvclxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIC0g0YLQtdC60YHRgiDQvtGI0LjQsdC60LrQuFxuICpcbiAqIEBleHRlbmRzIEVycm9yXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBMb2FkZXJFcnJvciA9IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICBFcnJvckNsYXNzLmNhbGwodGhpcywgbWVzc2FnZSk7XG59O1xuTG9hZGVyRXJyb3IucHJvdG90eXBlID0gRXJyb3JDbGFzcy5jcmVhdGUoXCJMb2FkZXJFcnJvclwiKTtcblxuLyoqXG4gKiDQotCw0LnQvNCw0YPRgiDQt9Cw0LPRgNGD0LfQutC4XG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkxvYWRlckVycm9yLlRJTUVPVVQgPSBcInJlcXVlc3QgdGltZW91dFwiO1xuLyoqXG4gKiDQntGI0LjQsdC60LAg0LfQsNC/0YDQvtGB0LAg0L3QsCDQt9Cw0LPRgNGD0LfQutGDXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkxvYWRlckVycm9yLkZBSUxFRCA9IFwicmVxdWVzdCBmYWlsZWRcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBMb2FkZXJFcnJvcjtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7fTtcbiIsInJlcXVpcmUoXCIuLi9leHBvcnRcIik7XG5cbnZhciBMb2dnZXIgPSByZXF1aXJlKCcuL2xvZ2dlcicpO1xuXG55YS5BdWRpby5Mb2dnZXIgPSBMb2dnZXI7XG4iLCJ2YXIgTEVWRUxTID0gW1wiZGVidWdcIiwgXCJsb2dcIiwgXCJpbmZvXCIsIFwid2FyblwiLCBcImVycm9yXCIsIFwidHJhY2VcIl07XG52YXIgbm9vcCA9IHJlcXVpcmUoJy4uL2xpYi9ub29wJyk7XG5cbi8qKlxuICog0J3QsNGB0YLRgNCw0LjQstCw0LXQvNGL0LUg0LvQvtCz0LPQtdGAINC00LvRjyDQsNGD0LTQuNC+LdC/0LvQtdC10YDQsFxuICogQGFsaWFzIHlhLkF1ZGlvLkxvZ2dlclxuICogQHBhcmFtIHtTdHJpbmd9IGNoYW5uZWwgLSDQuNC80Y8g0LrQsNC90LDQu9CwLCDQt9CwINC60L7RgtC+0YDRi9C5INCx0YPQtNC10YIg0L7RgtCy0LXRh9Cw0YLRjCDRjdC60LfQtdC80LvRj9GAINC70L7Qs9Cz0LXRgNCwXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIExvZ2dlciA9IGZ1bmN0aW9uKGNoYW5uZWwpIHtcbiAgICB0aGlzLmNoYW5uZWwgPSBjaGFubmVsO1xufTtcblxuLyoqXG4gKiDQodC/0LjRgdC+0Log0LjQs9C90L7RgNC40YDRg9C10LzRi9GFINC60LDQvdCw0LvQvtCyXG4gKiBAdHlwZSB7QXJyYXkuPFN0cmluZz59XG4gKi9cbkxvZ2dlci5pZ25vcmVzID0gW107XG5cbi8qKlxuICog0KHQv9C40YHQvtC6INC+0YLQvtCx0YDQsNC20LDQtdC80YvRhSDQsiDQutC+0L3RgdC+0LvQuCDRg9GA0L7QstC90LXQuSDQu9C+0LPQsFxuICogQHR5cGUge0FycmF5LjxTdHJpbmc+fVxuICovXG5Mb2dnZXIubG9nTGV2ZWxzID0gW107XG5cbi8qKlxuICog0JfQsNC/0LjRgdGMINCyINC70L7QsyDRgSDRg9GA0L7QstC90LXQvCAqKmRlYnVnKipcbiAqIEBtZXRob2QgeWEuQXVkaW8uTG9nZ2VyI2RlYnVnXG4gKiBAcGFyYW0ge09iamVjdH0gY29udGV4dCAtINC60L7QvdGC0LXQutGB0YIg0LLRi9C30L7QstCwXG4gKiBAcGFyYW0gey4uLip9IFthcmdzXSAtINC00L7Qv9C+0LvQvdC40YLQtdC70YzQvdGL0LUg0LDRgNCz0YPQvNC10L3RgtGLXG4gKi9cbkxvZ2dlci5wcm90b3R5cGUuZGVidWcgPSBub29wO1xuXG4vKipcbiAqINCX0LDQv9C40YHRjCDQsiDQu9C+0LMg0YEg0YPRgNC+0LLQvdC10LwgKipsb2cqKlxuICogQG1ldGhvZCB5YS5BdWRpby5Mb2dnZXIjbG9nXG4gKiBAcGFyYW0ge09iamVjdH0gY29udGV4dCAtINC60L7QvdGC0LXQutGB0YIg0LLRi9C30L7QstCwXG4gKiBAcGFyYW0gey4uLip9IFthcmdzXSAtINC00L7Qv9C+0LvQvdC40YLQtdC70YzQvdGL0LUg0LDRgNCz0YPQvNC10L3RgtGLXG4gKi9cbkxvZ2dlci5wcm90b3R5cGUubG9nID0gbm9vcDtcblxuLyoqXG4gKiDQl9Cw0L/QuNGB0Ywg0LIg0LvQvtCzINGBINGD0YDQvtCy0L3QtdC8ICoqaW5mbyoqXG4gKiBAbWV0aG9kIHlhLkF1ZGlvLkxvZ2dlciNpbmZvXG4gKiBAcGFyYW0ge09iamVjdH0gY29udGV4dCAtINC60L7QvdGC0LXQutGB0YIg0LLRi9C30L7QstCwXG4gKiBAcGFyYW0gey4uLip9IFthcmdzXSAtINC00L7Qv9C+0LvQvdC40YLQtdC70YzQvdGL0LUg0LDRgNCz0YPQvNC10L3RgtGLXG4gKi9cbkxvZ2dlci5wcm90b3R5cGUuaW5mbyA9IG5vb3A7XG5cbi8qKlxuICog0JfQsNC/0LjRgdGMINCyINC70L7QsyDRgSDRg9GA0L7QstC90LXQvCAqKndhcm4qKlxuICogQG1ldGhvZCB5YS5BdWRpby5Mb2dnZXIjd2FyblxuICogQHBhcmFtIHtPYmplY3R9IGNvbnRleHQgLSDQutC+0L3RgtC10LrRgdGCINCy0YvQt9C+0LLQsFxuICogQHBhcmFtIHsuLi4qfSBbYXJnc10gLSDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INCw0YDQs9GD0LzQtdC90YLRi1xuICovXG5Mb2dnZXIucHJvdG90eXBlLndhcm4gPSBub29wO1xuXG4vKipcbiAqINCX0LDQv9C40YHRjCDQsiDQu9C+0LMg0YEg0YPRgNC+0LLQvdC10LwgKiplcnJvcioqXG4gKiBAbWV0aG9kIHlhLkF1ZGlvLkxvZ2dlciNlcnJvclxuICogQHBhcmFtIHtPYmplY3R9IGNvbnRleHQgLSDQutC+0L3RgtC10LrRgdGCINCy0YvQt9C+0LLQsFxuICogQHBhcmFtIHsuLi4qfSBbYXJnc10gLSDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INCw0YDQs9GD0LzQtdC90YLRi1xuICovXG5Mb2dnZXIucHJvdG90eXBlLmVycm9yID0gbm9vcDtcblxuLyoqXG4gKiDQl9Cw0L/QuNGB0Ywg0LIg0LvQvtCzINGBINGD0YDQvtCy0L3QtdC8ICoqdHJhY2UqKlxuICogQG1ldGhvZCB5YS5BdWRpby5Mb2dnZXIjdHJhY2VcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0IC0g0LrQvtC90YLQtdC60YHRgiDQstGL0LfQvtCy0LBcbiAqIEBwYXJhbSB7Li4uKn0gW2FyZ3NdIC0g0LTQvtC/0L7Qu9C90LjRgtC10LvRjNC90YvQtSDQsNGA0LPRg9C80LXQvdGC0YtcbiAqL1xuTG9nZ2VyLnByb3RvdHlwZS50cmFjZSA9IG5vb3A7XG5cbi8qKlxuICog0KHQtNC10LvQsNGC0Ywg0LfQsNC/0LjRgdGMINCyINC70L7Qs1xuICogQHBhcmFtIHtTdHJpbmd9IGxldmVsIC0g0YPRgNC+0LLQtdC90Ywg0LvQvtCz0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBjaGFubmVsIC0g0LrQsNC90LDQu1xuICogQHBhcmFtIHtPYmplY3R9IGNvbnRleHQgLSDQutC+0L3RgtC10LrRgdGCINCy0YvQt9C+0LLQsFxuICogQHBhcmFtIHsuLi4qfSBbYXJnc10gLSDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INCw0YDQs9GD0LzQtdC90YLRi1xuICovXG5Mb2dnZXIubG9nID0gZnVuY3Rpb24obGV2ZWwsIGNoYW5uZWwsIGNvbnRleHQpIHtcbiAgICB2YXIgZGF0YSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKS5tYXAoZnVuY3Rpb24oZHVtcEl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGR1bXBJdGVtICYmIGR1bXBJdGVtLl9sb2dnZXIgJiYgZHVtcEl0ZW0uX2xvZ2dlcigpIHx8IGR1bXBJdGVtO1xuICAgIH0pO1xuXG4gICAgdmFyIGxvZ0VudHJ5ID0ge1xuICAgICAgICB0aW1lc3RhbXA6ICtuZXcgRGF0ZSgpLFxuICAgICAgICBsZXZlbDogbGV2ZWwsXG4gICAgICAgIGNoYW5uZWw6IGNoYW5uZWwsXG4gICAgICAgIGNvbnRleHQ6IGNvbnRleHQsXG4gICAgICAgIG1lc3NhZ2U6IGRhdGFcbiAgICB9O1xuXG4gICAgaWYgKExvZ2dlci5pZ25vcmVzW2NoYW5uZWxdIHx8IExvZ2dlci5sb2dMZXZlbHMuaW5kZXhPZihsZXZlbCkgPT09IC0xKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBMb2dnZXIuX2R1bXBFbnRyeShsb2dFbnRyeSk7XG59O1xuXG4vKipcbiAqINCX0LDQv9C40YHRjCDQsiDQu9C+0LPQtVxuICogQHR5cGVkZWYge09iamVjdH0geWEuQXVkaW8uTG9nZ2VyfkxvZ0VudHJ5XG4gKlxuICogQHByb3BlcnR5IHtOdW1iZXJ9IHRpbWVzdGFtcCAtINCy0YDQtdC80Y8g0LIgdGltZXN0YW1wINGE0L7RgNC80LDRgtC1XG4gKiBAcHJvcGVydHkge1N0cmluZ30gbGV2ZWwgLSDRg9GA0L7QstC10L3RjCDQu9C+0LPQsFxuICogQHByb3BlcnR5IHtTdHJpbmd9IGNoYW5uZWwgLSDQutCw0L3QsNC7XG4gKiBAcHJvcGVydHkge09iamVjdH0gY29udGV4dCAtINC60L7QvdGC0LXQutGB0YIg0LLRi9C30L7QstCwXG4gKiBAcHJvcGVydHkge0FycmF5fSBtZXNzYWdlIC0g0LTQvtC/0L7Qu9C90LjRgtC10LvRjNC90YvQtSDQsNGA0LPRg9C80LXQvdGC0YtcbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5cbi8qKlxuICog0JfQsNC/0LjRgdCw0YLRjCDRgdC+0L7QsdGJ0LXQvdC40LUg0LvQvtCz0LAg0LIg0LrQvtC90YHQvtC70YxcbiAqIEBwYXJhbSB7eWEuQXVkaW8uTG9nZ2VyfkxvZ0VudHJ5fSBsb2dFbnRyeSAtINGB0L7QvtCx0YnQtdC90LjQtSDQu9C+0LPQsFxuICogQHByaXZhdGVcbiAqL1xuTG9nZ2VyLl9kdW1wRW50cnkgPSBmdW5jdGlvbihsb2dFbnRyeSkge1xuICAgIHRyeSB7XG4gICAgICAgIHZhciBsZXZlbCA9IGxvZ0VudHJ5LmxldmVsO1xuXG4gICAgICAgIHZhciBuYW1lID0gbG9nRW50cnkuY29udGV4dCAmJiAobG9nRW50cnkuY29udGV4dC50YXNrTmFtZSB8fCBsb2dFbnRyeS5jb250ZXh0Lm5hbWUpO1xuICAgICAgICB2YXIgY29udGV4dCA9IGxvZ0VudHJ5LmNvbnRleHQgJiYgKGxvZ0VudHJ5LmNvbnRleHQuX2xvZ2dlciA/IGxvZ0VudHJ5LmNvbnRleHQuX2xvZ2dlcigpIDogXCJcIik7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlW2xldmVsXSAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBbXG4gICAgICAgICAgICAgICAgbGV2ZWwudG9VcHBlckNhc2UoKSxcbiAgICAgICAgICAgICAgICBMb2dnZXIuX2Zvcm1hdFRpbWVzdGFtcChsb2dFbnRyeS50aW1lc3RhbXApLFxuICAgICAgICAgICAgICAgIFwiW1wiICsgbG9nRW50cnkuY2hhbm5lbCArIChuYW1lID8gXCI6XCIgKyBuYW1lIDogXCJcIikgKyBcIl1cIixcbiAgICAgICAgICAgICAgICBjb250ZXh0XG4gICAgICAgICAgICBdLmNvbmNhdChsb2dFbnRyeS5tZXNzYWdlKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlW2xldmVsXS5hcHBseShjb25zb2xlLCBbXG4gICAgICAgICAgICAgICAgTG9nZ2VyLl9mb3JtYXRUaW1lc3RhbXAobG9nRW50cnkudGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICBcIltcIiArIGxvZ0VudHJ5LmNoYW5uZWwgKyAobmFtZSA/IFwiOlwiICsgbmFtZSA6IFwiXCIpICsgXCJdXCIsXG4gICAgICAgICAgICAgICAgY29udGV4dFxuICAgICAgICAgICAgXS5jb25jYXQobG9nRW50cnkubWVzc2FnZSkpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaChlKSB7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQktGB0L/QvtC80L7Qs9Cw0YLQtdC70YzQvdCw0Y8g0YTRg9C90LrRhtC40Y8g0YTQvtGA0LzQsNGC0LjRgNC+0LLQsNC90LjRjyDQtNCw0YLRiyDQtNC70Y8g0LLRi9Cy0L7QtNCwINCyINC60L7QvdC+0YHQvtC70YxcbiAqIEBwYXJhbSB0aW1lc3RhbXBcbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKiBAcHJpdmF0ZVxuICovXG5Mb2dnZXIuX2Zvcm1hdFRpbWVzdGFtcCA9IGZ1bmN0aW9uKHRpbWVzdGFtcCkge1xuICAgIHZhciBkYXRlID0gbmV3IERhdGUodGltZXN0YW1wKTtcbiAgICB2YXIgbXMgPSBkYXRlLmdldE1pbGxpc2Vjb25kcygpO1xuICAgIG1zID0gbXMgPiAxMDAgPyBtcyA6IG1zID4gMTAgPyBcIjBcIiArIG1zIDogXCIwMFwiICsgbXM7XG4gICAgcmV0dXJuIGRhdGUudG9Mb2NhbGVUaW1lU3RyaW5nKCkgKyBcIi5cIiArIG1zO1xufTtcblxuTEVWRUxTLmZvckVhY2goZnVuY3Rpb24obGV2ZWwpIHtcbiAgICBMb2dnZXIucHJvdG90eXBlW2xldmVsXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgYXJncy51bnNoaWZ0KHRoaXMuY2hhbm5lbCk7XG4gICAgICAgIGFyZ3MudW5zaGlmdChsZXZlbCk7XG4gICAgICAgIExvZ2dlci5sb2cuYXBwbHkoTG9nZ2VyLCBhcmdzKTtcbiAgICB9O1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gTG9nZ2VyO1xuIiwidmFyIE1vZHVsZXMgPSByZXF1aXJlKCd5bScpO1xudmFyIFlhbmRleEF1ZGlvID0gcmVxdWlyZShcIi4vaW5kZXguanNcIik7XG5cbnZhciBtb2R1bGVzO1xuaWYgKHdpbmRvdy5tb2R1bGVzKSB7XG4gICAgbW9kdWxlcyA9IHdpbmRvdy5tb2R1bGVzO1xufSBlbHNlIHtcbiAgICBtb2R1bGVzID0gd2luZG93Lm1vZHVsZXMgPSBNb2R1bGVzLmNyZWF0ZSgpO1xufVxuXG5tb2R1bGVzLmRlZmluZSgnWWFuZGV4QXVkaW8nLCBmdW5jdGlvbihwcm92aWRlKSB7XG4gICAgcHJvdmlkZShZYW5kZXhBdWRpbyk7XG59KTtcbiJdfQ==