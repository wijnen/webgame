// vim: set foldmethod=marker :

// Functions and variables which can be replaced by user code. {{{

var use_3d;
var mouse_navigation = true;
var viewport = [-20, -15, 20, 15];	// Initial camera viewport.

function playercolor(num) { // {{{
	var colors = ['#f00', '#00f', '#0f0', '#f0f', '#ff0', '#0ff', '#fff', '#000'];
	num %= colors.length;
	return colors[num];
} // }}}

function title_make_option(select, name, n) { // {{{
	var ret = Create('option').AddText(name);
	ret.value = name;
	if (n >= select.options.length) {
		select.appendChild(ret);
	}
	else {
		select.insertBefore(ret, select.options[n]);
	}
	return ret;
} // }}}

// }}}

// Functions and variables which can be used by user code. {{{

var Public, Private;	// Shared data.
var title_gamelist = [];	// Games which are available in the title screen.
var title_select;	// Select element on title screen (for changing style).
var serverobj, server;	// Remote server connection and proxy object. Note that using the proxy object does not work in all browsers.
var audio;	// Object with all registered audio files as its members.
var my_name = null;	// Player name, as returned by the server.
var my_num = null;	// Player number of me, or null if not playing.

function _(message) {	// Support for translations. {{{
	if (_translations !== undefined && _translations[_language] !== undefined && _translations[_language][message] !== undefined)
		message = _translations[_language][message];
	var parts = [''];
	var substs = [];
	while (message.length > 0) {
		var pos = message.search('\\$');
		if (pos == -1)
			break;
		parts[parts.length - 1] += message.substr(0, pos);
		var code = message[pos + 1];
		message = message.substr(pos + 2);
		if (code == '$')
			continue;
		substs.push(Number(code));
		parts.push('');
	}
	parts[parts.length - 1] += message;
	if (parts.length == 1)
		return parts[0];
	return function() {
		var ret = parts[0];
		for (var i = 0; i < substs.length; ++i) {
			if (substs[i] > 0)
				ret += String(arguments[substs[i] - 1]);
			else {
				var args = [];
				for (var j = 0; j < arguments.length; ++j)
					args.push(arguments[j]);
				ret += args;
			}
			ret += parts[i + 1];
		}
		return ret;
	};
} // }}}

function watch(path, cb) { // {{{
	if (path[0] != 'Public' && path[0] != 'Private')
		console.error(_('Ignoring invalid watch path $1, must start with Public or Private')(path));
	else
		_watchlist.push([path, cb]);
} // }}}

function watch_object(path, add_cb, remove_cb, change_cb) { // {{{
	// Call add for initial attributes.
	var target = (path[0] == 'Public' ? Public : Private);
	for (var i = 1; i < path.length; ++i) {
		target = target[path[i]];
		if (target === undefined)
			break;
	}
	if (add_cb && (typeof target == 'object' && target !== null)) {
		for (var attr in target)
			add_cb(attr, target[attr]);
	}
	// Watch changes.
	watch(path, function(value, old) {
		if (typeof value != 'object' || value === null) {
			// Not an object. If old is, call remove for all members.
			if (remove_cb && (typeof old == 'object' || old === null)) {
				for (var attr in old)
					remove_cb(attr, old[attr]);
			}
			return;
		}
		if (typeof old != 'object' || old === null) {
			// It wasn't an object. Call add for all members.
			if (add_cb) {
				for (var attr in value)
					add_cb(attr, value[attr]);
			}
			return;
		}
		// Both value and old are objects. Find changes.
		if (remove_cb) {
			for (var attr in old) {
				if (value[attr] === undefined)
					remove_cb(attr, old[attr]);
			}
		}
		for (var attr in value) {
			if (old[attr] === undefined) {
				if (add_cb)
					add_cb(attr, value[attr]);
			}
			else if (value[attr] != old[attr]) {
				if (change_cb)
					change_cb(attr, value[attr], old[attr]);
			}
		}
	});
} // }}}

function new_canvas(w, h, redraw, parent) { // {{{
	var div = please.overlay.new_element();
	var node = new please.GraphNode();
	node.div = div;
	(parent ? parent : graph).add(node);
	div.bind_to_node(node);
	node.canvas = div.AddElement('canvas');
	node.canvas.redraw_func = function() {
		node.canvas.width = w * 2 * window.camera.orthographic_grid;
		node.canvas.height = h * 2 * window.camera.orthographic_grid;
		div.style.width = node.canvas.style.width = node.canvas.width / 2 + 'px';
		div.style.height = node.canvas.style.heigth = node.canvas.height / 2 + 'px';
		node.context = node.canvas.getContext('2d');
		node.context.scale(window.camera.orthographic_grid * 2, -window.camera.orthographic_grid * 2);
		node.context.translate(w / 2, -h / 2);
		if (redraw)
			redraw(node);
	};
	_canvas_list.push(node.canvas);
	node.canvas.AddEvent('click', function(event) {
		if (!node.selectable)
			return;
		event.world_location = please.dom.pos_from_event(event.pageX, event.pageY, node.location_z);
		// FIXME: this should take rotation and scale into account.
		event.local_location = [event.world_location[0] - node.location_x, event.world_location[1] - node.location_y, 0];
		node.dispatch('click', event);
	});
	node.canvas.redraw_func();
	return node;
} // }}}

function del_canvas(node) { // {{{
	_canvas_list.splice(_canvas_list.indexOf(node.canvas), 1);
	graph.remove(node);
	please.overlay.remove_element(node.div);
} // }}}

function new_div(w, h, pw, ph, redraw, parent) { // {{{
	var div = please.overlay.new_element();
	var node = new please.GraphNode();
	node.div = div;
	(parent ? parent : graph).add(node);
	div.bind_to_node(node);
	div.style.width = pw + 'px';
	div.style.height = ph + 'px';
	div.redraw_func = function() {
		div.style.transformOrigin = 'top left';
		div.style.transform = 'scale(' + w * window.camera.orthographic_grid / pw + ',' + h * window.camera.orthographic_grid / ph + ')';
		if (redraw)
			redraw(node);
	};
	_div_list.push(div);
	div.AddEvent('click', function(event) {
		if (!node.selectable)
			return;
		node.dispatch('click', event);
	});
	div.redraw_func();
	return node;
} // }}}

function del_div(node) { // {{{
	_div_list.splice(_div_list.indexOf(node.div), 1);
	graph.remove(node);
	please.overlay.remove_element(node.div);
} // }}}

function pos_from_event(event) { // {{{
	var pos = please.dom.pos_from_event(event.clientX, event.clientY);
	return [pos[0] + camera.location_x, pos[1] + camera.location_y];
} // }}}

function edit_texture(instance, tname, editor) { // {{{
	if (please.media.assets[tname] === undefined) {
		var img = please.media.assets[instance.shader.diffuse_texture];
		var canvas = Create('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		var ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		editor(ctx);
		please.media.assets[tname] = canvas;
	}
	instance.shader.diffuse_texture = tname;
} // }}}

function player_texture(instance, num) { // {{{
	edit_texture(instance, 'texture-player-' + num + '-' + instance.shader.diffuse_texture, function(ctx) {
		ctx.fillStyle = playercolor(num);
		ctx.fillRect(0, 0, 1, 1);
	});
	return instance;
} // }}}

// }}}

// Internal variables and functions. {{{

// Global variables. {{{
var _body, _state, _titlescreen, _title_title, _mainscreen, _footer, _title_selection, _canvas;
var _gametitle;
var _audio;
var _players = [], _playerdiv;
var _watchlist = [];
var _canvas_list = [];
var _div_list = [];
var _translations = {};
var _languages, _language;
// }}}

function _set_language(language) { // {{{
	if (_translations[language] === undefined) {
		console.error(_('Attempting to set undefined language $1')(language));
		return;
	}
	_language = language;
	for (var e in _translatable)
		_translatable[e].ClearAll().AddText(_(e));
} // }}}

AddEvent('load', function() { // {{{
	_body = document.getElementsByTagName('body')[0];
	_state = document.getElementById('state');
	// Set up translations.
	_translatable = {};
	var elements = document.getElementsByClassName('translate');
	for (var e = 0; e < elements.length; ++e)
		_translatable[elements[e].textContent] = elements[e];
	Public = { state: '', name: '' };
	Private = { state: '' };
	_makestate();
	var messages = {
		webgame_init: _webgame_init,
		Public_update: _Public_update,
		Private_update: _Private_update,
		'': function() {
			var name = arguments[0];
			var args = [];
			for (var a = 1; a < arguments.length; ++a)
				args.push(arguments[a]);
			window[name].apply(window, args);
		}
	};
	serverobj = Rpc(messages,
		function() { _body.RemoveClass('disconnected'); },
		function() { _body.AddClass('disconnected'); });
	try {
		server = serverobj.proxy;
	}
	catch (e) {
		server = null;
	}
}); // }}}

function _webgame_init(name) { // {{{
	my_name = name;
	my_num = null;
	document.getElementById('title_game_name').value = my_name;
	_gametitle = document.title;
	_titlescreen = document.getElementById('title');
	_mainscreen = document.getElementById('notitle');
	_footer = document.getElementById('footer');
	_title_title = document.getElementById('game_title');
	_title_selection = document.getElementById('titleselection');
	title_select = document.getElementById('title_games');
	_playerdiv = document.getElementById('players');
	_canvas = document.getElementById('canvas');
	// TODO: Make this hardcoded in here and in webgame.py instead of webgame-build.
#USE3D#
	if (use_3d)
		please.gl.set_context('canvas');
	else
		please.dom.set_context('canvas');
	please.set_search_path('img', 'img');
	please.set_search_path('jta', 'jta');
	please.set_search_path('gani', 'gani');
	please.set_search_path('audio', 'audio');
	please.set_search_path('glsl', 'glsl');
	please.set_search_path('text', 'text');
	// TODO: Make this hardcoded in here and in webgame.py instead of webgame-build.
#LOAD#
} // }}}

AddEvent('mgrl_media_ready', please.once(function() { // {{{
	window.graph = new please.SceneGraph();
	window.camera = new please.CameraNode();
	graph.add(camera);
	graph.camera = camera;
	if (use_3d) {
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
		var renderer = new please.RenderNode('default');
		renderer.graph = graph;
		window.camera_base = new please.GraphNode();
		graph.add(camera_base);
		camera.look_at = camera_base;
		camera.up_vector = [0, 0, 1];
		camera_base.location = [(viewport[0] + viewport[2]) / 2, (viewport[1] + viewport[3]) / 2, 0];
		// Set initial distance to match requested viewport.
		var rx = (viewport[2] - viewport[0]) / 2 / Math.tan(please.radians(camera.fov) / 2);
		var ry = (viewport[3] - viewport[1]) / 2 / Math.tan(please.radians(camera.fov) / 2);
		please.make_animatable(window, 'r', rx > ry ? rx : ry);
		please.make_animatable(window, 'theta', -90);
		please.make_animatable(window, 'phi', 30);
		camera.location = function() {
			return [camera_base.location_x + r * Math.cos(please.radians(theta)) * Math.cos(please.radians(phi)),
				camera_base.location_y + r * Math.sin(please.radians(theta)) * Math.cos(please.radians(phi)),
				camera_base.location_z + r * Math.sin(please.radians(phi))]; };
		if (mouse_navigation) {
			window._move_event = [null, null];
			window.AddEvent('mousedown', function(event) {
				if (event.buttons != 4)
					return;
				_move_event = [event.clientX, event.clientY];
			});
			window.AddEvent('mousemove', function(event) {
				if (event.buttons != 4)
					return;
				var diff = [event.clientX - _move_event[0], event.clientY - _move_event[1]];
				_move_event = [event.clientX, event.clientY];
				var clamp = function(min, val, max, wrap) {
					if (val > max) {
						if (wrap) {
							while (val > max)
								val -= (max - min);
							return val;
						}
						return max;
					}
					if (val < min) {
						if (wrap) {
							while (val < min)
								val += (max - min);
							return val;
						}
						return min;
					}
					return val;
				};
				if (event.shiftKey) {
					var dx = (diff[1] * Math.cos(please.radians(theta)) - diff[0] * Math.sin(please.radians(theta))) / -500 * r;
					var dy = (diff[0] * Math.cos(please.radians(theta)) + diff[1] * Math.sin(please.radians(theta))) / -500 * r;
					camera_base.location = [camera_base.location_x + dx, camera_base.location_y + dy, camera_base.location_z];
				}
				else {
					theta = clamp(-180, theta - diff[0], 180, true);
					phi = clamp(-89, phi + diff[1], 89, false);
				}
			});
			window.AddEvent('mousewheel', function(event) {
				r += event.detail / (event.shiftKey ? 10 : 1);
			});
			window.AddEvent('DOMMouseScroll', function(event) {
				r += event.detail / (event.shiftKey ? 10 : 1);
			});
		}
		please.set_viewport(renderer);
	}
	else {
		camera.look_at = function() { return [camera.location_x, camera.location_y, 0]; };
		camera.location = function() { return [(viewport[0] + viewport[2]) / 2, (viewport[1] + viewport[3]) / 2, 100]; };
	}
	camera.activate();
	camera.update_camera();

	_audio = {};
	audio = {};
	var make_play = function(target) {
		var name = '';
		var obj = audio;
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
		};
	};
	// TODO: Make this hardcoded in here and in webgame.py instead of webgame-build.
	var audio_data = (#AUDIO#);
	for (var s = 0; s < audio_data.length; ++s)
		make_play(audio_data[s]);

	window.AddEvent('resize', _resize_window);
	if (!use_3d && window.init_2d !== undefined) window.init_2d();
	if (use_3d && window.init_3d !== undefined) window.init_3d();
	if (window.init !== undefined) window.init();
})); // }}}

AddEvent('mgrl_dom_context_changed', function() { // {{{
	if (window.update_canvas && !use_3d)
		window.update_canvas(please.dom.context);
}); // }}}

function _title_join() { // {{{
	var game = title_select.options[title_select.selectedIndex].value;
	serverobj.call('join', [game]);
} // }}}

function _title_view() { // {{{
	var game = title_select.options[title_select.selectedIndex].value;
	serverobj.call('view', [game]);
} // }}}

function _title_new() { // {{{
	serverobj.call('new', [document.getElementById('title_game_name').value, Number(document.getElementById('title_num_players').value)]);
} // }}}

function _leave() { // {{{
	serverobj.call('leave', []);
} // }}}

function _makestate() { // {{{
	_state.ClearAll().AddText((Public.state || '') + ((Private && Private.state) || ''));
	if (!Public.players)
		return;
	while (Public.players.length < _players.length)
		_playerdiv.removeChild(_players.pop()[0]);
	while (_players.length < Public.players.length)
		_players.push([_playerdiv.AddElement('span', 'player'), null]);
	my_num = null;
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
		if (my_name == _players[p][1])
			my_num = p;
	}
} // }}}

function _resize_window() { // {{{
	var size = [_mainscreen.clientWidth, _mainscreen.clientHeight];
	if (size[0] == 0 || size[1] == 0)
		return;
	if (_canvas.width != size[0] || _canvas.height != size[1]) {
		if (use_3d) {
			var max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
			if (size[0] > max) {
				size = [max, size[1] / size[0] * max];
				//console.info('change size', size);
			}
			if (size[1] > max) {
				size = [size[0] / size[1] * max, max];
				//console.info('change size', size);
			}
		}
		_canvas.width = size[0];
		_canvas.height = size[1];
		camera.width = _canvas.width;
		camera.height = _canvas.height;
		if (use_3d)
			gl.viewport(0, 0, size[0], size[1]);
		else {
			var vw = viewport[2] - viewport[0];
			var vh = viewport[3] - viewport[1];
			var other_w = size[1] * vw / vh;
			if (size[0] > other_w)
				please.dom.orthographic_grid = size[1] / vh;
			else
				please.dom.orthographic_grid = size[0] / vw;
			window.camera.orthographic_grid = please.dom.orthographic_grid;
			please.dom.canvas_changed();
			camera.update_camera();
		}
	}
	please.__align_canvas_overlay();
} // }}}

window.AddEvent('mgrl_overlay_aligned', function() { // {{{
	for (var c = 0; c < _canvas_list.length; ++c)
		_canvas_list[c].redraw_func();
	for (var d = 0; d < _div_list.length; ++d)
		_div_list[d].redraw_func();
}); // }}}

window.AddEvent('mgrl_dom_context_changed', function() { // {{{
	please.dom.context.beginPath();
	var w = please.dom.canvas.width / please.dom.orthographic_grid;
	var h = please.dom.canvas.height / please.dom.orthographic_grid;
	please.dom.context.rect(-w / 2, -h / 2, w, h);
	please.dom.context.fillStyle = 'white';
	please.dom.context.fill();
	if (window.camera !== undefined)
		please.dom.context.translate(-camera.location_x, -camera.location_y);
	if (window.update_canvas && !use_3d)
		window.update_canvas(please.dom.context);
}); // }}}

function _update(is_public, path, value) { // {{{
	var top = (is_public ? Public : Private);
	// Find watched items.
	var watch = [];
	outer: for (var w = 0; w < _watchlist.length; ++w) {
		var watch_path = _watchlist[w][0];
		if ((watch_path[0] == 'Public') ^ is_public) {
			continue;
		}
		for (var i = 0; i < path.length && i < watch_path.length - 1; ++i) {
			if (watch_path[i + 1] != path[i]) {
				continue outer;
			}
		}
		// Get current value.
		var target = top;
		for (var i = 1; i < watch_path.length; ++i) {
			target = target[watch_path[i]];
			if (target === undefined)
				break;
		}
		watch.push([watch_path, _watchlist[w][1], _deepcopy(target)]);
	}
	// Update the data.
	if (path.length > 0) {
		var target = top;
		for (var i = 0; i < path.length - 1; ++i)
			target = target[path[i]];
		target[path[path.length - 1]] = value;
	}
	else if (is_public)
		Public = value;
	else
		Private = value;
	// Fire watch events.
	for (var w = 0; w < watch.length; ++w) {
		p = watch[w][0];
		cb = watch[w][1];
		old = watch[w][2];
		var target = (is_public ? Public : Private);
		for (var i = 1; i < p.length; ++i) {
			target = target[p[i]];
			if (target === undefined)
				break;
		}
		if (old != target)
			cb(target, old, p);
	}
} // }}}

function _Public_update(path, value) { // {{{
	//console.info('update', path, value);
	var oldname = Public.name;
	_update(true, path, value);
	_makestate();
	if (Public.name == '') {
		// Title screen.
		document.title = _gametitle;
		// Set number of players for new games.
		if (Public.min_players == Public.max_players) {
			document.getElementById('numplayers').AddClass('hidden');
			document.getElementById('title_num_players').value = Public.max_players;
		}
		else {
			document.getElementById('numplayers').RemoveClass('hidden');
			if (Public.max_players === null)
				document.getElementById('range').ClearAll().AddText('(' + Public.max_players + ' or more)');
			else
				document.getElementById('range').ClearAll().AddText('(' + Public.min_players + ' - ' + Public.max_players + ')');
		}
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
		_footer.AddClass('hidden');
		please.renderer.overlay.AddClass('hidden');
		if (window.title_update !== undefined)
			window.title_update();
		return;
	}
	if (oldname == '') {
		// Hide the titlescreen.
		_titlescreen.AddClass('hidden');
		_mainscreen.RemoveClass('hidden');
		_footer.RemoveClass('hidden');
		please.renderer.overlay.RemoveClass('hidden');
		document.title = _gametitle + ' - ' + Public.name;
		_resize_window();
		if (window.update_canvas && !use_3d)
			window.update_canvas(please.dom.context);
		if (window.new_game)
			window.new_game();
	}
	if (window.update !== undefined)
		window.update();
} // }}}

function _Private_update(path, value) { // {{{
	_update(false, path, value);
	_makestate();
	if (Public.name == '') {
		if (window.title_update !== undefined)
			window.title_update();
		return;
	}
	if (window.update !== undefined)
		window.update();
} // }}}

function _deepcopy(obj) { // {{{
	if (typeof obj != 'object' || obj === null)
		return obj;
	if (obj.constructor === [].constructor) {
		var ret = [];
		for (var i = 0; i < obj.length; ++i)
			ret[i] = _deepcopy(obj[i]);
		return ret;
	}
	else if (obj.constructor === {}.constructor) {
		var ret = {};
		for (var i in obj)
			ret[i] = _deepcopy(obj[i]);
		return ret;
	}
	else {
		console.error('unrecognized object', obj);
		return obj;
	}
} // }}}

// }}}
