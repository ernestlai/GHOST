// Union find datastructure with path compression

var UnionFind = function(items) {
  this._sets = items.map(function(el, idx) {
    return {
      id: idx,
      rank: 0,
      parent: idx
    };
  });
}

UnionFind.prototype.find = function(x) {
  p = this._sets[x.id].parent;
  if(p != x.id) {
    this._sets[x.id].parent = this.find(this._sets[p]);
  }
  return this._sets[x.id].parent;
}

UnionFind.prototype.union = function(x, y) {
  xRoot = this._sets[this.find(x)];
  yRoot = this._sets[this.find(y)];
  if(xRoot === yRoot) {
    return;
  }

  if(xRoot.rank < yRoot.rank) {
    xRoot.parent = yRoot.id;
  } else if(xRoot.rank > yRoot.rank) {
    yRoot.parent = xRoot.id;
  } else {
    yRoot.parent = xRoot.id;
    xRoot.rank += 1;
  }
}

UnionFind.prototype.getGroup = function(x) {
  return this.find(x);
}

//MVC using force layout to draw a transmission network

//polyfill polygon with a in poly function
d3.geom.polygon.prototype.contains = function(x, y, poly) {
  // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
  var inside = false;
  for(var i = 0, j = this.length - 1; i < this.length; j = i++) {
    var xi = this[i][0], yi = this[i][1];
    var xj = this[j][0], yj = this[j][1];

    if((yi > y) != (yj > y) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

var dvh = (function(mod) {
  mod.version = '0.0.1';
  return mod;
}(dvh || {}));

var dvh_ghost = (function(dvh) {
  if(!dvh.hasOwnProperty('ghost')) {
    dvh.ghost = {};
  }

  dvh.ghost.logistic = function(m, x) { return m / (1 + Math.pow(Math.E, x)); };

  dvh.ghost.TransmissionNetworkModel = function(graph) {
    var dispatch = d3.dispatch(
      'threshold_change',
      'links_changed',
      'nodes_changed',
      'update_selected'
    );

    var TransmissionNode = function(node, idx) {
      for(var key in node) {
        this[key] = node[key];
      }

      this.id = idx;

      // v_freq is from the 454 pipeline
      if('v_freq' in node) {
        this.genotypes = {};
        this.genotypes[node.genotype] = {
          'n_diversity' : node.v_freq,
          'max_freq' : node.v_freq,
          'total_freq' : node.v_freq
        };
      }

      this.reset();
    };

    TransmissionNode.prototype = {
      reset: function() {
        this._push_out = this.group < 1;

        this._active = true;
        this._dim = false;
        this.size = dvh.ghost.logistic(40, -6*(d3.max(d3.values(this.genotypes), function(d) { return d.n_diversity; })));
        this._selected = false;
        this._label_visible = false;
        this._pinned = false; //hold in place

        this._in_hull = false; // node was inside the highlight hull at last check
        this.fixed = false;
      },
      set selected(val) {
        this._selected = val;
        dispatch.update_selected(this.id);
      },
      get selected() { return this._selected; },

      set active(val) {
        this._active = val;
        dispatch.nodes_changed();
      },
      get active() { return this._active; },

      get label_visible() {
        return (this.active && this._label_visible)?'visible':'hidden';
      },
      set label_visible(val) {
        this._label_visible = val;
        dispatch.nodes_changed();
      },
    };

    var TransmissionLink = function(link, source, target) {
      for(var key in link) {
        this[key] = link[key];
      }

      if(link.shared) {
        this.shared = link.shared;
      } else {
        this.shared = 1;
      }

      if(typeof this.dist === "undefined") {
        // 454 pipeline
        this.dist = link.value;
      }

      this.source = source;
      this.target = target;

      this._active = true;
    };
    TransmissionLink.prototype = {
      get active() { return this._active && this.source.active && this.target.active; },
      set active(val) {
        this._active = val;
        dispatch.links_changed([ this ]);
      }
    };

    var TransmissionNetworkModel = function(graph) {
      var samples = graph.samples;
      if(!samples) {
        samples = graph.nodes;
      }

      this.samples = samples.map(function(el, idx, arr) {
        return new TransmissionNode(el, el.id || idx);
      });

      var nodes = this.samples;
      this.links = graph.links.map(function(el, idx, arr) {
        return new TransmissionLink(el, nodes[el.source], nodes[el.target]);
      });

      this.max_link = Math.max.apply(Math,
        this.links.map(function(el, idx, arr) {
          return el.dist;
      }));

      this._reset();
      this.update_hull();
    };

    TransmissionNetworkModel.prototype = {
      on: function(type, listener) {
        return (arguments.length === 2)?dispatch.on(type, listener):dispatch.on(type);
      },

      _reset: function() {
        this._set_ordinal('group', function(lhs, rhs) { return lhs - rhs; }, true);

        // put the color, shape, and size of each node in the node array rather than recalculating it each time
        this.samples.forEach(function(el, idx, arr) {
          el.reset();
        });

        this.links.forEach(function(el, idx, arr) {
          el._active = true;
        });
      },
      reset: function() {
        this._reset();
        dispatch.nodes_changed();
        dispatch.links_changed();
        dispatch.update_selected();
      },

      set_ordinal: function(key, first_unique) {
        this._set_ordinal(key, first_unique);
        dispatch.nodes_changed(this.samples);
      },

      _set_ordinal: function(key, first_unique) {
        var items = this.samples
          .map(function(el, idx, arr) { return el[key]; })
          .filter(function(el, idx, arr) { return arr.indexOf(el) === idx; })
          .sort(d3.ascending);

        var color_scale = d3.scale.category20();
        var shape_scale = ["circle", "cross", "diamond", "square", "triangle-up"];

        // make sure the 'unlinked' group is the only one to get the first combination of color/shape
        var ord = d3.scale.ordinal().domain(items);

        if(first_unique) {
          ord.range(items.map(function(el, idx) {
          if(idx === 0) {
            return { shape: shape_scale[0], color: color_scale(0) };
          } else {
            var i = idx - 1;
            return {
                shape: shape_scale[Math.floor(i / 19) % shape_scale.length],
                color: color_scale(i % 19 + 1)
              };
            }}));
        } else {
          ord.range(items.map(function(el, idx) {
            return {
              shape: shape_scale[Math.floor(idx / 20) % shape_scale.length],
              color: color_scale(idx % 20)
            }}));
        }

        this.samples.forEach(function(el, idx, arr) {
          el._display_ord = ord(el[key]);
        });
      },

      threshold_links: function(_threshold) {
        var uf = new UnionFind(this.samples);

        var threshold = _threshold;
        if(arguments.length == 0) {
          threshold = DEFAULT_THRESHOLD;
        }
        this.links.forEach(function(el, idx, arr) {
          el._active = el.dist <= threshold;
          if(el._active) {
            uf.union(el.source, el.target);
          }
        });

        this.samples.forEach(function(el, idx, arr) {
          el._curr_group = uf.getGroup(el);
        });

        dispatch.threshold_change(threshold);
        dispatch.links_changed();
      },

      update_hull: function() {
        // non-pushed out nodes form a convex hull that pushed out nodes
        // should avoid. Update the _in_hull to say that the force layout
        // should push on those nodes harder.
        var hull = d3.geom.polygon(d3.geom.hull(
          this.samples
            .filter(function(el, idx, arr) { return !el._push_out; })
            .map(function(el, idx, arr) { return [ el.x + 2, el.y + 2 ]; })
        ));

        this.samples.forEach(function(el, idx, arr) {
          el._in_hull = hull.contains(el.x, el.y);
        });
      },

      update_selected: function(selector) {
        this.samples.forEach(function(el, idx) {
          el._selected = selector && selector(el);
        });
        dispatch.update_selected();
      },

      active: function(selector) {
        var dirty = false;
        var sel = (typeof selector === 'function')?selector:d3.functor(selector);

        this.samples.forEach(function(el, idx) {
          var new_val = sel(el);
          dirty = dirty || new_val != el._active;

          el._active = new_val;
        });

        if(dirty) {
          dispatch.nodes_changed();
          dispatch.links_changed();
        }
      },

      labels_visible: function(selector) {
        var dirty = false;
        var sel = (typeof selector === 'function')?selector:d3.functor(selector);

        this.samples.forEach(function(el, idx) {
          var new_val = sel(el);
          dirty = dirty || new_val != el._label_visible;
          el._label_visible = new_val;
        });

        if(dirty) {
          dispatch.nodes_changed();
        }
      },
    };

    DEFAULT_THRESHOLD = 0.037;
    return new TransmissionNetworkModel(graph);
  };

  dvh.ghost.TransmissionNetorkPresenter = function(model) {
    model.on('nodes_changed.svg_presenter', function() {
      var svg = d3.select('#transmission-network');

      svg.selectAll('.node')
        .data(model.samples)
          .attr("d",
            d3.svg.symbol()
              .type(function(d) { return d._display_ord.shape; })
              .size(function(d) { return Math.pow(d.size, 2); }) // svg's size is based on their square area rather than radius.
          )
          .style('visibility', function(d) {
              return d.active ? 'visible' : 'hidden';
            })
          .attr("fill", function(d) { return d._display_ord.color; })
          .style('fill-opacity', function(d) { return d._dim?0.4:1.0; });

      svg.selectAll('.label')
        .data(model.samples)
        .style('visibility', function(d) { return d.label_visible; })

      redraw_graph();
    });

    model.on('links_changed.svg_presenter', function() {
      var svg = d3.select('#transmission-network');

      svg.selectAll('.link')
        .data(model.links)
          .style('visibility', function(d) {
              if(d.active) {
                return 'visible';
              }

              return 'hidden';
            });

      redraw_graph();
    });

    model.on('update_selected.svg_presenter', function() {
      d3.select('#transmission-network')
        .selectAll('.node')
          .style('stroke', '#FFFF19')
          .style('stroke-width', function(d) { return d._selected ? 3 : 0; });
    });

    $(document).on({
      ready: function(e) {
        e.data.threshold_links();

        var svg = d3.select('#transmission-network');

        // make groups so that nodes are always drawn over links
        // svg uses panter's algorithm so links first, then nodes,
        // finally labels
        svg.append('g').attr('id', 'links');
        svg.append('g').attr('id', 'nodes');
        svg.append('g').attr('id', 'labels');

        svg.select('#nodes').selectAll('.node')
          .data(model.samples).enter()
            .append('path')
              .attr("d",
                d3.svg.symbol()
                  .type(function(d) { return d._display_ord.shape; })
                  .size(function(d) { return Math.pow(d.size, 2); }) // svg's size is based on their square area rather than radius.
                )
              .style('visibility', function(d) {
                  return d.active ? 'visible' : 'hidden';
                })
              .attr("fill", function(d) { return d._display_ord.color; })
              .style('fill-opacity', function(d) { return d._dim?0.4:1.0; })
              .style('stroke-width', function(d) { return d._selected?3:0; })
              .attr("class", "node context-menu-node")
              .attr('id', function(d) { return 'node_' + d.id; })
              .attr('title', function(d) { return d.name +
                            '\ngenotype: ' + d.genotype +
                            '\nlinks: ' + d.weight; })
            .call(flayout.drag);

        svg.select('#links').selectAll('.link')
          .data(model.links).enter()
            .append('line')
            .attr('class', 'link')
            .style('stroke-with', 3)
            .style('stroke', '#736F6E');

        svg.select('#labels').selectAll('.label')
          .data(model.samples).enter()
            .append("text")
              .attr('class', 'label')
              .attr('dx', 12)
              .attr('dy', '.30em')
              .style('visibility', function(d) {
                return d.label_visible;
              })
              .text(function(d) { return d.name; });
      },
    }, null, model);

    $('#thresholdNumber').on({
      'change input' : function(e) {
        e.data.threshold_links(e.target.valueAsNumber);
      },
    }, null, model);

    return model;
    };
  }(dvh || { }));
