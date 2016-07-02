// use strict;
viewport = [-4, 0, 4, 4];

// Public.board: Array of 4 arrays of card numbers.
// Public.scores: Array of scores.
// Private.hand: Array of hand cards.

var cards;	// Array of all cards

function init() {
	// Create all objects.
	hand = [];
	cards = [undefined];	// card[0] is invalid.
	for (var i = 1; i <= 104; ++i) {
		var card = please.access('card.jta').instance();
		// Create a new texture for this tile.
		var c = Create('canvas');
		c.width = 256;
		c.height = 256;
		var ctx = c.getContext('2d');
		ctx.translate(128, 128);
		// See the Blender file for how the texture should look.
		name = String(i);
		ctx.fillStyle = '#888';
		ctx.fillRect(-128, -128, 256, 256);
		if (i == 55)
			ctx.fillStyle = '#f00';
		else if (i % 10 == 0)
			ctx.fillStyle = '#f44';
		else if (i % 10 == 5)
			ctx.fillStyle = '#fc8';
		else
			ctx.fillStyle = '#4c4';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.scale(6, 6);
		ctx.fillText(name, 0, 0);
		// Assign the canvas to an asset M.GRL can use.
		please.media.assets[name] = c;
		// Make the object use the new asset as a texture.
		card.shader.diffuse_texture = name;
		cards.push(card);
		card.visible = false;
		card.selectable = true;
		card.scale = [.8, .8, 1];
		graph.add(card);
	}
	graph.picking.enabled = true;
}

function update() {
	for (var i = 1; i < cards.length; ++i)
		cards[i].visible = false;
	// Update board.
	for (var b = 0; b < Public.board.length; ++b) {
		for (var i = 0; i < Public.board[b].length; ++i)
			set_board(b, i, Public.board[b][i]);
	}
	// Update hand.
	for (var i = 0; i < Private.hand.length; ++i)
		set_hand(i, Private.hand[i]);
}

function set_board(b, i, c) {
	cards[c].visible = true;
	cards[c].on_click = function() { click_board(b); };
	cards[c].location = [i, b, 0];
}

function set_hand(i, c) {
	cards[c].visible = true;
	cards[c].on_click = function() { click_hand(i); };
	cards[c].location = [i - 4.5, -1.5, 0];
}

function click_board(row) {
	if (!Private.taking)
		return;
	server.take(row);
}

function click_hand(i) {
	if (!Private.choosing)
		return;
	console.info('choose');
	server.choose(Private.hand[i]);
}
