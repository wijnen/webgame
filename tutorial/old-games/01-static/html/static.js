// This file defines the interface for the game.
// In this example, that is just a sinple object; there is no movement.

// Everything is defined in window[gamename]. If gamename is a valid
// identifier, this is convenient, because properties can be referenced as
// gamename.viewport. But for gamenames that aren't valid identifiers, it needs
// to be written as window['gamename'].viewport, which is invonvenient. To make
// it easier, the variable game is set to this game. But note that this will
// change after the file is first run. So inside functions, don't use "game" to
// refer to the current game.

// Most objects in this file allow a "2d" or "3d" suffix. If given, that
// variable is used for the respective interface. An object without a suffix is
// used for both interfaces.

// The initial zoom is set so the viewport is visible; this is a rectangle on
// the x-y plane.  The player can change the view by dragging the middle mouse
// button to rotate and holding shift while doing it to pan, and scroll to
// zoom.
game.viewport = [-2, -2, 2, 2];

// The ui object should define everything on screen. It is extremely flexible,
// but for this example there is only a simple static object.
game.ui = {
	// Every element in ui has a name. Later tutorials will explain more
	// about it. If the name is not recognized, a static object will be
	// created from it.
	'monkey': {
		// Like at top level, keys in these objects can have a "2d" or
		// "3d" suffix to apply them only for that interface.

		// Additionally, values can be functions, which will be called
		// to retrieve the value of the property.

		// The model key is only used for 3d objects. Its value must be
		// an existing jta file.
		// If there is also a 2-D interface, it usually uses an image
		// instead.
		model: 'monkey.jta',

		// The location in user coordinates (fits with the viewport).
		location: [0, 0, 0],

		// If an overlay is given, there will be a div at some offset
		// from the object. The value is the relative position of the
		// overly from the object location.
		overlay: [0, 0, 0],

		// If a text is given, it will be placed in the overlay.
		text: "Hi, I'm Suzanne!"
	}
};
