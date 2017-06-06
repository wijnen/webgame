// use strict;

viewport = [0, -1, 12, 5];
// Global variables.
piles = {};

// This class handles a pile of tiles.  After creation, it must be set() to its
// position.  A pile of tiles is represented in the browser as a canvas on
// which the top tile is drawn, with a border indicating if there is a red tile
// in the pile.  On top of the canvas there is an overlay div with the number
// of tiles in the pile.
function Pile() { // {{{
	// Build the pile.
	var self = this;
	this.data = [];
	// This function is registered below to be called when the canvas
	// changes.  It is also called by this program when the contents have
	// changed.
	this.redraw = function(node) { // {{{
		// Ignore redraw events before set() is called.
		if (self.data.length == 0)
			return;
		// Draw a circle; make the size depend on the number of tiles.
		var r = self.data.length >= 5 ? .45 : .2 + .05 * self.data.length;
		node.context.beginPath();
		node.context.arc(0, 0, r, 0, 2 * Math.PI);
		// Find out whether there is a red tile in the pile.
		var alive = false;
		for (var i = 0; i < self.data.length; ++i) {
			if (self.data[i] == -1) {
				alive = true;
				break;
			}
		}
		var owner = self.data[self.data.length - 1];
		// Draw the tile and the border.
		node.context.fillStyle = {'-1': 'red', '0': 'white', '1': 'black'}[owner];
		// Use colors with high contrast.  Don't use a single color
		// that works on all backgrounds, such as green, because that
		// doesn't work well for color blind people.
		node.overlay_div.style.color = {'-1': 'white', '0': 'black', '1': 'white'}[owner];
		node.context.fill();
		node.context.strokeStyle = alive ? 'red' : 'gray';
		node.context.lineWidth = .1;
		node.context.stroke();
	}; // }}}
	// Create a canvas of size (1,1) in world coordinates and register the
	// redraw function.
	this.node = new_canvas(1, 1, this.redraw);
	// Create the overlay on top of it with the number of tiles.
	// Make it a member of the node, so its color can be easily changed in redraw.
	this.node.overlay_div = please.overlay.new_element(this.node);
	// Disable pointer events on overlay, so the canvas can handle them.
	this.node.overlay_div.style.pointerEvents = 'none';
	this.node.canvas.style.pointerEvents = 'auto';
	this.node.canvas.onclick = function() { // {{{
		if (Private.options !== undefined && Private.options[self.x + '.' + self.y] !== undefined) {
			server.pick(self.x + '.' + self.y);
			return;
		}
		if (Private.targets !== undefined) {
			for (var i = 0; i < Private.targets.length; ++i) {
				if (Private.targets[i][0] == self.x && Private.targets[i][1] == self.y) {
					server.place([self.x, self.y]);
					return;
				}
			}
		}
	}; // }}}
	this.kill = function() { // {{{
		// Kill the pile.
		please.overlay.remove_element(this.node.overlay_div);
		del_canvas(this.node);
	}; // }}}
	this.set = function(x, y, data) { // {{{
		if (data === undefined || data.length == 0) {
			self.kill();
			return;
		}
		// Change the pile.
		self.x = x;
		self.y = y;
		self.node.location = [x + y * .5, y, 0];
		self.node.overlay_div.ClearAll().AddText(data.length);
		self.data = data;
		self.redraw(this.node);
	}; // }}}
} // }}}

function update_pos(pos) { // {{{
	// Update a single pile based on the information in Public.
	// Create data structures as needed.
	var active = Public.board[pos] !== undefined && Public.board[pos].length > 0;
	var parts = pos.split('.');
	var x = Number(parts[0]);
	var y = Number(parts[1]);
	if (piles[y] === undefined) {
		if (!active)
			return;
		piles[y] = {};
	}
	var row = piles[y];
	if (row[x] === undefined) {
		if (!active)
			return;
		row[x] = new Pile();
	}
	row[x].set(x, y, Public.board[pos]);
} // }}}

function new_game() { // {{{
	// Update the board to the current situation.
	// This may not be empty; a game can be joined while it is in progress.
	for (var pos in Public.board)
		update_pos(pos);
	please.renderer.overlay.style.pointerEvents = 'none';
	// Allow pointer events on background for setup phase.
	please.dom.canvas.style.pointerEvents = 'auto';
	please.dom.canvas.onclick = function(event) {
		var pos = pos_from_event(event);
		var x = Math.round(pos[0] - pos[1] / 2);
		var y = Math.round(pos[1]);
		if (Private.setup !== undefined) {
			for (var i = 0; i < Private.setup.length; ++i) {
				if (Private.setup[i][0] == x && Private.setup[i][1] == y) {
					server.setup([x, y]);
					break;
				}
			}
		}
	};
} // }}}

function Public_update(changes) { // {{{
	if (!changes.board)
		return;
	for (var pos in changes.board)
		update_pos(pos);
} // }}}

// This function is called automatically when the background needs to be updated.
function update_canvas(ctx) { // {{{
	ctx.beginPath();
	for (var i = 0; i < 11; ++i) {
		for (var j = 0; j < 5; ++j) {
			if (i + j < 2 || i + j > 12)
				continue;
			var x = i + .5 * j;
			var y = j;
			var r = .1;
			ctx.moveTo(x + r, y);
			ctx.arc(x, y, r, 0, 2 * Math.PI);
		}
	}
	ctx.fillStyle = '#ccc';
	ctx.fill();
} // }}}

function end(score) { // {{{
	while (piles.length > 0) {
		var row = piles.pop();
		for (var i = 0; i < row.length; ++i)
			row[i].kill()
	}
	console.info('game ended', score);
} // }}}
