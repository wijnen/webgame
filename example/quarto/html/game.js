// vim: set foldmethod=marker :

/* Quarto: simple game to demonstrate the use of the python-webgame system. {{{
   This is a two player game.  Every turn, one player picks a piece and the other
   player places it on the board.  The player who makes 4 in a row with a common
   property wins.  There are four properties: size, color, open/closed and shape.
   On the left are the pieces that can be selected, on the right is the board.

   The main purpose of this game is to serve as an example for how games can be
   made with the python-webgame module.  This is a simple example that only shows
   the basics.
   }}} */

// This variable is defined by the module.  The 2-D viewport is automatically
// scaled to keep this region in view.  The initial 3-D viewport is also set up
// this way, but it can be changed by the user.  If the aspect ratio is
// different, only one dimension will match the window size; the other will
// have a larger view.
viewport = [-5, -3, 5, 3];

// Global variables. {{{
var pieces; // array of 16 overlay elements.
var choice; // overlay element.
var used; // for each piece, where it is placed, or null.
var yoffset, zoffset; // how to move a piece into place.
// }}}

// This function is called after all assets are loaded.  It should be used to
// set up the state, but not to initialize a game.
function init_2d() { // {{{
	// Create choice. {{{
	choice = new_div(1, 1, 1, 1, 'choice');
	choice.div.style.background = '#fc4';
	// }}}
	board = new_canvas(4, 4, 'board', function(node) {
		var c = node.context;
		var mark = function(x, y) { // {{{
			c.beginPath();
			c.moveTo(x - .25, y - .25);
			c.lineTo(x + .25, y + .25);
			c.moveTo(x - .25, y + .25);
			c.lineTo(x + .25, y - .25);
			c.lineWidth = .05;
			c.strokeStyle = '#ccc';
			c.stroke();
		}; // }}}
		for (var y = 0; y < 4; ++y) {
			for (var x = 0; x < 4; ++x) {
				mark(x - 1.5, y - 1.5);
			}
		}
	});
	// Create pieces. {{{
	pieces = [];
	for (var p = 0; p < 16; ++p) {
		// Use a function so every piece has its own p variable.
		var makepiece = function(p) {
			var piece = new_canvas(1, 1, 'piece-' + p, function(node) {
				var c = node.context;
				c.beginPath();
				c.lineWidth = .1;
				var style = playercolor(p & 1 ? 2 : 3);
				if (p & 8)
					c.arc(0, 0, p & 4 ? .2 : .4, 0, 2 * Math.PI, true);
				else if (p & 4)
					c.rect(-.2, -.2, .4, .4);
				else
					c.rect(-.4, -.4, .8, .8);
				if (p & 2) {
					c.fillStyle = style;
					c.fill();
				}
				else {
					c.strokeStyle = style;
					c.stroke();
				}
			});
			return piece;
		};
		pieces.push(makepiece(p));
	}
	// }}}
	yoffset = function(dt) { return Math.sin(Math.PI / 1000 * dt); };
	zoffset = function() { return 0; };
} // }}}

function init_3d() { // {{{
	var instance = please.access('tiles.jta').instance();
	choice = instance.node_lookup['choice'];
	graph.add(choice);
	pieces = [];
	for (var p = 0; p < 16; ++p) {
		pieces.push(instance.node_lookup[String(p)]);
		graph.add(pieces[p]);
	}
	board = please.access('board.jta').instance();
	graph.add(board);
	graph.picking.enabled = true;
	graph.picking.skip_location_info = false;
	yoffset = function() { return 0; };
	zoffset = function(dt) { return Math.sin(Math.PI / 1000 * dt); };
} // }}}

function init() { // {{{
	choice.visible = false;
	used = [];
	for (var p = 0; p < 16; ++p) {
		(function(p) {
			// Use a function so every piece has its own p variable.
			used.push(null);
			pieces[p].selectable = true;
			pieces[p].on_click = function() {
				click(p);
			};
		})(p);
	}
	board.location = [2.5, 0, 0];
	board.selectable = true;
	board.on_click = function(event) {
		click_board(event.local_location[0], event.local_location[1]);
	}
} // }}}

// Non-standard functions registered in init.  They responds to pointer clicks.
function click(piece) { // {{{
	// Check if we are picking and the tile is not placed yet.
	if (!Private.pick || Public.pieces[piece] === null)
		return;
	server.call('pick', [piece]);
} // }}}

function click_board(x, y) { // {{{
	// Check that we are placing and the space is empty.
	x = Math.trunc(x + 2);
	y = Math.trunc(y + 2);
	if (!Private.place || Public.board[y][x] !== null)
		return;
	server.call('place', [x, y]);
} // }}}

// If this function exists, it is called whenever the canvas changes size.  It
// is used to draw a background on the canvas.  The argument is the 2-D
// context, which is prepared to accept game coordinates.
function update_canvas(c) { // {{{
	c.lineWidth = .1;
	c.strokeStyle = '#ccc';
	c.strokeRect(-4.6, -2.1, 4.2, 4.2);
} // }}}

// The update function is called whenever there is a change in the Public or
// Private global variables.  Those automatically follow the server's
// self.public and self.players[].private variables respectively.
function update() { // {{{
	// Ignore updates until everything is complete.
	if (!Public.board || !Public.pieces || !Public.bounce)
		return;
	// Place unused pieces on the left.
	for (var p = 0; p < 16; ++p) {
		if (Public.pieces[p] !== null) {
			pieces[p].location = [Math.trunc(p & 3) - 4, Math.trunc(p / 4) - 1.5, 1];
			used[p] = null;
		}
	}
	// Driver for moving a piece into its position.
	var start = performance.now();
	var move_piece = function(p, x, y) {
		var x1 = x + 1;
		var y1 = y - 1.5;
		var x0 = p === null ? x1 : Math.trunc(p & 3) - 4;
		var y0 = p === null ? y1 : Math.trunc(p / 4) - 1.5;
		return function() {
			var dt = performance.now() - start;
			if (dt < 1000) {
				// please.mix interpolates on a line, so change the line, not the path.
				return please.mix([x0, y0 + yoffset(dt), 1 + zoffset(dt)], [x1, y1 + yoffset(dt), 1 + zoffset(dt)], dt / 1000);
			}
			return [x1, y1 + .3 * yoffset(dt % 1000), 1 + zoffset(dt % 1000)]
		};
	}
	// Place used pieces on the board.
	for (var y = 0; y < 4; ++y) {
		for (var x = 0; x < 4; ++x) {
			var p = Public.board[y][x];
			if (p !== null) {
				if (Public.bounce[p]) {
					if (used[p] === null)
						pieces[p].location = move_piece(p, x, y);
					else if (!used[p])
						pieces[p].location = move_piece(null, x, y);
				}
				else
					pieces[p].location = [x + 1, y - 1.5, 1];
				used[p] = Public.bounce[p];
			}
		}
	}
	// Place choice under selected piece.
	if (Public.piece !== null) {
		choice.visible = true;
		choice.location = [Math.trunc(Public.piece & 3) - 4, Math.trunc(Public.piece / 4) - 1.5, 0];
	}
	else
		choice.visible = false;
} // }}}

// This function is called when the game ends.  For this game, it passes the
// player number of the winner.
// After this function is called, no more commands are accepted by the server
// (except "leave").
function end(code) { // {{{
	if (code === null)
		alert('No winner.');
	else {
		if (Public.players[code].name == my_name)
			alert('You won!');
		else
			alert('You lost!');
	}
} // }}}
