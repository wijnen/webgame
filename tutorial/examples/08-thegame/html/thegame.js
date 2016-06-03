// use strict;
viewport = [-4, 0, 4, 4];

var piles;	// Array of 4 tiles; current piles.
var hand;	// Array of hand tiles.
var end;	// Tile to click for end of turn.
var selected;	// Index into hand of currently selected tile.
var tile;	// Array of all numbered tiles (1, 1, 2, ..., 99, 100, 100)

function init() {
	// Create all objects.
	selected = null;
	piles = [];
	hand = [];
	end = please.access('tile.jta').instance();
	end.on_click = function() {
		if (!can_end())
			return;
		server.call('play', [null, null]);
	};
	end.selectable = true;
	end.location = [0, -1, 0];
	end.scale = [.3, .3, .05];
	graph.add(end);
	tile = [];
	for (var i = 0; i <= 101; ++i) {
		var t = please.access('tile.jta').instance();
		// Create a new texture for this tile.
		var c = Create('canvas');
		c.width = 256;
		c.height = 256;
		var ctx = c.getContext('2d');
		ctx.translate(128, 128);
		t.rotation_z = -90;
		// There are two "1" tiles, two "100" tiles, and one of every
		// other number.
		// See the Blender file for how the texture should look.
		name = String(i > 0 ? i <= 100 ? i : 100 : 1);
		ctx.fillStyle = '#888';
		ctx.fillRect(-128, -128, 256, 256);
		ctx.fillStyle = '#cf3';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.scale(3, 3);
		ctx.fillText(name, 0, 0);
		// Assign the canvas to an asset M.GRL can use.
		please.media.assets[name] = c;
		// Make the object use the new asset as a texture.
		t.shader.diffuse_texture = name;
		tile.push(t);
		t.visible = false;
		// Note that the default scale is not [1, 1, 1], but whatever
		// was set in Blender; in this case [1, 1, .1].
		t.scale = [.5, .5, .05];
		t.selectable = true;
		graph.add(t);
	}
	graph.picking.enabled = true;
}

function set_pile(i, value) {
	// Set a pile to a tile.
	// Use tiles 0 and 101 for outer tiles.
	if (i == 0 && value == 1)
		value = 0;
	if (i == 3 && value == 100)
		value = 101;
	piles[i] = tile[value];
	piles[i].visible = true;
	piles[i].on_click = function() { click_pile(i); };
	piles[i].location = [i * 2 - 3, 1, 0];
	piles[i].scale = [.5, .5, .05];
}

function set_hand(i, value, num) {
	// Set a hand tile.
	hand[i] = tile[value[0]];
	hand[i].visible = true;
	hand[i].on_click = function() { click_hand(i); };
	hand[i].location = [i - (num - 1) / 2, 0, 0];
	hand[i].scale = [.4, .4, .05];
}

function update() {
	for (var i = 0; i < piles.length; ++i)
		piles[i].visible = false;
	for (var i = 0; i < hand.length; ++i)
		hand[i].visible = false;
	// Update piles.
	for (var i = 0; i < Public.piles.length; ++i)
		set_pile(i, Public.piles[i]);
	piles.length = Public.piles.length;
	// Build new hand.
	for (var i = 0; i < Private.hand.length; ++i)
		set_hand(i, Private.hand[i], Private.hand.length);
	hand.length = Private.hand.length;
}

function can_end() {
	return selected === null && Public.players[Public.turn].name == my_name && Public.played >= Public.minplay;
}

function unselectable_pile(i) {
	if (selected !== null)
		return !Private.hand[selected][1][i];
	for (var k = 0; k < Private.hand.length; ++k) {
		if (Private.hand[k][1][i])
			return false;
	}
	return true;
}

function unselectable_hand(i) {
	for (var k = 0; k < Private.hand[i][1].length; ++k) {
		if (Private.hand[i][1][k])
			return false;
	}
	return true;
}

function click_pile(i) {
	console.info('click pile');
	if (selected === null || Public.players[Public.turn].name != my_name)
		return;
	server.call('play', [Private.hand[selected][0], i]);
	selected = null;
}

function click_hand(i) {
	console.info('click hand');
	if (selected == i)
		selected = null;
	else
		selected = i;
}
