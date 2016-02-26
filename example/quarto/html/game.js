// vim: set foldmethod=marker :

/* Quarto: simple game to demonstrate the use of the python-webgame system.
   This is a two player game.  Every turn, one player picks a piece and the other
   player places it on the board.  The player who makes 4 in a row with a common
   property wins.  There are four properties: size, color, open/closed and shape.
   On the left are the pieces that can be selected, on the right is the board.

   The main purpose of this game is to serve as an example for how games can be
   made with the python-webgame module.  This is a simple example that only shows
   the basics.
 */

// This variable is defined by the module.  The viewport is automatically
// scaled to keep this region in view.  If the aspect ratio is different, only
// one dimension will match the window size; the other will have a larger view.
viewport = [-5, -3, 5, 3];

// Global variables. {{{
var pieces; // array of 16 overlay elements.
var choice; // overlay element.
var used; // for each piece, where it is placed, or null.
// }}}

// This function is called after all assets are loaded.  It should be used to
// set up the state, but not to initialize a game.
function init() { // {{{
	// Create choice. {{{
	choice = new_div(1, 1, 1, 1, 'choice');
	choice.visible = false;
	choice.div.style.background = '#fc4';
	// }}}
	// Create pieces. {{{
	pieces = [];
	used = [];
	for (var p = 0; p < 16; ++p) {
		// Use a function so every piece has its own p variable.
		var makepiece = function(p) {
			var piece = new_canvas(1, 1, 'piece-' + p, function(node) {
				var c = node.context;
				c.beginPath();
				c.lineWidth = .1;
				var style = playercolor(p & 1 ? 2 : 3);
				if (p & 4)
					c.arc(0, 0, p & 2 ? .2 : .4, 0, 2 * Math.PI, true);
				else if (p & 2)
					c.rect(-.2, -.2, .4, .4);
				else
					c.rect(-.4, -.4, .8, .8);
				if (p & 8) {
					c.strokeStyle = style;
					c.stroke();
				}
				else {
					c.fillStyle = style;
					c.fill();
				}
			});
			return piece;
		};
		pieces.push(makepiece(p));
		used.push(null);
	}
	// }}}
	please.renderer.overlay.AddEvent('click', click);
} // }}}

// Non-standard function registered in init.  It responds to pointer clicks.
function click(event) { // {{{
	// Get clicked tile.
	var pos = please.dom.pos_from_event(event.pageX, event.pageY);
	var x = Math.round(pos[0]);
	var y = Math.round(pos[1] + 1.5);
	// Must be valid y coordinate.
	if (y < 0 || y >= 4)
		return;
	// For x < 0, check if we are picking, and if x is valid.
	if (x < 0) {
		if (!Private.pick)
			return;
		x += 4;
		if (x < 0 || x >= 4)
			return;
		// If the piece is valid, send the pick to server.
		var piece = y * 4 + x;
		if (Public.pieces[piece] === null)
			return;
		server.call('pick', [piece]);
	}
	else {
		// x > 0: place on board, if we are placing, x is valid and the position is valid.
		if (!Private.place)
			return;
		x -= 1;
		if (x < 0 || x >= 4)
			return;
		if (Public.board[y][x] != null)
			return;
		server.call('place', [x, y]);
	}
} // }}}

// If this function exists, it is called whenever the canvas changes size.  It
// is used to draw a background on the canvas.  The argument is the 2-D
// context, which is prepared to accept game coordinates.
function update_canvas(c) { // {{{
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
			mark(x - 4, y - 1.5);
			mark(x + 1, y - 1.5);
		}
	}
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
			var stamp = performance.now();
			if (stamp < start + 1000) {
				// please.mix interpolates on a line, so change the line, not the path.
				offset = Math.sin(Math.PI / 1000 * (stamp - start));
				return please.mix([x0, y0 + offset, 2], [x1, y1 + offset, 1], (stamp - start) / 1000);
			}
			return please.mix([x1, y1, 1], [x1, y1 + .3, 1], Math.abs(Math.sin((stamp - start - 1000) * 2 * Math.PI / 1000)));
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
function end(code) {
	if (code === null)
		alert('No winner.');
	else {
		if (Public.players[code].name == my_name)
			alert('You won!');
		else
			alert('You lost!');
	}
}
