viewport = [-2, -2, 2, 2];
var club, left, right;

function init() {
	var objects = please.access('objects.jta').instance();
	// The node_lookup attribute allows using objects from inside a jta
	// instance.  The names are set in Blender.
	left = objects.node_lookup['left'];
	right = objects.node_lookup['right'];
	// Add the parts (not the jta itself) to the graph.
	graph.add(left);
	graph.add(right);
	club = objects.node_lookup['club'];
	graph.add(club);
	// Set the initial camera angle so the scene can be seen properly.
	// There are three variables to change the camera: theta, phi and r.
	// The initial value for r is computed from the viewport.  It is also
	// possible to change camera.location, but that will override the
	// ability to use mouse navigation.
	theta = 5;
}

// This function is called when a new game is started.  It should set up
// everything for the game.  When the player leaves the game and enters a new
// game, this function is called again.
// The differences between init and new_game are:
// * init is called when the page is loaded, before joining a game, new_game
//   is called when a new game is joined.
// * init is called exactly once, new_game is called again when a new game is
//   joined after leaving the previous game.
function new_game() {
	// Reset the locations; some parts are immediately changed below.
	left.location = [0, -1, 0];
	right.location = [0, 1, 0];
	club.location = [0, 0, 2];
	// Use a shift_driver to move the club.
	club.location_z = please.shift_driver(2, -1, 2000);
	// Use a custom function to move the parts.
	left.rotation_x = breaking(-1);
	right.rotation_x = breaking(1);
}

// This function is used as a driver for rotation.  A driver must be a
// function; it is called whenever a new frame will be drawn.
function breaking(dir) {
	// Record the start time, so we know what to show later.
	var start = performance.now();
	// Nothing should happen before the club hits the stick.  It moves 3
	// units in 2000 ms and hits the stick after 2 units.
	var begin = 2000 / 3 * 2;
	// Speed of rotation.
	var degrees_per_s = 90;
	// This is the function that will be called for every frame.  It
	// returns the rotation.
	var ret = function() {
		// Use current and start time to determine phase.
		var t = performance.now() - start;
		// Don't do anything at first.
		if (t < begin)
			return 0;
		t -= begin;
		// 1 second after impact, stop rotating.
		if (t > 1000)
			t = 1000;
		// Rotate at a constant speed.
		return t * dir * degrees_per_s / 1e3;
	};
	return ret;
}
