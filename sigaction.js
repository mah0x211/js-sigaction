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

(function() {
    'use strict';

    // constants
    const SIGCTX = '_sa_ctx';
    // protected-variables
    const SIGACT = {};

    //
    // helper functions
    //
    function isElm(elm) {
        return elm instanceof HTMLElement || elm instanceof SVGElement;
    }

    function isStr(str) {
        return typeof str === 'string';
    }

    function isFunc(fn) {
        return typeof fn === 'function';
    }

    function toArray(nodeList) {
        return Array.prototype.slice.call(nodeList);
    }

    function parseArgs(str) {
        str = str.trim();
        if (str === '') {
            return [];
        }
        return JSON.parse('[' + str + ']');
    }

    function unwatch(elm) {
        if (isElm(elm) && elm[SIGCTX]) {
            // remove events
            elm[SIGCTX].evs.forEach(function(ev) {
                elm.removeEventListener(ev, raise);
            });
            // delete context
            delete elm[SIGCTX];
        }
    }

    function raise(ev) {
        const ctx = ev.target[SIGCTX];
        if (ctx) {
            sigRaise.apply(sigRaise, [ctx.name, ev].concat(ctx.args));
        }
    }

    function watch(elm) {
        // remove old context
        unwatch(elm);
        if (isElm(elm) && 'saName' in elm.dataset) {
            const name = (elm.dataset['saName'] || '').trim();
            const args = parseArgs(elm.dataset['saArgs'] || '');
            const evs = (elm.dataset['saEvents'] || '').split(',').map(str => {
                str = str.trim();
                if ('on' + str in elm) {
                    return str;
                }
                console.warn(
                    `data-sa-events "${str}" is not supported in ${elm}`
                );
            });

            if (name === '') {
                console.error('data-sa-name cannot be empty');
            } else if (evs.length > 0) {
                // add events
                evs.forEach(ev => {
                    elm.addEventListener(ev, raise);
                });
                // save context
                elm[SIGCTX] = {
                    name: name,
                    evs: evs,
                    args: args
                };
            }
        }
    }

    // automatically watch or unwatch
    function onDOMChanged(records) {
        records.forEach(function(record) {
            switch (record.type) {
                case 'attributes':
                    watch(record.target);
                    break;

                case 'childList':
                    toArray(record.addedNodes).forEach(watch);
                    toArray(record.removedNodes).forEach(unwatch);
                    break;
            }
        });
    }

    function initialize() {
        window.removeEventListener('DOMContentLoaded', initialize);
        new MutationObserver(onDOMChanged).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-sa-name', 'data-sa-args', 'data-sa-events']
        });
        // register elements
        toArray(document.querySelectorAll('*[data-sa-name]')).forEach(watch);

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

        let acts = SIGACT[signame];
        if (acts) {
            // check existing
            const len = acts.length;
            for (let i = 0; i < len; i++) {
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

        const acts = SIGACT[signame];
        if (acts) {
            // check existing
            const len = acts.length;
            for (let i = 0; i < len; i++) {
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

        const acts = SIGACT[signame];
        if (acts) {
            const args = toArray(arguments);
            let ninvoke = 0;

            // remove signame
            args.shift();
            // invoke actions
            acts.forEach(function(action) {
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
