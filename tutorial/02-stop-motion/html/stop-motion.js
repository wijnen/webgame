viewport = [-2, -2, 6, 2];

var monkey;
var text;

function init() {
	// Only one instance is required, so just create it right away.
	monkey = please.access('monkey.jta').instance();
	graph.add(monkey);
	// Create an empty graph node; it can be transformed, but is not shown.
	// It is used below to link the text to.
	var above = new please.GraphNode();
	// Add it to the monkey (not the graph) so it moves with the monkey.
	monkey.add(above);
	// Its location is 1.2 units above the monkey's location.
	above.location = [0, 0, 1.2];
	text = please.overlay.new_element();
	text.bind_to_node(above);
}

// The update function is called whenever a shared object is changed.  In this
// program the only shared object is Public.monkey, so it is called when that
// is changed.
function update() {
	// Set the monkey's location and rotation from the info.
	monkey.location = [Public.monkey[0], Public.monkey[1], 0];
	monkey.rotation_z = Public.monkey[2];
	// Simital to AddText, ClearAll is a convenience function that removes
	// all child elements and returns the object.
	text.ClearAll().AddText(Public.monkey[3]);
}
