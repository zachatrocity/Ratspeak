#!/usr/bin/env node
'use strict';

// Exercise the actual channel binding and gesture recognizer together.
// This checks event cancellation, not Android WebView's native rendering.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var js = path.join(__dirname, '..', '..', 'dashboard', 'static', 'js');
var source = fs.readFileSync(path.join(js, 'channels.js'), 'utf8');
var start = source.indexOf('function _channelsBindTouchReplyAction(');
var end = source.indexOf('\nfunction _channelsIsRemotePresenceItem(', start);
assert(start >= 0 && end > start);

function setup() {
    var handlers = {};
    var options = {};
    var frames = new Map();
    var nextFrame = 0;
    var time = 100;
    var popovers = [];
    var quotes = [];
    var element = {
        addEventListener: function(name, fn, opts) {
            handlers[name] = fn;
            options[name] = opts;
        },
        removeEventListener: function() {}
    };
    var context = {
        window: { RS: {} },
        document: { addEventListener: function() {}, removeEventListener: function() {} },
        performance: { now: function() { return time; } },
        requestAnimationFrame: function(fn) { frames.set(++nextFrame, fn); return nextFrame; },
        cancelAnimationFrame: function(id) { frames.delete(id); },
        actionPopover: function(el, actions) { popovers.push({ el: el, actions: actions }); },
        _channelsInsertQuote: function(item, author) { quotes.push({ item: item, author: author }); }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(js, 'gestures.js'), 'utf8'), context);
    vm.runInContext(source.slice(start, end), context);
    var item = { ours: false, text: 'Hello', id: 'message-1' };
    context._channelsBindTouchReplyAction(element, item, 'Buddy');
    function touch(name, y) {
        var event = {
            touches: [{ clientX: 20, clientY: y }],
            cancelable: true,
            defaultPrevented: false,
            preventDefault: function() { this.defaultPrevented = true; }
        };
        handlers[name](event);
        return event;
    }
    function advance(ms) {
        time += ms;
        var pending = Array.from(frames.values());
        frames.clear();
        pending.forEach(function(fn) { fn(time); });
    }
    return { handlers: handlers, options: options, touch: touch, advance: advance,
        popovers: popovers, quotes: quotes, element: element, item: item };
}

[-40, 40].forEach(function(delta) {
    var h = setup();
    assert.strictEqual(h.touch('touchstart', 100).defaultPrevented, false,
        'swipes beginning on channel messages must not cancel native touch defaults');
    assert.strictEqual(h.options.touchstart.passive, true);
    assert.strictEqual(h.touch('touchmove', 100 + delta).defaultPrevented, false);
    h.advance(600);
    assert.strictEqual(h.popovers.length, 0, 'a vertical swipe must cancel the reply hold');
});

var hold = setup();
hold.touch('touchstart', 100);
hold.advance(501);
assert.strictEqual(hold.popovers.length, 1, 'stationary long press still opens message actions');
assert.strictEqual(hold.popovers[0].el, hold.element);
assert.strictEqual(hold.popovers[0].actions[0].label, 'Quote in reply');
assert.strictEqual(hold.popovers[0].actions[1].label, 'Report');
hold.popovers[0].actions[0].onSelect();
assert.strictEqual(hold.quotes[0].item, hold.item);
assert.strictEqual(hold.quotes[0].author, 'Buddy');

['touchend', 'touchcancel'].forEach(function(name) {
    var h = setup();
    h.touch('touchstart', 100);
    h.handlers[name]();
    h.advance(600);
    assert.strictEqual(h.popovers.length, 0, name + ' must cancel pending actions');
});
console.log('Channel touch scrolling tests passed');
