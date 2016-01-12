var _body, _state, Public, Private, _titlescreen, title_select, _title_title, _mainscreen, _title_selection;
var title_gamelist = [];
var server;
var my_id, my_num = null;
var _audio, audio;
var _3d = #3D#;
var _ending = false;
var my_name = null;
var _players = [], _playerdiv;

AddEvent('load', function () {
	_titlescreen = document.getElementById('title');
	_mainscreen = document.getElementById('notitle');
	_title_title = document.getElementById('game_title');
	_title_selection = document.getElementById('titleselection');
	title_select = document.getElementById('title_games');
	_playerdiv = document.getElementById('players');
	Public = { state: '', name: '' };
	Private = { state: '' };
	var root = '#PREFIX#';
	if (_3d) {
		please.gl.set_context('canvas');
	}
	else {
		please.dom.set_context('canvas');
	}
	please.set_search_path('img', root + 'assets/img');
	please.set_search_path('jta', root + 'assets/jta');
	please.set_search_path('gani', root + 'assets/gani');
	please.set_search_path('audio', root + 'assets/audio');
	please.set_search_path('glsl', root + 'assets/glsl');
	please.set_search_path('text', root + 'assets/text');
#LOAD#
});

AddEvent('mgrl_media_ready', please.once(function () {
	window.graph = new please.SceneGraph();
	window.camera = new please.CameraNode();
	if (_3d) {
		var prog = please.glsl('default', 'simple.vert', 'diffuse.frag');
		prog.activate();
		please.set_clear_color(0, 0, 0, 0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		var light_direction = vec3.fromValues(.25, -1.0, -.4);
		vec3.normalize(light_direction, light_direction);
		vec3.scale(light_direction, light_direction, -1);
		prog.vars.light_direction = light_direction;
		please.pipeline.add(1, 'main/draw', function () {
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			graph.draw();
		});
		camera.look_at = vec3.fromValues(0, 0, 1);
		camera.location = [-3, -8, 5];
	}
	else {
		please.pipeline.add(1, 'main/draw', function () {
			graph.sync();
		});
	}
	graph.add(camera);
	camera.activate();

	_audio = {};
	audio = {};
	var make_play = function(target) {
		var name = '';
		obj = audio;
		for (var i = 0; i < target[0].length; ++i) {
			name += target[0][i] + '/';
			if (obj[target[0][i]] === undefined)
				obj[target[0][i]] = {};
			obj = obj[target[0][i]];
		}
		_audio[name + target[2]] = please.access(name + target[1]);
		obj[target[2]] = function(loop) {
			_audio[name + target[2]].loop = loop === true;
			if (loop !== false) {
				_audio[name + target[2]].fastSeek(0);
				_audio[name + target[2]].play();
			}
		}
	}
	var audio_data = (#AUDIO#);
	for (var s = 0; s < audio_data.length; ++s)
		make_play(audio_data[s]);

	_body = document.getElementsByTagName('body')[0];
	_state = document.getElementById('state');
	var messages = {
		public_update: _public_update,
		private_update: _private_update,
		win: _win,
		name: function(n) {
			my_name = n;
			document.getElementById('title_game_name').value = my_name;
			_makestate();
		},
		'': function() {
			var name = arguments[0];
			var args = [];
			for (var a = 1; a < arguments.length; ++a)
				args.push(arguments[a]);
			window[name].apply(window, args);
		}
	};
	server = Rpc(messages,
		function() { _body.RemoveClass('disconnected'); },
		function() { _body.AddClass('disconnected'); });
	please.pipeline.start();
	if (window.init !== undefined) window.init();
}));

function playercolor(num) {
	var colors = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff', '#fff', '#000'];
	num %= colors.length;
	return colors[num];
}

function _public_update(path, value) {
	if (path !== undefined) {
		if (path.length == 0) {
			Public = value;
		}
		else {
			var target = Public;
			for (var i = 0; i < path.length - 1; ++i)
				target = target[path[i]];
			if (value === undefined)
				delete target[path[path.length - 1]];
			else
				target[path[path.length - 1]] = value;
		}
	}
	if (_ending)
		return;
	_makestate();
	if (Public.name == '') {
		// Show title screen.
		_title_title.ClearAll().AddText(Public.title);
		var games = Public.games || [];
		// Remove titles that aren't in the list.
		var new_list = [];
		for (var g = 0; g < title_gamelist.length; ++g) {
			for (var n = 0; n < games.length; ++n) {
				if (games[n] == title_gamelist[g][0]) {
					new_list.push(title_gamelist[g]);
					break;
				}
			}
		}
		// Add titles that are in the list and remove the old ones from the Select element.
		var current = 0;
		title_gamelist = [];
		for (var n = 0; n < games.length; ++n) {
			while (current < new_list.length && n < title_select.options.length && new_list[current][0] != title_select.options[n].value)
				title_select.removeChild(title_select.options[n]);
			if (current < new_list.length && games[n] == new_list[current][0]) {
				title_gamelist.push(new_list[current]);
				continue;
			}
			title_gamelist.push([games[n], title_make_option(title_select, games[n], n)]);
		}
		while (title_select.options.length > n)
			title_select.removeChild(title_select.options[n]);
		if (title_gamelist.length == 0)
			_title_selection.AddClass('hidden');
		else
			_title_selection.RemoveClass('hidden');
		// Show the titlescreen.
		_titlescreen.RemoveClass('hidden');
		_mainscreen.AddClass('hidden');
		please.renderer.overlay.AddClass('hidden');
		if (window.title_public_update !== undefined)
			window.title_public_update();
		if (window.title_update !== undefined)
			window.title_update();
		return;
	}
	// Hide the titlescreen.
	_titlescreen.AddClass('hidden');
	_mainscreen.RemoveClass('hidden');
	please.renderer.overlay.RemoveClass('hidden');
	please.__align_canvas_overlay();
	if (window.public_update !== undefined)
		window.public_update();
	if (window.update !== undefined)
		window.update();
}

function title_make_option(select, name, n) {
	var ret = Create('option').AddText(name);
	ret.value = name;
	if (n >= select.options.length) {
		select.appendChild(ret);
	}
	else {
		select.insertBefore(ret, select.options[n]);
	}
	return ret;
}

function _title_join() {
	var game = title_select.options[title_select.selectedIndex].value;
	server.call('join', [game]);
}

function _title_view() {
	var game = title_select.options[title_select.selectedIndex].value;
	server.call('view', [game]);
}

function _title_new() {
	server.call('new', [document.getElementById('title_game_name').value]);
}

function _private_update(path, value) {
	if (path !== undefined) {
		if (path.length == 0) {
			Private = value;
		}
		else {
			var target = Private;
			for (var i = 0; i < path.length - 1; ++i)
				target = target[path[i]];
			if (value === undefined)
				delete target[path[path.length - 1]];
			else
				target[path[path.length - 1]] = value;
		}
	}
	if (_ending)
		return;
	_makestate();
	if (Public.name == '') {
		if (window.title_private_update !== undefined)
			window.title_private_update();
		if (window.title_update !== undefined)
			window.title_update();
		return;
	}
	if (window.private_update !== undefined)
		window.private_update();
	if (window.update !== undefined)
		window.update();
}

function _leave() {
	server.call('leave');
}

function _win(who) {
	if (window.win !== undefined)
		return window.win();
	_ending = true;
	if (who === null)
		alert('Game ended.');
	else if (Public.players[who].name == my_name)
		alert('Game ended; you won!');
	else
		alert('Game ended; winner: ' + Public.players[who].name);
	_ending = false;
	_public_update();
	_private_update();
}

function _makestate() {
	_state.ClearAll().AddText((Public.state || '') + ((Private && Private.state) || ''));
	while (Public.players.length < _players.length)
		_playerdiv.removeChild(_players.pop()[0]);
	while (_players.length < Public.players.length)
		_players.push([_playerdiv.AddElement('span', 'player'), null]);
	for (var p = 0; p < _players.length; ++p) {
		if (_players[p][1] != Public.players[p].name) {
			_players[p][1] = Public.players[p].name;
			_players[p][0].ClearAll().AddText(_players[p][1]);
			_players[p][0].style.color = playercolor(p);
			if (my_name == _players[p][1])
				_players[p][0].AddClass('self');
			else
				_players[p][0].RemoveClass('self');
		}
	}
}

function new_canvas(w, h, name) {
	var div = please.overlay.new_element(name);
	var node = new please.GraphNode();
	node.div = div;
	graph.add(node);
	div.bind_to_node(node);
	node.canvas = div.AddElement('canvas');
	node.canvas.width = w * window.camera.orthographic_grid;
	node.canvas.height = h * window.camera.orthographic_grid;
	node.context = node.canvas.getContext('2d');
	node.context.scale(1 / window.camera.orthographic_grid, -1 / window.camera.orthographic_grid);
	node.context.translate(w / 2, h / -2);
	return node;
}
