// The initial zoom is set so the viewport is visible; this is a rectangle on
// the x-y plane.  The player can change the view by dragging the middle mouse
// button to rotate and holding shift while doing it to pan, and scroll to
// zoom.
viewport = [-2, -2, 2, 2];

// The init function is called after all the assets have loaded.  It should set
// up variables, but not the game; it is not called again when a game is
// finished and a new game is started.
function init() {
	// This variable can be used to create the objects.
	var monkey = please.access('monkey.jta');
	for (var i = 0; i < 3; ++i) {
		// Create a monkey head.
		var m = monkey.instance();
		// Add it to the graph, so it is part of the world.
		graph.add(m);
		// Set its location.
		m.location = [i * 4, 0, 0];
		// Add a message to it.  please.overlay.new_element() creates a
		// div with some extra features, most notably bind_to_node.
		// AddText is a shorthand for adding a text node to an element.
		// It returns the element, so it can be used in expressions.
		var message = please.overlay.new_element().AddText('This is monkey ' + i);
		// bind_to_node lets the div move with the object that it is
		// bound to.
		message.bind_to_node(m);
	}
}
