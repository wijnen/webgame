viewport = [-2, -2, 2, 2];
var w = 3, h = 3, tiles;

function make_tile(x, y) {
	var tile = please.access('tile.jta').instance();
	tiles.push(tile);
	tile.location = [x - 1, y - 1, 0];
	graph.add(tile);
	// Set selectable to true to make it respond to pointer click events.
	tile.selectable = true;
	// The on_click function is called when the object is clicked.
	tile.on_click = function() { server.flip(x, y); };
}

function init() {
	tiles = [];
	for (var y = 0; y < h; ++y) {
		for (var x = 0; x < w; ++x)
			make_tile(x, y);
	}
	// No clicks are handled unless this is set.
	graph.picking.enabled = true;
}

function update() {
	for (var y = 0; y < h; ++y) {
		for (var x = 0; x < w; ++x) {
			var p = w * y + x;
			if ((tiles[p].rotation_x == 0) ^ Public.board[p])
				continue;
			var r = Public.board[p] ? 180 : 0;
			tiles[p].rotation_x = please.shift_driver(180 - r, r, 1000);
		}
	}
}

function end(code) {
	// Allow animation to complete before showing alert.
	setTimeout(function() { alert('Well done!'); }, 1500);
}
