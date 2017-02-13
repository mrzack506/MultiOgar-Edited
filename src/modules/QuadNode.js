'use strict';
/*
 * Fast and easy Quad-Tree implementation written by Barbosik.
 * Useful for quick object search in the area specified with bounds.
 *
 * Copyright (c) 2016 Barbosik https://github.com/Barbosik
 * License: Apache License, Version 2.0
 */

function QuadNode(bound) {
    var halfWidth = (bound.maxx - bound.minx) / 2;
    var halfHeight = (bound.maxy - bound.miny) / 2;
    
    this.bound = {
        minx: bound.minx, 
        miny: bound.miny,
        maxx: bound.maxx,
        maxy: bound.maxy,
        halfWidth: halfWidth,
        halfHeight: halfHeight,
        cx: bound.minx + halfWidth,
        cy: bound.miny + halfHeight
    };
    this.childNodes = [];
    this.items = [];
}

module.exports = QuadNode;

QuadNode.prototype.insert = function (item) {
    if (this.childNodes.length != 0) {
        var quad = this.getQuad(item.bound);
        if (quad != -1) {
            this.childNodes[quad].insert(item);
            return;
        }
    }
    this.items.push(item);
    item._quadNode = this;  // attached field, used for quick search quad node by item
    
    // check if rebalance needed
    if (this.childNodes.length != 0 || this.items.length < 64)
        return;
    // split and rebalance current node
    if (this.childNodes.length == 0) {
        // split into 4 subnodes (top, left, bottom, right)
        var w = this.bound.halfWidth;
        var h = this.bound.halfHeight;
        var my = this.bound.miny;
        var mx = this.bound.minx;
        var mh = my + h;
        var mw = mx + w;
        var b0 = { minx: mw, miny: my, maxx: mw + w, maxy: my + h };
        var b1 = { minx: mx, miny: my, maxx: mx + w, maxy: my + h };
        var b2 = { minx: mx, miny: mh, maxx: mx + w, maxy: mh + h };
        var b3 = { minx: mw, miny: mh, maxx: mw + w, maxy: mh + h };
        this.childNodes.push(new QuadNode(b0));
        this.childNodes.push(new QuadNode(b1));
        this.childNodes.push(new QuadNode(b2));
        this.childNodes.push(new QuadNode(b3));
    }
    // rebalance
    for (var i = 0; i < this.items.length; ) {
        var qitem = this.items[i];
        var quad = this.getQuad(qitem.bound);
        if (quad != -1) {
            this.items.splice(i, 1);
            qitem._quadNode = null;
            this.childNodes[quad].insert(qitem);
        }
        else i++;
    }
};

QuadNode.prototype.remove = function (item) {
    if (item._quadNode != this) {
        item._quadNode.remove(item);
        return;
    }
    var index = this.items.indexOf(item);
    this.items.splice(index, 1);
    item._quadNode = null;
};

QuadNode.prototype.find = function (bound, callback) {
    if (this.childNodes.length != 0) {
        var quad = this.getQuad(bound);
        if (quad != -1) {
            this.childNodes[quad].find(bound, callback);
        } else {
            for (var i = 0; i < this.childNodes.length; i++) {
                var node = this.childNodes[i];
                if (!intersects(node.bound, bound))
                    node.find(bound, callback);
            }
        }
    }
    for (var i = 0; i < this.items.length; i++) {
        var item = this.items[i];
        if (!intersects(item.bound, bound))
            callback(item);
    }
};

// Returns quadrant for the bound.
// Returns -1 if bound cannot completely fit within a child node
QuadNode.prototype.getQuad = function (bound) {
    var isTop = (bound.miny && bound.maxy) < this.bound.cy;
    var isLeft = (bound.minx && bound.maxx) < this.bound.cx;
    if (isLeft) {
        if (isTop) return 1;
        else if (bound.miny > this.bound.cy) return 2; // isBottom
    }
    else if (bound.minx > this.bound.cx) // isRight
    {
        if (isTop) return 0;
        else if (bound.miny > this.bound.cy) return 3; // isBottom
    }
    return -1;  // cannot fit (too large size)
};

function intersects(a, b) {
    return b.minx >= a.maxx ||
        b.maxx <= a.minx ||
        b.miny >= a.maxy ||
        b.maxy <= a.miny;
};
