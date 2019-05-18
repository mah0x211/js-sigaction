/**
 * Copyright (C) 2018 Masatoshi Fukunaga
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * sigaction.js
 * js-sigaction
 * Created by Masatoshi Fukunaga on 18/05/13.
 */

(function () {
    'use strict';

    // constants
    var SIGCTX = '_signal_ctx';
    var ATTRID = 'sigaction';
    // protected-variables
    var SIGACT = {};

    //
    // helper functions
    //
    function isElm(elm) {
        return (elm instanceof HTMLElement) || (elm instanceof SVGElement);
    }

    function isStr(str) {
        return typeof (str) === 'string';
    }

    function isFunc(fn) {
        return typeof (fn) === 'function';
    }

    function toArray(nodeList) {
        return Array.prototype.slice.call(nodeList);
    }

    function unwatch(elm) {
        if (isElm(elm) && elm[SIGCTX]) {
            // remove events
            elm[SIGCTX].evts.forEach(function (ev) {
                elm.removeEventListener(ev, raise);
            });
            // void context
            elm[SIGCTX] = null;
        }
    }

    function raise(ev) {
        var ctx = ev.target[SIGCTX];

        if (ctx) {
            sigRaise.apply(sigRaise, [ctx.name, ev].concat(ctx.args));
        }
    }

    function watch(elm) {
        if (isElm(elm) && elm.dataset[ATTRID]) {
            // remove old context
            if (elm[SIGCTX]) {
                unwatch(elm);
            }

            var attr = elm.dataset[ATTRID].split('|'),
                name = attr[0].trim(),
                evts = (attr[1] || '').split(',').map(function (str) {
                    return str.trim();
                }),
                args = (attr[2] || '').split(',').map(function (str) {
                    return str.trim();
                });

            if (attr.length < 2 || attr.length > 3) {
                throw new SyntaxError(
                    'data-signal format must be signame|event,...|arg,...'
                );
            }

            // add events
            evts.forEach(function (ev) {
                elm.addEventListener(ev, raise);
            });
            // save context
            elm[SIGCTX] = {
                name: name,
                evts: evts,
                args: args
            };
        }
    }

    // automatically watch or unwatch
    function onDOMChanged(records) {
        records.forEach(function (record) {
            switch (record.type) {
                case 'attributes':
                    var elm = record.target;
                    if (elm.dataset[ATTRID]) {
                        watch(elm);
                    } else {
                        unwatch(elm);
                    }
                    break;

                case 'childList':
                    toArray(record.addedNodes).forEach(watch);
                    toArray(record.removedNodes).forEach(unwatch);
                    break;
            }
        });
    }

    function initialize() {
        window.removeEventListener('load', initialize);
        (new MutationObserver(onDOMChanged)).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
        // register elements
        toArray(
            document.querySelectorAll('*[data-' + ATTRID + ']')
        ).forEach(watch);

        // call if SigactionLoaded function is defined
        if (isFunc(window['SigactionLoaded'])) {
            window['SigactionLoaded']();
        }
    }
    window.addEventListener('DOMContentLoaded', initialize);


    // Public API
    /**
     * Callback function for signal-name.
     * @callback sigCallback
     * @param {...*} var_args variable-arguments
     */

    /**
     * Add an action for specified signal-name
     * @global
     * @param {String} signame signal-name
     * @param {sigCallback} act callback function for signal-name
     * @param {*} ctx the value used as `this` object
     * @throws {TypeError} throw an error if the argument is invalid
     * @return {boolean} true if added
     */
    function sigAdd(signame, act, ctx) {
        if (!isStr(signame)) {
            throw new TypeError('signame must be string');
        } else if (!isFunc(act)) {
            throw new TypeError('act must be function');
        }

        var acts = SIGACT[signame];
        if (acts) {
            // check existing
            for (var i = 0, len = acts.length; i < len; i++) {
                // already exists
                if (acts[i].act === act) {
                    return false;
                }
            }
        } else {
            acts = [];
            SIGACT[signame] = acts;
        }

        // add action
        acts.push({
            act: act,
            ctx: ctx || act
        });

        return true;
    }

    /**
     * Remove an action for specified signal-name
     * @global
     * @param {String} signame signal-name
     * @param {sigCallback} act callback function for signal-name
     * @throws {TypeError} throw an error if the argument is invalid
     * @return {boolean} true if removed
     */
    function sigRemove(signame, act) {
        if (!isStr(signame)) {
            throw new TypeError('signame must be string');
        } else if (!isFunc(act)) {
            throw new TypeError('act must be function');
        }

        var acts = SIGACT[signame];
        if (acts) {
            // check existing
            for (var i = 0, len = acts.length; i < len; i++) {
                // found action
                if (acts[i].act === act) {
                    acts.splice(i, 1);
                    return true;
                }
            }
        }

        // not found
        return false;
    }

    /**
     * Send a signal
     * @global
     * @param {String} signame signal-name
     * @param {...*} var_args arguments for actionCallback
     * @throws {TypeError} throw an error if signame is invalid
     * @return {number} number of invokes
     */
    function sigRaise(signame, var_args) {
        if (!isStr(signame)) {
            throw new TypeError('signame must be string');
        }

        var acts = SIGACT[signame];
        if (acts) {
            var args = toArray(arguments),
                ninvoke = 0;

            // remove signame
            args.shift();
            // invoke actions
            acts.forEach(function (action) {
                try {
                    action.act.apply(action.ctx, args);
                    ninvoke++;
                } catch (e) {
                    console.error(e);
                }
            });

            return ninvoke;
        }

        return 0;
    }

    // export sigaction to global
    window['sigaction'] = {
        'add': sigAdd,
        'remove': sigRemove,
        'raise': sigRaise
    };
})();
