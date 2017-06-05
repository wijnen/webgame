viewport = [-3, -3, 3, 3];

var objects;

function init() {
	objects = please.access('objects.jta').instance();
	graph.add(objects);
	theta = 5;
}

function new_game() {
	// The play function will run the named action.  This will change the
	// location of the bones (which are nodes in M.GRL).  If you want to
	// combine a prepared action with a scripted animation, you probably
	// want to move the armature in your script, not the meshes.
	objects.play('hit');
}
