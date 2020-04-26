// vim: set foldmethod=marker :

// Functions and variables which can be replaced by user code. {{{

var use_3d;
var mouse_navigation = true;
var viewport = [-20, -15, 20, 15];	// Initial camera viewport.
var show_players = false;	// If true, show the player list at bottom.

function playercolor(num) { // {{{
	var colors = ['#f00', '#00f', '#0f0', '#f0f', '#ff0', '#0ff', '#fff', '#000'];
	num %= colors.length;
	return colors[num];
} // }}}

function title_make_option(select, game, n) { // {{{
	var ret = Create('option');
	ret.value = game[0];
	ret.players = game[1];
	if (n >= select.options.length) {
		select.appendChild(ret);
	}
	else {
		select.insertBefore(ret, select.options[n]);
	}
	ret.update_players = function() {
		var num = 0;
		for (var p = 0; p < this.players.length; ++p) {
			if (this.players[p] !== null)
				num += 1;
		}
		this.ClearAll().AddText(this.value + ' (' + num + '/' + this.players.length + ')');
	};
	return ret;
} // }}}

// }}}

// Functions and variables which can be used by user code. {{{

var Public, Private;	// Shared data.
var title_gamelist = [];	// Games which are available in the title screen.
var title_select;	// Select element on title screen (for changing style).
var server;	// Remote server connection.
var audio;	// Object with all registered audio files as its members.
var my_name = null;	// Player name, as returned by the server.
var my_num = null;	// Player number of me, or null if not playing.

function _(message, force_args) {	// Support for translations. {{{
	if (_translations !== undefined) {
		if (_translations[_language] !== undefined && _translations[_language][message] !== undefined)
			message = _translations[_language][message];
		else {
			// _languages is a list of languages, sorted by user preference.
			for (var t = 0; t < _languages; ++t) {
				l = _languages[t];
				if (_translations[t] !== undefined && _translations[t][message] !== undefined) {
					message = _translations[t][message];
					break;
				}
			}
		}
	}
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
	if (parts.length == 1 && !force_args)
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
			add_cb(attr, target[attr], undefined);
	}
	// Watch changes.
	watch(path, function(value, old) {
		if (typeof value != 'object' || value === null) {
			// Not an object. If old is, call remove for all members.
			if (remove_cb && (typeof old == 'object' || old === null)) {
				for (var attr in old)
					remove_cb(attr, undefined, old[attr]);
			}
			return;
		}
		if (typeof old != 'object' || old === null) {
			// It wasn't an object. Call add for all members.
			if (add_cb) {
				for (var attr in value)
					add_cb(attr, value[attr], undefined);
			}
			return;
		}
		// Both value and old are objects. Find changes.
		if (remove_cb) {
			for (var attr in old) {
				if (value[attr] === undefined)
					remove_cb(attr, undefined, old[attr]);
			}
		}
		for (var attr in value) {
			if (old[attr] === undefined) {
				if (add_cb)
					add_cb(attr, value[attr], undefined);
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
	return [pos[0] + window.camera.location_x, pos[1] + window.camera.location_y];
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
var _body, _state, _titlescreen, _mainscreen, _footer, _title_selection, _canvas, _game, _owner, _noowner, _claim, _release, _players, _vdiv, _chatter;
var _gametitle;
var _audio;
var _playerrows = [];
var _watchlist = [];
var _canvas_list = [];
var _div_list = [];
var _translations = {};
var _languages, _language;
// }}}

function _update_url() { // {{{
	if (my_name === undefined)
		return;
	var lang;
	if (_language === undefined)
		lang = '';
	else
		lang = '&lang=' + encodeURIComponent(_language);
	history.replaceState(null, document.title, document.location.protocol + '//' + document.location.host + '/?name=' + encodeURIComponent(my_name) + lang);
} // }}}

function _set_language(language) { // {{{
	if (language == '')
		language = undefined;
	else if (_translations[language] === undefined) {
		console.error(_('Attempting to set undefined language $1')(language));
		return;
	}
	_language = language;
	for (var e in _translatable)
		for (var k = 0; k < _translatable[e].length; ++k)
			_translatable[e][k].ClearAll().AddText(_(e));
	_update_url();
} // }}}

AddEvent('load', function() { // {{{
	var xhr = new XMLHttpRequest();
	xhr.AddEvent('loadend', function() {
		var lines = xhr.responseText.split('\n');
		var load = [[], []];
		use_3d = true;
		var head = document.getElementsByTagName('head')[0];
		var loading = 0;
		for (var l = 0; l < lines.length; ++l) {
			if (lines[l].replace(/\s*/, '') == '')
				continue;
			var parts = lines[l].split(':', 2);
			var key = parts[0].replace(/^\s*([a-z23]*)\s*$/, '$1');
			var value = parts[1].replace(/^\s*(.*?)\s*$/, '$1');
			if (key == 'title') {
				document.getElementsByTagName('title')[0].ClearAll().AddText(value);
				document.getElementById('game_title').ClearAll().AddText(value);
			}
			else if (key == 'base')
				head.AddElement('base').href = value;
			else if (key == 'script') {
				loading += 1;
				var script = head.AddElement('script');
				script.AddEvent('load', load_done);
				script.src = value;
			}
			else if (key == 'style') {
				loading += 1;
				var link = head.AddElement('link');
				link.AddEvent('load', load_done);
				link.rel = 'stylesheet';
				link.href = value;
			}
			else if (key == 'use3d')
				use_3d = (value == 'True');
			else if (key == 'load') {
				load[0].push(value);
				load[1].push(value);
			}
			else if (key == 'load2d')
				load[0].push(value);
			else if (key == 'load3d')
				load[1].push(value);
			else
				console.error('invalid line in config file:', lines[l]);
		}
		// First load all new javascript, then run remaining code and start m.grl machinery.
		function load_done() {
			loading -= 1;
			if (loading > 0)
				return;
			if (use_3d) {
				if (document.location.search[0] == '?') {
					var s = document.location.search.substring(1).split('&');
					for (var i = i; i < s.length; ++i) {
						var kv = s[i].split('=', 1);
						if (kv[0] == '2d' && kv[1] != '0') {
							use_3d = false;
							break;
						}
					}
				}
			}
			if (use_3d)
				please.gl.set_context('canvas');
			else
				please.dom.set_context('canvas');
			var paths = ['img', 'jta', 'gani', 'audio', 'glsl', 'text'];
			for (var i = 0; i < paths.length; ++i)
				please.set_search_path(paths[i], 'webgame/' + paths[i]);
			// Set up audio system.
			// _audio is an object with the audio data for all the files.
			// _audio is a flat object. Keys of _audio are filenames.
			// audio has members which are functions to call play on _audio members.
			// audio is not flat. Subdirectories are separate objects in audio.
			// Example: _audio['sfx/bang.wav'] can be played with audio.sfx.bang().
			// Because the files have not yet been loaded here,
			// _audio is filled with filename keys, but values are path lists like ['sfx', 'bang'], not audio data.
			// audio is not set up yet.
			_audio = {};
			audio = {};
			var list = load[use_3d ? 1 : 0];
			if (list.length > 0) {
				for (var f = 0; f < list.length; ++f) {
					console.info('loading', list[f]);
					please.load(list[f]);
					var ext = list[f].substr(-4);
					if (ext == '.ogg' || ext == '.wav' || ext == '.mp3')
						_audio[list[f]] = list[f].substr(0, list[f].length - 4).split('/');
				}
			}
			else
				window.dispatchEvent(new CustomEvent("mgrl_media_ready"));
		}
		if (loading == 0)
			load_done();
	});
	xhr.responseType = 'text';
	xhr.open('GET', 'config.txt');
	xhr.send();
}); // }}}

function _id(name, num) { // {{{
	my_name = name;
	my_num = num;
	_update_url();
} // }}}

function _webgame_init(languages) { // {{{
	// Set up language select.
	var have_languages = [];
	for (var language in _translations)
		have_languages.push(language);
	have_languages.sort();
	_languages = [];
	outer: for (var l = 0; l < languages.length; ++l) {
		var test = [function(a, b) { return a == b; }, function(a, b) { return a[0] + a[1] == b[0] + b[1]; }];
		for (var t = 0; t < test.length; ++t) {
			for (var candidate = 0; candidate < have_languages.length; ++candidate) {
				if (test[t](languages[l], have_languages[candidate])) {
					_languages.push(have_languages[candidate]);
					have_languages.splice(candidate, 1);
					continue outer;
				}
			}
		}
	}
	_languages.push('');
	for (var l = 0; l < have_languages.length; ++l)
		_languages.push(have_languages[l]);
	var select = document.getElementById('language_select');
	if (_languages.length == 0)
		select.AddClass('hidden');
	else {
		for (var e in _languages) {
			if (_languages[e] == '') {
				var option = select.AddElement('option').AddText('English (source code)');
				option.value = '';
			}
			else {
				var translation = _translations[_languages[e]];
				var name = translation['Language Name'];
				select.AddElement('option').AddText(name + ' (' + _languages[e] + ')').value = _languages[e];
			}
		}
	}
	_set_language(_languages[0]);
	document.getElementById('title_game_name').value = _("$1's game")(my_name);
	document.getElementById('playername').value = my_name;
	_gametitle = document.title;
	_titlescreen = document.getElementById('title');
	_mainscreen = document.getElementById('notitle');
	_footer = document.getElementById('footer');
	_title_selection = document.getElementById('titleselection');
	title_select = document.getElementById('title_games');
	_canvas = document.getElementById('canvas');
	_game = document.getElementById('game');
	_owner = document.getElementById('owner');
	_noowner = document.getElementById('noowner');
	_claim = document.getElementById('claim');
	_release = document.getElementById('release');
	_players = document.getElementById('players');
	_vdiv = document.getElementById('vdiv');
	_chatter = document.getElementById('chatter');
	_vdiv.AddEvent('mousedown', _resize_chat);
	_game.AddClass('hidden');
} // }}}

function _resize_chat(event) { // {{{
	document.AddEvent('mouseup', up).AddEvent('mousemove', move);
	var x = event.clientX;
	function up() {
		event.stopPropagation();
		document.RemoveEvent('mouseup', up).RemoveEvent('mousemove', move);
	}
	function move(event) {
		event.stopPropagation();
		var diff = (event.clientX - x) / _body.clientWidth;
		var value = window.getComputedStyle(_body).getPropertyValue('--width');
		var current_f = Number(value.substr(0, value.length - 1)) / 100;
		_body.style.setProperty('--width', (current_f + diff) * 100 + '%');
		x = event.clientX;
		_resize_window();
		event.preventDefault();
		return false;
	}
} // }}}

AddEvent('mgrl_media_ready', please.once(function() { // {{{
	window.graph = new please.SceneGraph();
	window.camera = new please.CameraNode();
	graph.add(window.camera);
	graph.camera = window.camera;
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
		window.camera.look_at = camera_base;
		window.camera.up_vector = [0, 0, 1];
		camera_base.location = [(viewport[0] + viewport[2]) / 2, (viewport[1] + viewport[3]) / 2, 0];
		// Set initial distance to match requested viewport.
		var rx = (viewport[2] - viewport[0]) / 2 / Math.tan(please.radians(window.camera.fov) / 2);
		var ry = (viewport[3] - viewport[1]) / 2 / Math.tan(please.radians(window.camera.fov) / 2);
		please.make_animatable(window, 'r', rx > ry ? rx : ry);
		please.make_animatable(window, 'theta', -90);
		please.make_animatable(window, 'phi', 30);
		window.camera.location = function() {
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
		window.camera.look_at = function() { return [window.camera.location_x, window.camera.location_y, 0]; };
		window.camera.location = function() { return [(viewport[0] + viewport[2]) / 2, (viewport[1] + viewport[3]) / 2, 100]; };
	}
	window.camera.activate();
	window.camera.update_camera();

	// Finish setting up audio system.
	for (var a in _audio) {
		var path = _audio[a];
		var obj = audio;
		for (var p = 0; p < path.length - 1; ++p) {
			if (obj[path[p]] === undefined)
				obj[path[p]] = {}
			obj = obj[path[p]];
		}
		_audio[a] = please.access(a);
		(function(a) {	// This function creates a private copy of a for each iteration.
			obj[path[path.length - 1]] = function(loop) {
				_audio[a].loop = loop === true;
				if (loop === null)
					_audio[a].stop();
				else if (loop !== false) {
					_audio[a].currentTime = 0;
					_audio[a].play();
				}
			};
		})(a);
	}

	// Initialize game data.
	_body = document.getElementsByTagName('body')[0];
	_state = document.getElementById('state');
	// Set up translations.
	_translatable = {};
	var elements = document.getElementsByClassName('translate');
	for (var e = 0; e < elements.length; ++e) {
		var tag = elements[e].textContent;
		if (_translatable[tag] === undefined)
			_translatable[tag] = [];
		_translatable[tag].push(elements[e]);
	}
	Public = { state: '', name: '' };
	Private = { state: '' };
	set_state('');
	var messages = {
		webgame_init: _webgame_init,
		id: _id,
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
	server = Rpc(messages,
		function() { _body.RemoveClass('disconnected'); },
		function() { _body.AddClass('disconnected'); });

	window.AddEvent('resize', _resize_window);
	if (!use_3d && window.init_2d !== undefined) window.init_2d();
	if (use_3d && window.init_3d !== undefined) window.init_3d();
	if (window.init !== undefined) window.init();
})); // }}}

function _server_reply() { // {{{
	if (window.reply !== undefined)
		window.reply.apply(window.reply, arguments);
	else if (arguments[0] !== null)
		alert(_('Server replied: $1')(arguments[0]));
} // }}}

function game(target) { // {{{
	var args = [];
	for (var i = 1; i < arguments.length; ++i)
		args.push(arguments[i]);
	server.call(target, args, {}, _server_reply);
} // }}}

AddEvent('mgrl_dom_context_changed', function() { // {{{
	if (window.update_canvas && !use_3d)
		window.update_canvas(please.dom.context);
}); // }}}

function _title_join() { // {{{
	var which = title_select.options[title_select.selectedIndex].value;
	game('join', which);
} // }}}

function _title_view() { // {{{
	var which = title_select.options[title_select.selectedIndex].value;
	game('view', which);
} // }}}

function _title_new() { // {{{
	var gamename = document.getElementById('title_game_name').value;
	var num_players = Number(document.getElementById('title_num_players').value);
	game('new', gamename, num_players);
} // }}}

function set_state(value) { // {{{
	_state.ClearAll().AddText(value);
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
		window.camera.width = _canvas.width;
		window.camera.height = _canvas.height;
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
			window.camera.update_camera();
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
		please.dom.context.translate(-window.camera.location_x, -window.camera.location_y);
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
		var key = path[path.length - 1];
		if (value !== undefined)
			target[key] = value;
		else {
			delete target[key];
			if (target instanceof Array) {
				while (target[target.length - 1] === undefined)
					target.length -= 1;
			}
		}
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
	if (Public.name == '') {
		// Title screen.
		document.title = _gametitle;
		_game.AddClass('hidden');
		// Clean up old game.
		if (oldname != '' && window.end_game !== undefined)
			window.end_game();
		// Set number of players for new games.
		if (Public.min_players == Public.max_players) {
			document.getElementById('numplayers').AddClass('hidden');
			document.getElementById('title_num_players').value = Public.max_players;
		}
		else {
			document.getElementById('numplayers').RemoveClass('hidden');
			var range = document.getElementById('range');
			if (Public.max_players === null)
				range.ClearAll().AddText('(' + Public.max_players + ' or more)');
			else
				range.ClearAll().AddText('(' + Public.min_players + ' - ' + Public.max_players + ')');
			if (range.value == '')
				range.value = Public.min_players;
		}
		// Show title screen.
		var games = [];
		// Add all remote games in a sorted list.
		if (Public.games) {
			for (var g in Public.games)
				games.push([g, Public.games[g]]);
			games.sort();
		}
		// Remove titles that aren't in the list.
		var new_list = [];	// Remeber items that should remain in the list.
		for (var g = 0; g < title_gamelist.length; ++g) {
			// Put each game that is in both old and remote lists also in the new list. Omit the rest.
			for (var n = 0; n < games.length; ++n) {
				if (games[n][0] == title_gamelist[g][0]) {
					new_list.push(title_gamelist[g]);
					break;
				}
			}
		}
		// Add titles that are in the list and remove the old ones from the Select element.
		var current = 0;
		title_gamelist = [];
		for (var n = 0; n < games.length; ++n) {
			// Remove games that are not in the new list from the selection.
			while (current < new_list.length && n < title_select.options.length && new_list[current][0] != title_select.options[n].value)
				title_select.removeChild(title_select.options[n]);
			// Add new games that aren't in the selection yet.
			if (current < new_list.length && games[n][0] == new_list[current][0]) {
				title_gamelist.push(new_list[current]);
				continue;
			}
			// Add games that were already in the selection.
			title_gamelist.push([games[n][0], title_make_option(title_select, games[n], n)]);
		}
		// Remove games that have not been handled at the end of the list.
		while (title_select.options.length > n)
			title_select.removeChild(title_select.options[n]);
		// Update all game info.
		for (var n = 0; n < title_gamelist.length; ++n)
			title_gamelist[n][1].update_players();
		// Hide selection if it is empty.
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
		_game.RemoveClass('hidden');
		document.title = _gametitle + ' - ' + Public.name;
		if (window.camera !== undefined)
			_resize_window();
		if (window.update_canvas && !use_3d)
			window.update_canvas(please.dom.context);
		if (window.new_game)
			window.new_game();
	}
	if (Public.demo)
		_body.AddClass('demo');
	else
		_body.RemoveClass('demo');
	if (Public.owner === null) {
		_owner.AddClass('hidden');
		_noowner.RemoveClass('hidden');
		_claim.RemoveClass('hidden');
		_release.AddClass('hidden');
	}
	else {
		_owner.RemoveClass('hidden').ClearAll().AddText(Public.players[Public.owner].name);
		_noowner.AddClass('hidden');
		_claim.AddClass('hidden');
		if (Public.owner == my_num)
			_release.RemoveClass('hidden');
		else
			_release.AddClass('hidden');
	}
	// Update players list.
	while (_playerrows.length > Public.players.length)
		_players.removeChild(_playerrows.pop().tr);
	while (_playerrows.length < Public.players.length) {
		var num = _playerrows.length;
		var tr = _players.AddElement('tr');
		var icon = tr.AddElement('td').AddElement('div', 'icon');
		icon.style.background = playercolor(num);
		var name = tr.AddElement('td');
		var kick = tr.AddElement('td', 'kick');
		var button = kick.AddElement('button').AddText(_('Kick'));
		button.type = 'button';
		button.num = num;
		button.AddEvent('click', function() { game('admin', 'kick', this.num); });
		_playerrows.push({tr: tr, nametext: undefined, name: name, kick: kick});
	}
	for (var i = 0; i < _playerrows.length; ++i) {
		var p = _playerrows[i];
		var name = Public.players[i].name;
		if (p.nametext !== name) {
			p.name.ClearAll().AddText(name === null ? _('(not connected)') : name);
			p.nametext = name;
		}
		if (my_num !== null && Public.owner == my_num && p.nametext !== null && i != my_num)
			p.kick.RemoveClass('hidden');
		else
			p.kick.AddClass('hidden');
	}
	if (window.update !== undefined)
		window.update();
} // }}}

function _Private_update(path, value) { // {{{
	_update(false, path, value);
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

function _change_name() { // {{{
	var name = document.getElementById('playername').value;
	game('admin', 'name', name);
} // }}}

function _select_language() { // {{{
	var lang = document.getElementById('language_select').value;
	_set_language(lang);
	if (Public === undefined || Public.name === undefined)
		return;
	if (Public.name == '') {
		if (window.title_update !== undefined)
			window.title_update();
	}
	else if (window.text_update !== undefined)
		window.text_update();
	else if (window.update !== undefined)
		window.update();
} // }}}

function _chat(event) { // {{{
	if (event.keyCode != 13)
		return;
	var text = event.target.value;
	event.target.value = '';
	if (text != '')
		game('admin', 'chat', text);
} // }}}

function chat(source, message) { // {{{
	var p = _chatter.AddElement('p');
	if (source !== null) {
		var span = p.AddElement('span');
		if (typeof(source) == 'string')
			span.AddText(source);
		else {
			span.AddText(Public.players[source].name);
			span.style.color = playercolor(source);
		}
		p.AddText(': ');
	}
	var parts = message.split('\n');
	for (var i = 0; i < parts.length - 1; ++i) {
		p.AddText(parts[i]);
		p.AddElement('br');
		p.AddElement('span', 'spacer');
	}
	p.AddText(parts[parts.length - 1]);
	p.scrollIntoView();
} // }}}

// }}}
