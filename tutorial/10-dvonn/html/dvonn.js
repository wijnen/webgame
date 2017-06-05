// use strict;

viewport = [0, -1, 12, 5];
// Global variables.
piles = {};

function Pile() { // {{{
	// Build the pile.
	var self = this;
	this.data = [];
	this.redraw = function(node) { // {{{
		if (self.data.length == 0)
			return;
		node.context.beginPath();
		node.context.arc(0, 0, .45, 0, 2 * Math.PI);
		var alive = false;
		for (var i = 0; i < self.data.length; ++i) {
			if (self.data[i] == -1) {
				alive = true;
				break;
			}
		}
		var owner = self.data[self.data.length - 1];
		node.context.fillStyle = {'-1': 'red', '0': 'white', '1': 'black'}[owner];
		node.context.fill();
		node.context.strokeStyle = alive ? 'red' : 'gray';
		node.context.lineWidth = .1;
		node.context.stroke();
	}; // }}}
	this.node = new_canvas(1, 1, this.redraw);
	this.div = please.overlay.new_element(this.node);
	this.div.style.pointerEvents = 'none';
	this.div.style.color = 'green';
	this.node.canvas.style.pointerEvents = 'auto';
	this.node.canvas.onclick = function() { // {{{
		console.info(Private.options, Private.targets, self.x, self.y);
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
		please.overlay.remove_element(this.div);
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
		self.div.ClearAll().AddText(data.length);
		self.data = data;
		self.redraw(this.node);
	}; // }}}
} // }}}

function update_pos(pos) { // {{{
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
	// Clear the board.
	for (var pos in Public.board)
		update_pos(pos);
	please.renderer.overlay.style.pointerEvents = 'none';
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

function update_canvas(ctx) { // {{{
	ctx.beginPath();
	for (var i = 0; i < 11; ++i) {
		for (var j = 0; j < 5; ++j) {
			if (i + j < 2 || i + j > 12)
				continue;
			var x = i + .5 * j;
			var y = j;
			ctx.moveTo(x + .45, y);
			ctx.arc(x, y, .45, 0, 2 * Math.PI);
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
