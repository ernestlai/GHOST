var UnionFind = function (items) { // Union find datastructure with path compression
    this._sets = items.map(function (el, idx) {
        return {
            id: idx,
            rank: 0,
            parent: idx
        };
    });
}

UnionFind.prototype.find = function (x) {
    p = this._sets[x.id].parent;
    if (p != x.id) {
        this._sets[x.id].parent = this.find(this._sets[p]);
    }
    return this._sets[x.id].parent;
}

UnionFind.prototype.union = function (x, y) {
    xRoot = this._sets[this.find(x)];
    yRoot = this._sets[this.find(y)];
    if (xRoot === yRoot) {
        return;
    }

    if (xRoot.rank < yRoot.rank) {
        xRoot.parent = yRoot.id;
    } else if (xRoot.rank > yRoot.rank) {
        yRoot.parent = xRoot.id;
    } else {
        yRoot.parent = xRoot.id;
        xRoot.rank += 1;
    }
}

UnionFind.prototype.getGroup = function (x) {
    return this.find(x);
}