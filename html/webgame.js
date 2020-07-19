// use strict;
// vim: set foldmethod=marker :

// Functions and variables which can be replaced by user code. {{{

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
var audio;	// Object with play/stop functions for all registered audio files as its members.
var my_name = null;	// Player name, as returned by the server.
var my_num = null;	// Player number of me, or null if not playing.
// Lesser used options are in the "webgame" object, to prevent namespace pollution.
var webgame = {
	use_3d: true,	// If true, the interface is 3d. Otherwise, it is 2d.
	title_gamelist: [],	// Games which are available in the title screen.
	title_select: undefined	// Select element on title screen (for changing style).
};

function game(target) { // {{{
	var args = [];
	for (var i = 1; i < arguments.length; ++i)
		args.push(arguments[i]);
	_webgame.server.call(target, args, {}, _webgame.server_reply);
} // }}}

function set_state(value) { // {{{
	_webgame.state.ClearAll().AddText(value);
} // }}}

function _(message, force_args) {	// Support for translations. {{{
	if (_webgame.translations !== undefined) {
		if (_webgame.translations[_webgame.language] !== undefined && _webgame.translations[_webgame.language][message] !== undefined)
			message = _webgame.translations[_webgame.language][message];
		else {
			// _webgame.languages is a list of languages, sorted by user preference.
			for (var t = 0; t < _webgame.languages; ++t) {
				l = _webgame.languages[t];
				if (_webgame.translations[t] !== undefined && _webgame.translations[t][message] !== undefined) {
					message = _webgame.translations[t][message];
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
		if (code == '$') {
			parts[parts.length - 1] += '$';
			continue;
		}
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

function handle_cursor(keycode) { // compute direction from keycode. {{{
	if (keycode == 37)
		return [-1, 0];
	if (keycode == 38)
		return [0, 1]
	if (keycode == 39)
		return [1, 0];
	if (keycode == 40)
		return [0, -1]
	return null;
} // }}}

function watch(path, cb) { // {{{
	if (path[0] != 'Public' && path[0] != 'Private')
		console.error(_('Ignoring invalid watch path $1, must start with Public or Private')(path));
	else
		_webgame.watchlist.push([path, cb]);
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
	_webgame.canvas_list.push(node.canvas);
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
	_webgame.canvas_list.splice(_webgame.canvas_list.indexOf(node.canvas), 1);
	graph.remove(node);
	please.overlay.remove_element(node.div);
} // }}}

function new_div(w, h, pw, ph, redraw, parent) { // {{{
	var div = please.overlay.new_element();
	var node = new please.GraphNode();
	node.div = div;
	div.node = node;
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
	_webgame.div_list.push(div);
	div.AddEvent('click', function(event) {
		if (!node.selectable)
			return;
		node.dispatch('click', event);
	});
	div.redraw_func();
	return node;
} // }}}

function del_div(node) { // {{{
	_webgame.div_list.splice(_webgame.div_list.indexOf(node.div), 1);
	graph.remove(node);
	please.overlay.remove_element(node.div);
} // }}}

function pos_from_event(event) { // {{{
	var pos = please.dom.pos_from_event(event.clientX, event.clientY);
	return [pos[0] + window.camera.location_x, pos[1] + window.camera.location_y];
} // }}}

function move_node(node, dst, time, callback) { // {{{
	var src = node.location;
	node.location = please.path_driver(please.linear_path(src, dst), time * 1000, false, false, function() {
		node.location = dst;
		if (callback !== undefined)
			callback();
	});
} // }}}

function edit_image(img, tname, editor) { // {{{
	var canvas = Create('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	var ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);
	editor(ctx);
	please.media.assets[tname] = canvas;
} // }}}

function edit_texture(instance, tname, editor) { // {{{
	if (please.media.assets[tname] === undefined) {
		var img = please.media.assets[instance.shader.diffuse_texture];
		edit_image(img, tname, editor);
	}
	instance.shader.diffuse_texture = tname;
} // }}}

function color_texture(instance, tname, color) { // {{{
	if (please.media.assets[tname] === undefined) {
		var canvas = Create('canvas');
		var w, h, draw;
		if (instance === null) {
			w = 1;
			h = 1;
			draw = function() {};
		}
		else {
			var img = please.media.assets[instance.shader.diffuse_texture];
			w = img.width;
			h = img.height;
			draw = function() { ctx.drawImage(img, 0, 0); }
		}
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		draw();
		please.media.assets[tname] = canvas;
		dbg('created image', tname, 'with color', color);
	}
	if (instance !== null)
		instance.shader.diffuse_texture = tname;
} // }}}

function send_chat(message) { // {{{
	game('webgame', 'chat', message);
} // }}}

function show_chat(source, message) { // {{{
	var p = _webgame.chatter.AddElement('p');
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
}
// }}}
// }}}

// Internal variables and functions. {{{
// Global variables for internal use are all inside one object to prevent namespace pollution.
var _webgame = { playerrows: [], watchlist: [], canvas_list: [], div_list: [], translations: {}, chat: show_chat, ui: {}, removing: [], prepare_update: [] };

// System initialization.
window.AddEvent('load', function() { // {{{
	var xhr = new XMLHttpRequest();
	xhr.AddEvent('loadend', function() {
		var lines = xhr.responseText.split('\n');
		var load = [[], []];
		webgame.use_3d = true;
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
				webgame.use_3d = (value == 'True');
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
			if (webgame.use_3d) {
				if (document.location.search[0] == '?') {
					var s = document.location.search.substring(1).split('&');
					for (var i = 0; i < s.length; ++i) {
						var kv = s[i].split('=', 2);
						if (kv[0] == '2d' && kv[1] != '0') {
							webgame.use_3d = false;
							_webgame.force_2d = true;
							break;
						}
					}
				}
			}
			if (webgame.use_3d)
				please.gl.set_context('canvas');
			else
				please.dom.set_context('canvas');
			var paths = ['img', 'jta', 'gani', 'audio', 'glsl', 'text'];
			for (var i = 0; i < paths.length; ++i)
				please.set_search_path(paths[i], 'webgame/' + paths[i]);
			// Set up audio system.
			// _webgame.audio is an object with the audio data for all the files.
			// _webgame.audio is a flat object. Keys of _webgame.audio are filenames.
			// audio has members which are functions to call play on _webgame.audio members.
			// audio is not flat. Subdirectories are separate objects in audio.
			// Example: _webgame.audio['sfx/bang.wav'] can be played with audio.sfx.bang().
			// Because the files have not yet been loaded here,
			// _webgame.audio is filled with filename keys, but values are path lists like ['sfx', 'bang'], not audio data.
			// audio is not set up yet.
			_webgame.audio = {};
			audio = {};
			var list = load[webgame.use_3d ? 1 : 0];
			if (list.length > 0) {
				for (var f = 0; f < list.length; ++f) {
					please.load(list[f]);
					var ext = list[f].substr(-4);
					if (ext == '.ogg' || ext == '.wav' || ext == '.mp3')
						_webgame.audio[list[f]] = list[f].substr(0, list[f].length - 4).split('/');
				}
			}
			else
				window.dispatchEvent(new CustomEvent('mgrl_media_ready'));
		}
		if (loading == 0)
			load_done();
	});
	xhr.responseType = 'text';
	xhr.open('GET', 'config.txt');
	xhr.send();
}); // }}}

window.AddEvent('mgrl_media_ready', please.once(function() { // {{{
	if (webgame.use_3d) {
		var square = '{"meta": {"jta_version": [0.1]}, "attributes": [{"vertices": {"position": {"type": "Array", "hint": "Float16Array", "item": 3, "data": "ADgAuAAAALgAOAAAALgAuAAAALgAuAEAADgAOAGAADgAuAGAADgAuAAAADgAOAAAALgAOAAAALgAuAEAALgAOAEAADgAOAGA"}, "tcoords": [{"type": "Array", "hint": "Float16Array", "item": 2, "data": "ADyNBo8GADyNBpEGADyNBo8GADyNBpEGADyNBgA8ADyPBgA8ADyNBgA8ADyPBgA8"}]}, "polygons": {"type": "Array", "hint": "Uint16Array", "item": 1, "data": "AAABAAIAAwAEAAUABgAHAAgACQAKAAsA"}}], "models": {"Plane": {"parent": null, "extra": {"position": {"x": 0.0, "y": 0.0, "z": 0.0}, "rotation": {"x": 0.0, "y": -0.0, "z": 0.0}, "scale": {"x": 1.0, "y": 1.0, "z": 1.0}, "smooth_normals": false}, "state": {"world_matrix": {"type": "Array", "hint": "Float16Array", "item": 4, "data": "ADwAAAAAAAAAAAA8AAAAAAAAAAAAPAAAAAAAAAAAADw="}}, "struct": 0, "groups": {"default": {"start": 0, "count": 12}}}}, "packed_data": {}}';
		please.media.assets['square'] = please.gl.__jta_model(square, 'square');
	}
	window.graph = new please.SceneGraph();
	window.camera = new please.CameraNode();
	graph.add(window.camera);
	graph.camera = window.camera;
	if (webgame.use_3d) { // {{{
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
	} // }}}
	else {
		window.camera.look_at = function() { return [window.camera.location_x, window.camera.location_y, 0]; };
		window.camera.location = function() { return [(viewport[0] + viewport[2]) / 2, (viewport[1] + viewport[3]) / 2, 100]; };
	}
	window.camera.activate();
	window.camera.update_camera();

	// Finish setting up audio system.
	for (var a in _webgame.audio) {
		var path = _webgame.audio[a];
		var obj = audio;
		for (var p = 0; p < path.length - 1; ++p) {
			if (obj[path[p]] === undefined)
				obj[path[p]] = {};
			obj = obj[path[p]];
		}
		_webgame.audio[a] = please.access(a);
		(function(a) {	// This function creates a private copy of a for each iteration.
			obj[path[path.length - 1]] = function(loop) {
				_webgame.audio[a].loop = loop === true;
				if (loop === null)
					_webgame.audio[a].stop();
				else if (loop !== false) {
					_webgame.audio[a].currentTime = 0;
					_webgame.audio[a].play();
				}
			};
		})(a);
	}

	// Initialize game data.
	_webgame.body = document.getElementsByTagName('body')[0];
	_webgame.state = document.getElementById('state');
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
		webgame: function(target, arg1, arg2) {
			_webgame[target](arg1, arg2);
		},
		'': function() {
			var name = arguments[0];
			var args = [];
			for (var a = 1; a < arguments.length; ++a)
				args.push(arguments[a]);
			//console.info('calling', name, args);
			if (window[name] === undefined)
				show_chat(null, _('Error: server calls $1, which is undefined')(name))
			else
				window[name].apply(window, args);
		}
	};
	_webgame.server = Rpc(messages,
		function() { _webgame.body.RemoveClass('disconnected'); },
		function() { _webgame.body.AddClass('disconnected'); });

	window.AddEvent('resize', _webgame.resize_window);
	var events = ['keydown', 'keyup'];
	for (var e = 0; e < events.length; ++e) {
		if ((!webgame.use_3d && window[events[e] + '2d'] !== undefined) || (webgame.use_3d && window[events[e] + '3d'] !== undefined) || window[events[e]] !== undefined) {
			window.AddEvent(events[e], function(event) {
				if (document.activeElement.tagName == 'INPUT' || document.activeElement.tagName == 'TEXTAREA' || Public === undefined || Public.name === undefined || Public.name == '')
					return;
				if (!webgame.use_3d && window[event.type + '2d'] !== undefined)
					return window[event.type + '2d'](event);
				else if (webgame.use_3d && window[events[e] + '3d'] !== undefined)
					return window[event.type + '3d'](event);
				else
					return window[event.type](event);
			});
		}
	}
	if (!webgame.use_3d && window.init2d !== undefined) window.init2d();
	if (webgame.use_3d && window.init3d !== undefined) window.init3d();
	if (window.init !== undefined) window.init();
})); // }}}

// System commands.
_webgame.id = function(name, num) { // {{{
	my_name = name;
	my_num = num;
	_webgame.update_url();
}; // }}}

_webgame.init = function(languages) { // {{{
	// Set up language select.
	var have_languages = [];
	for (var language in _webgame.translations)
		have_languages.push(language);
	have_languages.sort();
	_webgame.languages = [];
	outer: for (var l = 0; l < languages.length; ++l) {
		var test = [function(a, b) { return a == b; }, function(a, b) { return a[0] + a[1] == b[0] + b[1]; }];
		for (var t = 0; t < test.length; ++t) {
			for (var candidate = 0; candidate < have_languages.length; ++candidate) {
				if (test[t](languages[l], have_languages[candidate])) {
					_webgame.languages.push(have_languages[candidate]);
					have_languages.splice(candidate, 1);
					continue outer;
				}
			}
		}
	}
	if (have_languages.length < 2)
		document.getElementById('language_selector').AddClass('hidden');
	_webgame.languages.push('');
	for (var l = 0; l < have_languages.length; ++l)
		_webgame.languages.push(have_languages[l]);
	var select = document.getElementById('language_select');
	if (_webgame.languages.length == 0)
		select.AddClass('hidden');
	else {
		for (var e in _webgame.languages) {
			if (_webgame.languages[e] == '') {
				var option = select.AddElement('option').AddText('English (source code)');
				option.value = '';
			}
			else {
				var translation = _webgame.translations[_webgame.languages[e]];
				var name = translation['Language Name'];
				select.AddElement('option').AddText(name + ' (' + _webgame.languages[e] + ')').value = _webgame.languages[e];
			}
		}
	}
	_webgame.set_language(_webgame.languages[0]);
	document.getElementById('title_game_name').value = _("$1's game")(my_name);
	document.getElementById('playername').value = my_name;
	_webgame.gametitle = document.title;
	_webgame.titlescreen = document.getElementById('title');
	_webgame.mainscreen = document.getElementById('notitle');
	_webgame.footer = document.getElementById('footer');
	_webgame.title_selection = document.getElementById('titleselection');
	webgame.title_select = document.getElementById('title_games');
	_webgame.canvas = document.getElementById('canvas');
	_webgame.game = document.getElementById('game');
	_webgame.owner = document.getElementById('owner');
	_webgame.noowner = document.getElementById('noowner');
	_webgame.claim = document.getElementById('claim');
	_webgame.release = document.getElementById('release');
	_webgame.players = document.getElementById('players');
	_webgame.vdiv = document.getElementById('vdiv');
	_webgame.handle = document.getElementById('handle');
	_webgame.chatter = document.getElementById('chatter');
	_webgame.handle.AddEvent('mousedown', _webgame.resize_chat);
	_webgame.game.AddClass('hidden');
}; // }}}

_webgame.end = function(result) { // {{{
	dbg('Game ended', result);
	if (window.end !== undefined)
		window.end(result);
	else
		show_chat(null, _('Game ended. Result: $1')(result));
}; // }}}

_webgame.server_reply = function(code) { // {{{
	if (window.reply !== undefined)
		window.reply(code);
	else if (code !== null) {
		var reply;
		if (code.constructor === Array)
			reply = _(code[0], true).apply(undefined, code.slice(1));
		else
			reply = code;
		alert(_('Server replied: $1')(reply));
	}
}; // }}}

// UI.
_webgame.resize_chat = function(event) { // {{{
	document.AddEvent('mouseup', up).AddEvent('mousemove', move);
	var x = event.clientX;
	function up() {
		event.stopPropagation();
		document.RemoveEvent('mouseup', up).RemoveEvent('mousemove', move);
	}
	function move(event) {
		event.stopPropagation();
		var diff = (event.clientX - x) / _webgame.body.clientWidth;
		var value = window.getComputedStyle(_webgame.body).getPropertyValue('--width');
		var current_f = Number(value.substr(0, value.length - 1)) / 100;
		_webgame.body.style.setProperty('--width', (current_f + diff) * 100 + '%');
		x = event.clientX;
		_webgame.resize_window();
		event.preventDefault();
		return false;
	}
}; // }}}

_webgame.resize_window = function() { // {{{
	var size = [_webgame.mainscreen.clientWidth, _webgame.mainscreen.clientHeight];
	if (size[0] == 0 || size[1] == 0)
		return;
	if (_webgame.canvas.width != size[0] || _webgame.canvas.height != size[1]) {
		if (webgame.use_3d) {
			var max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
			if (size[0] > max) {
				size = [max, size[1] / size[0] * max];
			}
			if (size[1] > max) {
				size = [size[0] / size[1] * max, max];
			}
		}
		_webgame.canvas.width = size[0];
		_webgame.canvas.height = size[1];
		window.camera.width = _webgame.canvas.width;
		window.camera.height = _webgame.canvas.height;
		if (webgame.use_3d)
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
}; // }}}

window.AddEvent('mgrl_overlay_aligned', function() { // {{{
	for (var c = 0; c < _webgame.canvas_list.length; ++c)
		_webgame.canvas_list[c].redraw_func();
	for (var d = 0; d < _webgame.div_list.length; ++d)
		_webgame.div_list[d].redraw_func();
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
	if (window.update_canvas !== undefined && !webgame.use_3d)
		window.update_canvas(please.dom.context);
}); // }}}

_webgame.set_language = function(language) { // {{{
	if (language == '')
		language = undefined;
	else if (_webgame.translations[language] === undefined) {
		console.error(_('Attempting to set undefined language $1')(language));
		return;
	}
	_webgame.language = language;
	for (var e in _translatable)
		for (var k = 0; k < _translatable[e].length; ++k)
			_translatable[e][k].ClearAll().AddText(_(e));
	_webgame.update_url();
}; // }}}

_webgame.select_language = function() { // {{{
	var lang = document.getElementById('language_select').value;
	_webgame.set_language(lang);
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
}; // }}}

_webgame.chat_event = function(event) { // {{{
	if (event.keyCode != 13)
		return;
	var text = event.target.value;
	event.target.value = '';
	if (text != '')
		send_chat(text);
}; // }}}

_webgame.change_name = function() { // {{{
	var name = document.getElementById('playername').value;
	game('webgame', 'name', name);
}; // }}}

// Commands triggered from buttons on website.
_webgame.title_join = function() { // {{{
	var which = webgame.title_select.options[webgame.title_select.selectedIndex].value;
	game('join', which);
}; // }}}

_webgame.title_view = function() { // {{{
	var which = webgame.title_select.options[webgame.title_select.selectedIndex].value;
	game('view', which);
}; // }}}

_webgame.title_new = function() { // {{{
	var gamename = document.getElementById('title_game_name').value;
	var num_players = Number(document.getElementById('title_num_players').value);
	game('new', gamename, num_players);
}; // }}}

// Shared object handling.
_webgame.start = function() { // {{{
	if (_webgame.transaction !== undefined)
		console.error('received start command while transaction is in progress.');
	else
		_webgame.transaction = {Public: [_webgame.deepcopy(Public), []], Private: [_webgame.deepcopy(Private), []]};
}; // }}}

_webgame.finish = function(name, args) { // {{{
	if (_webgame.transaction === undefined) {
		console.error('received finish command while transaction is not in progress.');
		return;
	}
	var oldname = _webgame.transaction.Public[0].name;
	var transaction = _webgame.transaction;
	_webgame.transaction = undefined;
	if (Public.name == '') {
		// Title screen.
		document.title = _webgame.gametitle;
		_webgame.game.AddClass('hidden');
		// Clean up old game.
		if (oldname != '' && window.end_game !== undefined) {
			for (var key in _webgame.ui) {
				var list = _webgame.ui[key];
				for (var num = 0; num < list.length; ++num) {
					if (list[num].node !== undefined)
						del_div(list[num].node);
				}
			}
			_webgame.ui = {};
			window.end_game();
		}
		// Set number of players for new games.
		if (Public.min_players == Public.max_players) {
			document.getElementById('numplayers').AddClass('hidden');
			document.getElementById('title_num_players').value = Public.max_players;
		}
		else {
			document.getElementById('numplayers').RemoveClass('hidden');
			var range = document.getElementById('range');
			if (Public.max_players === null)
				range.ClearAll().AddText('(' + Public.min_players + ' or more)');	// TODO: Make translatable.
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
		for (var g = 0; g < webgame.title_gamelist.length; ++g) {
			// Put each game that is in both old and remote lists also in the new list. Omit the rest.
			for (var n = 0; n < games.length; ++n) {
				if (games[n][0] == webgame.title_gamelist[g][0]) {
					new_list.push(webgame.title_gamelist[g]);
					break;
				}
			}
		}
		// Add titles that are in the list and remove the old ones from the Select element.
		var current = 0;
		webgame.title_gamelist = [];
		for (var n = 0; n < games.length; ++n) {
			// Remove games that are not in the new list from the selection.
			while (current < new_list.length && n < webgame.title_select.options.length && new_list[current][0] != webgame.title_select.options[n].value)
				webgame.title_select.removeChild(webgame.title_select.options[n]);
			// Add new games that aren't in the selection yet.
			if (current < new_list.length && games[n][0] == new_list[current][0]) {
				webgame.title_gamelist.push(new_list[current]);
				continue;
			}
			// Add games that were already in the selection.
			webgame.title_gamelist.push([games[n][0], title_make_option(webgame.title_select, games[n], n)]);
		}
		// Remove games that have not been handled at the end of the list.
		while (webgame.title_select.options.length > n)
			webgame.title_select.removeChild(webgame.title_select.options[n]);
		// Update all game info.
		for (var n = 0; n < webgame.title_gamelist.length; ++n)
			webgame.title_gamelist[n][1].update_players();
		// Hide selection if it is empty.
		if (webgame.title_gamelist.length == 0)
			_webgame.title_selection.AddClass('hidden');
		else
			_webgame.title_selection.RemoveClass('hidden');
		// Show the titlescreen.
		_webgame.titlescreen.RemoveClass('hidden');
		_webgame.mainscreen.AddClass('hidden');
		_webgame.footer.AddClass('hidden');
		please.renderer.overlay.AddClass('hidden');
		if (window.title_update !== undefined)
			window.title_update();
		return;
	}
	if (oldname == '') {
		// Hide the titlescreen.
		_webgame.titlescreen.AddClass('hidden');
		_webgame.mainscreen.RemoveClass('hidden');
		_webgame.footer.RemoveClass('hidden');
		please.renderer.overlay.RemoveClass('hidden');
		_webgame.game.RemoveClass('hidden');
		document.title = _webgame.gametitle + ' - ' + Public.name;
		if (window.camera !== undefined)
			_webgame.resize_window();
		if (window.update_canvas !== undefined && !webgame.use_3d)
			window.update_canvas(please.dom.context);
		if (window.new_game !== undefined)
			window.new_game();
	}
	if (Public.demo)
		_webgame.body.AddClass('demo');
	else
		_webgame.body.RemoveClass('demo');
	if (Public.owner === null) {
		_webgame.owner.AddClass('hidden');
		_webgame.noowner.RemoveClass('hidden');
		_webgame.claim.RemoveClass('hidden');
		_webgame.release.AddClass('hidden');
	}
	else {
		_webgame.owner.RemoveClass('hidden').ClearAll().AddText(Public.players[Public.owner].name);
		_webgame.noowner.AddClass('hidden');
		_webgame.claim.AddClass('hidden');
		if (Public.owner == my_num)
			_webgame.release.RemoveClass('hidden');
		else
			_webgame.release.AddClass('hidden');
	}
	// Update players list.
	while (_webgame.playerrows.length > Public.players.length)
		_webgame.players.removeChild(_webgame.playerrows.pop().tr);
	while (_webgame.playerrows.length < Public.players.length) {
		var num = _webgame.playerrows.length;
		var tr = _webgame.players.AddElement('tr');
		var icon = tr.AddElement('td').AddElement('div', 'icon');
		icon.style.background = playercolor(num);
		var name = tr.AddElement('td');
		var kick = tr.AddElement('td', 'kick');
		var button = kick.AddElement('button').AddText(_('Kick'));
		button.type = 'button';
		button.num = num;
		button.AddEvent('click', function() { game('webgame', 'kick', this.num); });
		var swap = tr.AddElement('td', 'swap');
		var button = swap.AddElement('button').AddText(_('Swap'));
		button.type = 'button';
		button.num = num;
		button.AddEvent('click', function() { game('webgame', 'swap', my_num, this.num); });
		_webgame.playerrows.push({tr: tr, nametext: undefined, name: name, kick: kick});
	}
	for (var i = 0; i < _webgame.playerrows.length; ++i) {
		var p = _webgame.playerrows[i];
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
	// Check watch events.
	// Fire them in a separate loop, to avoid unexpected behavior when the watch list is changed from a callback.
	var fire = [];
	for (var w = 0; w < _webgame.watchlist.length; ++w) {
		var watch_path = _webgame.watchlist[w][0];
		var obj = (watch_path[0] == 'Public' ? transaction.Public : transaction.Private);
		var current = (watch_path[0] == 'Public' ? Public : Private);
		outer: for (var c = 0; c < obj[1].length; ++c) {
			var changed = obj[1][c];
			for (var i = 0; i < changed.length && i < watch_path.length - 1; ++i) {
				if (watch_path[i + 1] != changed[i]) {
					continue outer;
				}
			}
			// This path has been matched. Fire the watch event.
			var old_value = obj[0];
			var new_value = current;
			for (var i = 1; i < watch_path.length; ++i) {
				if (old_value !== undefined)
					old_value = old_value[watch_path[i]];
				if (new_value !== undefined)
					new_value = new_value[watch_path[i]];
			}
			fire.push([_webgame.watchlist[w][1], _webgame.deepcopy(old_value), _webgame.deepcopy(new_value)]);
			break;
		}
	}
	// Fire watch events.
	for (var w = 0; w < fire.length; ++w) {
		var cb = fire[w][0];
		var old_value = watch[w][1];
		var new_value = watch[w][2];
		cb(new_value, old_value, args);
	}
	if (name !== undefined && name !== null && window['update_' + name] !== undefined)
		window['update_' + name](args);
	if (window.ui !== undefined)
		_webgame.update_ui();
	if (window.update !== undefined) {
		if (args === null || args === undefined)
			window.update(name, args);
		else {
			args.splice(0, 0, name);
			window.update.apply(window, args);
		}
	}
}; // }}}

_webgame.deepcopy = function(obj) { // {{{
	if (typeof obj != 'object' || obj === null)
		return obj;
	if (obj.constructor === Array) {
		var ret = [];
		for (var i = 0; i < obj.length; ++i)
			ret[i] = _webgame.deepcopy(obj[i]);
		return ret;
	}
	else if (obj.constructor === Object) {
		var ret = {};
		for (var i in obj)
			ret[i] = _webgame.deepcopy(obj[i]);
		return ret;
	}
	else {
		console.error('unrecognized object', obj);
		return obj;
	}
}; // }}}

_webgame.remove_node = function(target) { // {{{
	if (target.node !== undefined)
		_webgame.removing.push(target.node);
	delete target.node;
}; // }}}

_webgame.update_ui = function() { // {{{
	// Attributes for ui objects:
	// path		Where the backing object is, or null if there is none.
	// location	Where the first object is on screen
	// offset	How much the screen position changes for each item
	// class	Class name to use for div
	// init		Called when object is first created
	// click	function to call when this object is clicked
	// virtual	if true, no object is created (but all other handling is performed)
	// background	value for div.style.background
	// update	Called at every update.
	// size		Size of the div (world_w, world_h, pixel_w, pixel_h)
	// visible	If false, object is hidden.
	var recursive_remove = function(tree) {
		if (tree.constructor == Array) {
			for (var i = 0; i < tree.length; ++i)
				recursive_remove(tree[i]);
			return;
		}
		_webgame.remove_node(tree);
	};
	var make_sources = function(sources, pathstr, base_src, base_target, path, pos, idx) {
		for (var currentpos = pos; currentpos < path.length; ++currentpos) {
			if (base_src === undefined) {
				recursive_remove(base_target);
				return;
			}
			var key = path[currentpos];
			if (key == '*') {
				var count;
				var new_src;
				if (base_src.constructor === Array) {
					count = base_src.length;
					new_src = function(i) { return base_src[i]; };
				}
				else {
					count = base_src;
					new_src = function(i) { return base_src; };
				}
				while (base_target.length > count) {
					// Source has disappeared; remove target.
					recursive_remove(base_target.pop());
				}
				while (base_target.length < count) {
					// Source has appeared; add target.
					base_target.push([]);
				}
				for (var i = 0; i < count; ++i) {
					idx.push(i);
					make_sources(sources, pathstr, new_src(i), base_target[i], path, currentpos + 1, idx);
					idx.pop();
				}
				return;
			}
			base_src = base_src[key];
		}
		if (base_target.length == 0)
			base_target.push({});
		sources.push({key: pathstr, source: base_src, target: base_target[0], idx: _webgame.deepcopy(idx)});
	};
	for (var key in window.ui) {
		var obj = window.ui[key];
		var path = key.split('.');
		var base;
		var pos = 1;
		if (path[0] == 'Private')
			base_src = Private;
		else if (path[0] == 'Public')
			base_src = Public;
		else {
			base_src = Public;
			pos = 0;
		}
		var sources = [];
		if (_webgame.ui[key] === undefined)
			_webgame.ui[key] = [];
		make_sources(sources, key, base_src, _webgame.ui[key], path, pos, []);
		for (var i = 0; i < sources.length; ++i)
			_webgame.handle_ui(key, sources[i]);
	}
	while (_webgame.prepare_update.length > 0)
		_webgame.prepare_update.pop()();
	while (_webgame.removing.length > 0) {
		if (webgame.use_3d) {
			var node = _webgame.removing.pop();
			if (node.overlay !== undefined) {
				please.overlay.remove_element(node.overlay.div);
				node.overlay.destroy();
			}
			node.destroy();
		}
		else
			del_div(_webgame.removing.pop());
	}
}; // }}}

_webgame.handle_ui = function(key, data) { // {{{
	// data is {source: object, target: [{node}], idx: array of int}.
	var obj = window.ui[key];
	var get_value = function(attr) {
		var target;
		var args = [data.source].concat(data.idx);
		if (webgame.use_3d) {
			if (obj[attr + '3d'] !== undefined)
				target = obj[attr + '3d'];
			else
				target = obj[attr];
		}
		else {
			if (obj[attr + '2d'] !== undefined)
				target = obj[attr + '2d'];
			else
				target = obj[attr];
		}
		if (typeof target == 'function')
			return target.apply(data.target.node, args);
		return target;
	};
	var use_removed = function(tag, key) {
		if (_webgame.removing.length <= 0)
			return null;
		for (var i = 0; i < _webgame.removing.length; ++i) {
			if (_webgame.removing[i].tag == tag)
				return _webgame.removing.splice(i, 1)[0];
		}
		for (var i = 0; i < _webgame.removing.length; ++i) {
			if (_webgame.removing[i].key == key)
				return _webgame.removing.splice(i, 1)[0];
		}
		return _webgame.removing.pop();
	};
	var tag = get_value('tag');
	if (data.target.node !== undefined && data.target.node.tag != tag) {
		// Remove and add this node, so that shifted lists can be shown as moves.
		_webgame.remove_node(data.target);
		delete data.target.node;
	}
	_webgame.prepare_update.push(function() {
		// Compute new location. {{{
		var compute_location = function() {
			var offset = get_value('offset');
			var loc = [];
			if (offset !== undefined) {
				if (data.idx.length == 1 && offset[0].constructor !== Array)
					offset = [offset];
				else if (offset.length != data.idx.length)
					console.error('incorrect offset value for', key, '; should be array of', data.idx.length, 'arrays of 3 coordinates, not:', offset);
			}
			var the_location = get_value('location');
			if (the_location === undefined)
				the_location = [0, 0, 0];
			for (var i = 0; i < 3; ++i) {
				loc.push(the_location[i]);
				if (offset !== undefined) {
					for (var j = 0; j < data.idx.length; ++j) {
						if (offset[j] !== null)
							loc[i] += data.idx[j] * offset[j][i];
					}
				}
			}
			return loc;
		}
		var current = (data.target.node === undefined ? [0, 0, 0] : data.target.node.location);
		var loc = compute_location();
		var move_needed = false;
		for (var i = 0; i < 3; ++i) {
			if (loc[i] != current[i])
				move_needed = true;
		}
		// }}}
		var set_location = function() { // Move to new location and call finish(). {{{
			var time = get_value('time');
			if (time === undefined)
				time = .3;
			if (move_needed && time > 0) {
				move_node(data.target.node, compute_location(), time, finish);
			}
			else {
				data.target.node.location = compute_location();
				finish();
			}
		}; // }}}
		var finish = function() {
			if (data.target.node === undefined)
				return;
			if (data.target.node.pending !== undefined) {
				var old = data.target.node;
				if (old.overlay !== undefined) {
					please.overlay.remove_element(old.overlay.div);
					old.overlay.destroy();
				}
				var pending = old.pending;
				delete old.pending;
				old.destroy();
				delete data.target.node;
				pending();
			}
			var target;
			if (webgame.use_3d) {
				target = data.target.node.overlay;
				var overlay = get_value('overlay');
				if (overlay !== undefined)
					target.location = overlay;
			}
			else
				target = data.target.node;
			if (target !== undefined) {
				var text = get_value('text');
				if (text !== undefined)
					target.div.ClearAll().AddText(text);
				var className = get_value('class');
				if (className !== undefined) {
					if (typeof className == 'string')
						className = className.split(' ');
					var classes = _webgame.deepcopy(target.classes);
					for (var i = 0; i < className.length; ++i) {
						if (className[i] == '')
							continue;
						target.classes[className[i]] = true;
						target.div.AddClass(className[i]);
						if (classes[className[i]])
							delete classes[className[i]];
					}
					for (var i in classes) {
						if (i == '')
							continue;
						target.div.RemoveClass(i);
						delete target.classes[i];
					}
				}
				var style = get_value('style');
				if (style !== undefined) {
					for (var s in style)
						target.div.style[s] = style[s];
				}
				var image = get_value('image');
				if (image !== undefined && image !== null)
					target.div.style.backgroundImage = 'url(webgame/img/' + image + ')';
			}
			data.target.node.tag = tag;
			var visible = get_value('visible');
			visible = (visible === undefined ? true : visible);
			data.target.node.visible = visible;
			if (data.target.node.overlay !== undefined)
				data.target.node.overlay.visible = visible;
		};
		if (data.target.node === undefined) {
			// Create this node. {{{
			var create_div = function() {
				var size = get_value('size');
				if (size !== undefined) {
					var node = new_div.apply(undefined, size);
					node.classes = {};
					node.div.style.backgroundSize = size[2] + 'px,' + size[3] + 'px';
					return node;
				}
				else {
					var node = new please.GraphNode();
					node.classes = {};
					node.div = please.overlay.new_element();
					node.div.bind_to_node(node);
					node.div.AddEvent('click', function(event) {
						if (!node.selectable)
							return;
						node.dispatch('click', event);
					});
					console.info('div created');
					return node;
				}
			};
			if (!webgame.use_3d) {
				data.target.node = use_removed(tag, key);
				if (data.target.node === null) {
					data.target.node = create_div();
					data.target.node.location = compute_location();
				}
				else {
					// Remove class and content.
					data.target.node.ClearAll().className = '';
				}
				data.target.node.key = key;
				data.target.node.idx = data.idx;
				if (obj.click !== undefined) {
					data.target.node.selectable = true;
					data.target.node.on_click = function(event) {
						// Call click() with the standard arguments; ignore return value.
						get_value('click');
					};
				}
				// Call init() with the standard arguments; ignore return values.
				get_value('init');
				get_value('update');
				set_location();
			}
			else {
				var create_node = function() {
					// If model is defined, use it.
					// If overlay or text is also defined, add an overlay.
					// If size is defined, but not model, create a rectangle.
					var model = get_value('model');
					var overlay = get_value('overlay');
					var text = get_value('text');
					if (model !== undefined) {
						data.target.node = please.access(model).instance();
					}
					else {
						var size = get_value('size');
						if (size !== undefined) {
							data.target.node = please.access('square').instance();
							data.target.node.scale = [size[0], size[1], 1];
							if (data.target.node.shader === undefined)
								data.target.node.shader = {};
							var image = get_value('image');
							if (image !== undefined)
								data.target.node.shader.diffuse_texture = image;
							else {
								var tname = 'blank-' + size[2] + '-' + size[3];
								if (please.media.assets[tname] === undefined) {
									var canvas = Create('canvas');
									canvas.width = size[2];
									canvas.height = size[3];
									please.media.assets[tname] = canvas;
								}
								data.target.node.shader.diffuse_texture = tname;
							}
						}
						else {
							dbg('no model or size defined for', key, data.idx);
							return;
						}
					}
					if (overlay !== undefined || text !== undefined) {
						data.target.node.overlay = create_div();
						data.target.node.add(data.target.node.overlay);
					}
					graph.add(data.target.node);
					data.target.node.location = compute_location();
					data.target.node.key = key;
					data.target.node.idx = data.idx;
					if (obj.click !== undefined) {
						data.target.node.selectable = true;
						data.target.node.on_click = function(event) {
							// Call click() with the standard arguments; ignore return value.
							get_value('click');
						};
						graph.picking.enabled = true;
					}
					// Call init() with the standard arguments; ignore return values.
					get_value('init');
					get_value('update');
				};
				// Use properties from old object if it exists.
				var old = use_removed(tag, key);
				if (old !== null) {
					if (data.target.node !== undefined && data.target.node.pending !== undefined) {
						// Pending node is replaced; nothing to do.
					}
					old.pending = create_node;
					data.target.node = old;
					set_location();
				}
				else
					create_node();
			}
			// }}}
		}
		else {
			// Update the click callback so it uses the new src value when called.
			if (obj.click !== undefined) {
				data.target.node.selectable = true;
				data.target.node.on_click = function(event) {
					// Call click() with the standard arguments; ignore return value.
					get_value('click');
				};
			}
			else
				data.target.node.selectable = false;
			// Call update() with the standard arguments; ignore return values.
			get_value('update');
			// Move to new location and call finish().
			set_location();
		}
	});
}; // }}}

_webgame.update = function(is_public, path, value) { // {{{
	//console.info('update', is_public, path, value);
	var top = (is_public ? Public : Private);
	// Record path for watchers. Duplicates are harmless.
	if (is_public)
		_webgame.transaction.Public[1].push(path);
	else
		_webgame.transaction.Private[1].push(path);
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
}; // }}}

_webgame.Public_update = function(path, value) { // {{{
	//console.info('update', path, value);
	if (_webgame.transaction === undefined) {
		_webgame.start();
		_webgame.update(true, path, value);
		_webgame.finish();
	}
	else
		_webgame.update(true, path, value);
}; // }}}

_webgame.Private_update = function(path, value) { // {{{
	if (_webgame.transaction === undefined) {
		_webgame.start();
		_webgame.update(false, path, value);
		_webgame.finish();
	}
	else
		_webgame.update(false, path, value);
}; // }}}

// Other.
_webgame.update_url = function() { // {{{
	if (my_name === undefined)
		return;
	var lang;
	if (_webgame.language === undefined)
		lang = '';
	else
		lang = '&lang=' + encodeURIComponent(_webgame.language);
	var force_2d;
	if (_webgame.force_2d)
		force_2d = '&2d=1';
	else
		force_2d = '';
	history.replaceState(null, document.title, document.location.protocol + '//' + document.location.host + document.location.pathname + '?name=' + encodeURIComponent(my_name) + lang + force_2d);
}; // }}}
// }}}

function dbg() {
	var p = ['Debug'];
	for (var i = 0; i < arguments.length; ++i)
		p.push(_webgame.deepcopy(arguments[i]));
	console.debug.apply(this, p);
}
