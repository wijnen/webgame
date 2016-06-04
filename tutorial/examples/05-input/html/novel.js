viewport = [-4, -3, 4, 3];
var scene;
var text_tag, question_tag;
var current;

function init() {
	var person = please.access('pac.jta');
	var teacher = person.instance();
	var node = new please.GraphNode();
	text_tag = new please.overlay.new_element();
	graph.add(teacher);
	teacher.add(node);
	text_tag.bind_to_node(node);
	node.location = [0, 0, 1];
	teacher.location = [-3, 0, 0];
	teacher.rotation_z = 90;
	var kids = [];
	for (var y = 0; y < 3; ++y) {
		for (var x = 0; x < 3; ++x) {
			var kid = person.instance();
			kid.scale = [.6, .6, .6];
			graph.add(kid);
			kid.location = [x, y - 1, 0];
			kid.rotation_z = -90;
			kids.push(kid);
		}
	}
	node = new please.GraphNode();
	node.location = [0, 0, 1];
	kids[4].add(node);
	question_tag = please.overlay.new_element();
	question_tag.bind_to_node(node);
	question_tag.style.pointerEvents = 'auto';
}

function new_game() {
	current = 0;
}

function update() {
	current = 0;
	next();
}

function next() {
	var item = Public.scene[current];
	if (typeof item == 'string') {
		text_tag.ClearAll().AddText(item);
		var button = question_tag.ClearAll().AddElement('button').AddText('Ok');
		button.type = 'button';
		button.AddEvent('click', function() {
			current += 1;
			if (current < Public.scene.length)
				next();
			else
				question_tag.ClearAll();
		});
	}
	else {
		if (item.length == 1) {
			// If there is only one option, it must be chosen.
			// Call the choose command in the server, with this option.
			server.choose(item[0]);
		}
		else {
			text_tag.ClearAll().AddText(item[0]);
			question_tag.ClearAll();
			for (var i = 1; i < Public.scene[current].length; ++i) {
				var button = question_tag.AddElement('button').AddText(item[i][0]);
				button.type = 'button';
				button.scene = item[i][1];
				button.AddEvent('click', function() {
					// Call the choose command in the server, with the selected option.
					server.choose(this.scene);
				});
			}
		}
	}
}
