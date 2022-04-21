"use strict";
// vim: set foldmethod=marker :

// Functions and variables which can be used by user code. {{{

// Variables. {{{
var Public, Private;	// Shared data.
var audio;	// Object with play/stop functions for all registered audio files as its members.
var my_name = null;	// Player name, as returned by the server.
var my_num = null;	// Player number of me, or null if not playing.
var current = null;	// Currently active game, or null for title game.
// Lesser used options are in the "webgame" object, to prevent namespace pollution.
var webgame = {
	use_3d: null,			// If true, the interface is 3d. Otherwise, it is 2d.
	args: undefined,		// Object containing search string as key-value pairs. A null value means there was no argument.
	mouse_navigation: true		// If true, allow changing the view with the mouse.
};

Object.defineProperty(webgame, "viewport", {
	enumerable: true,
	get: function() { return _webgame.viewport; },
	set: function(value) {
		_webgame.viewport = value;
		_webgame.resize_window(true);
	}
});
// }}}

function server(target) { // {{{
	var args = [];
	for (var i = 1; i < arguments.length; ++i)
		args.push(arguments[i]);
	var reply;
	if (_webgame.current_reply !== undefined) {
		reply = _webgame.current_reply;
		delete _webgame.current_reply;
	}
	else
		reply = _webgame.server_reply;
	_webgame.server.call(target, args, {}, reply);
} // }}}

function set_state(value) { // {{{
	_webgame.state.ClearAll().AddText(value);
} // }}}

function _(message, force_args) {	// Support for translations. {{{
	// Use translation. {{{
	var types = ['system', 'game'];
	var found = false;
	for (var t = 0; t < types.length; ++t) {
		var candidate = _webgame[types[t] + '_translations'][message];
		if (candidate !== undefined) {
			message = candidate;
			found = true;
			break;
		}
	} // }}}
	if (!found && _webgame.language != '')
		console.error('tag', message, 'was not translated');
	// Apply substitutions. {{{
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
	}; // }}}
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

function unwatch(path) { // {{{
	outer: for (var i = 0; i < _webgame.watchlist.length; ++i) {
		var target = _webgame.watchlist[i][0];
		if (target.length != path.length)
			continue;
		for (var p = 0; p < target.length; ++p) {
			if (target[p] != path[p])
				continue outer;
		}
		_webgame.watchlist.splice(i, 1);
		return;
	}
	console.error('Unwatch called on path that is not being watched:', path);
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

function new_canvas(w, h, redraw, obj, parent) { // {{{
	var div = please.overlay.new_element();
	div.transform = true;
	var node = new please.GraphNode();
	node.div = div;
	(parent ? parent : graph).add(node);
	div.bind_to_node(node);
	node.canvas = div.AddElement('canvas');
	node.canvas.redraw = function(obj) {
		if (obj === undefined)
			obj = canvas.last_obj;
		else
			canvas.last_obj = obj;
		node.canvas.width = w * 2 * window.camera.orthographic_grid;
		node.canvas.height = h * 2 * window.camera.orthographic_grid;
		div.style.width = node.canvas.style.width = node.canvas.width / 2 + 'px';
		div.style.height = node.canvas.style.heigth = node.canvas.height / 2 + 'px';
		node.context = node.canvas.getContext('2d');
		node.context.scale(window.camera.orthographic_grid * 2, -window.camera.orthographic_grid * 2);
		node.context.translate(w / 2, -h / 2);
		if (redraw)
			redraw.call(node, obj);
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
	node.canvas.redraw.call(node, obj);
	return node;
} // }}}

function del_canvas(node) { // {{{
	_webgame.canvas_list.splice(_webgame.canvas_list.indexOf(node.canvas), 1);
	graph.remove(node);
	please.overlay.remove_element(node.div);
} // }}}

function new_div(w, h, pw, ph, redraw, obj, parent) { // {{{
	var div = please.overlay.new_element();
	var node = new please.GraphNode();
	node.div = div;
	div.node = node;
	(parent ? parent : graph).add(node);
	div.bind_to_node(node);
	div.style.width = pw + 'px';
	div.style.height = ph + 'px';
	div.redraw = function(obj) {
		if (obj === undefined)
			obj = div.last_obj;
		else
			div.last_obj = obj;
		div.style.transformOrigin = 'top left';
		div.style.transform = 'scale(' + w * window.camera.orthographic_grid / pw + ',' + h * window.camera.orthographic_grid / ph + ')';
		if (redraw)
			redraw.call(node, obj);
	};
	_webgame.div_list.push(div);
	div.AddEvent('click', function(event) {
		if (!node.selectable)
			return;
		node.dispatch('click', event);
	});
	div.redraw.call(node, obj);
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
			//console.info(instance.shader.diffuse_texture);
			var imgname = instance.shader.diffuse_texture;
			if (imgname === null || imgname == 'error_image') {
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
		}
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		draw();
		please.media.assets[tname] = canvas;
		//dbg('created image', tname, 'with color', color);
	}
	if (instance !== null)
		instance.shader.diffuse_texture = tname;
} // }}}

function send_chat(message) { // {{{
	server('webgame', 'chat', message);
} // }}}

function show_chat(source, message) { // {{{
	var p = _webgame.chatter.AddElement('p');
	if (source !== null) {
		var span = p.AddElement('span');
		if (typeof(source) == 'string')
			span.AddText(source);
		else {
			span.AddText(Public.players[source].name);
			span.style.color = _webgame.playercolor(source);
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
var _webgame = { // {{{
	playerrows: [],
	viewerrows: [],
	watchlist: [],
	title_gamelist: [],
	canvas_list: [],
	div_list: [],
	language: '',
	system_translations: {},
	game_translations: {},
	chat: show_chat,
	ui: {},
	removing: [],
	prepare_update: [],
	argorder: [],
	viewport: [-20, -15, 20, 15],
	loaded: {},
	firstgame: true,
	media_ready: false,
	game: {},	// User-accesible data; window.game is set to the active game's value from here when its code is running.
	_game: {}	// internal data
}; // }}}

_webgame.update_camera = function() { // {{{
	if (window.camera === undefined)
		return;
	if (webgame.use_3d) {
		window.camera.look_at = camera_base;
		window.camera.up_vector = [0, 0, 1];
		camera_base.location = [(webgame.viewport[0] + webgame.viewport[2]) / 2, (webgame.viewport[1] + webgame.viewport[3]) / 2, 0];
		// Set initial distance to match requested viewport.
		var rx = (webgame.viewport[2] - webgame.viewport[0]) / 2 / Math.tan(please.radians(window.camera.fov) / 2);
		var ry = (webgame.viewport[3] - webgame.viewport[1]) / 2 / Math.tan(please.radians(window.camera.fov) / 2);
		please.make_animatable(window, 'r', rx > ry ? rx : ry);
		please.make_animatable(window, 'theta', -90);
		please.make_animatable(window, 'phi', 30);
		window.camera.location = function() {
			return [camera_base.location_x + r * Math.cos(please.radians(theta)) * Math.cos(please.radians(phi)),
				camera_base.location_y + r * Math.sin(please.radians(theta)) * Math.cos(please.radians(phi)),
				camera_base.location_z + r * Math.sin(please.radians(phi))]; };
	}
	else {
		window.camera.location = function() { return [(webgame.viewport[0] + webgame.viewport[2]) / 2, (webgame.viewport[1] + webgame.viewport[3]) / 2, 100]; };
	}
	window.camera.update_camera();
} // }}}

// System initialization.
window.AddEvent('load', function() { // {{{
	// Initialize game data.
	_webgame.body = document.getElementsByTagName('body')[0];
	_webgame.state = document.getElementById('state');
	// Set up translations.
	_webgame.translatable = {};
	var elements = document.getElementsByClassName('translate');
	for (var e = 0; e < elements.length; ++e) {
		var tag = elements[e].textContent;
		if (_webgame.translatable[tag] === undefined)
			_webgame.translatable[tag] = [];
		_webgame.translatable[tag].push(elements[e]);
	}
	Public = { state: '', name: '' };
	Private = { state: '' };
	set_state('');
	var messages = {
		webgame: function() {
			var name = arguments[0];
			var args = [];
			for (var a = 1; a < arguments.length; ++a)
				args.push(arguments[a]);
			//console.info(name, args);
			_webgame[name].apply(_webgame, args);
		},
		'': function() {
			var name = arguments[0];
			if (current === null) {
				show_chat(_('Error: server calls $1 during title game')(name));
				return;
			}
			var args = [];
			for (var a = 1; a < arguments.length; ++a)
				args.push(arguments[a]);
			//console.info('calling', name, args);
			if (game[name] === undefined)
				show_chat(null, _('Error: server calls $1, which is undefined')(name))
			else
				game[name].apply(game, args);
		}
	};
	_webgame.server = Rpc(messages,
		function() {
			_webgame.body.RemoveClass('disconnected');
			// Title screen is set up through next update command.
		},
		function() {
			_webgame.body.AddClass('disconnected');
		}
	);

	// Parse url arguments. {{{
	webgame.args = {};
	if (document.location.search[0] == '?') {
		var s = document.location.search.substring(1).split('&');
		for (var i = 0; i < s.length; ++i) {
			var kv = s[i].split('=', 2);
			if (kv.length == 0)
				continue;
			var key = decodeURIComponent(kv[0]);
			var value = (kv.length == 2 ? decodeURIComponent(kv[1]) : null);
			if (webgame.args[key] !== undefined)
				continue
			webgame.args[key] = value;
			_webgame.argorder.push(key);
		}
	}
	var dimension = document.getElementById('dimensionselect');
	if (webgame.args.interface == '2d')
		dimension.selectedIndex = 0;
	else
		dimension.selectedIndex = 1;
	// }}}

	window.AddEvent('mgrl_media_ready', please.once(function() { _webgame.load_done('mgrl'); }));
}); // }}}

_webgame.setup_mgrl = function() { // {{{
	_webgame.media_ready = true;
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
		_webgame.update_camera();
		if (webgame.mouse_navigation) {
			// TODO: This code still works around a bug that has been fixed. It should be simplified.
			_webgame.move_event = [null, null];
			window.AddEvent('mousedown', function(event) {
				if (event.buttons != 4)
					return;
				_webgame.move_event = [event.clientX, event.clientY];
			});
			window.AddEvent('mousemove', function(event) {
				if (event.buttons != 4)
					return;
				var diff = [event.clientX - _webgame.move_event[0], event.clientY - _webgame.move_event[1]];
				_webgame.move_event = [event.clientX, event.clientY];
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
		// TODO: This code still works around a bug that has been fixed. It should be simplified.
		window.camera.look_at = function() { return [window.camera.location_x, window.camera.location_y, 0]; };
		_webgame.update_camera();
		if (webgame.mouse_navigation) {
			_webgame.move_event = [null, null];
			window.AddEvent('mousedown', function(event) {
				if (event.buttons != 4)
					return;
				_webgame.move_event = [event.clientX, event.clientY];
			});
			window.AddEvent('mousemove', function(event) {
				if (event.buttons != 4)
					return;
				var diff = [event.clientX - _webgame.move_event[0], event.clientY - _webgame.move_event[1]];
				_webgame.move_event = [event.clientX, event.clientY];
				var view = webgame.viewport;
				var factor = camera.orthographic_grid;
				view[0] -= diff[0] / factor;
				view[1] += diff[1] / factor;
				view[2] -= diff[0] / factor;
				view[3] += diff[1] / factor;
				webgame.viewport = view;
			});
			var wheel = function(event) {
				var view = webgame.viewport;
				var pos = pos_from_event(event);
				for (var i = 0; i < 2; ++i) {
					view[2 * i] -= pos[0];
					view[2 * i + 1] -= pos[1];
				}
				for (var i = 0; i < view.length; ++i)
					view[i] *= 1 + event.deltaY / (event.shiftKey ? 100 : 10);
				for (var i = 0; i < 2; ++i) {
					view[2 * i] += pos[0];
					view[2 * i + 1] += pos[1];
				}
				webgame.viewport = view;
			};
			window.AddEvent('wheel', wheel);
		}
	}
	window.camera.activate();

	// Set new window title.
	document.title = _('$1: $2 - $3')(_(_webgame.games[current].name), Public.name, _(_webgame.gametitle));

	window.AddEvent('resize', _webgame.resize_window);
	var events = ['keydown', 'keyup', 'keypress'];
	for (var e = 0; e < events.length; ++e) {
		if ((!webgame.use_3d && game[events[e] + '2d'] !== undefined) || (webgame.use_3d && game[events[e] + '3d'] !== undefined) || game[events[e]] !== undefined) {
			window.AddEvent(events[e], function(event) {
				if (document.activeElement.tagName == 'INPUT' || document.activeElement.tagName == 'TEXTAREA' || Public === undefined || Public.name === undefined || Public.name == '')
					return;
				if (!webgame.use_3d && game[event.type + '2d'] !== undefined)
					return game[event.type + '2d'](event);
				else if (webgame.use_3d && game[events[e] + '3d'] !== undefined)
					return game[event.type + '3d'](event);
				else
					return game[event.type](event);
			});
		}
	}
	if (!webgame.use_3d && game.init2d !== undefined) game.init2d();
	if (webgame.use_3d && game.init3d !== undefined) game.init3d();
	if (game.init !== undefined) game.init();
	if (_webgame.load_cb)
		_webgame.load_cb();
	_webgame.server.unlock();
}; // }}}

_webgame.loading = function(state) { // {{{
	var body = document.getElementsByTagName('body')[0]
	if (state)
		body.AddClass('loading');
	else
		body.RemoveClass('loading');
}; // }}}

// System commands.
_webgame.id = function(name, num) { // {{{
	my_name = name;
	my_num = num;
	_webgame.update_url();
}; // }}}

_webgame.translations = function(lang, system_translations, game_translations, settings_translations) { // {{{
	//console.info('setting new translations');
	_webgame.language = lang;
	_webgame.system_translations = system_translations;
	_webgame.game_translations = game_translations;
	_webgame.settings_translations = settings_translations;
	for (var e in _webgame.translatable)
		for (var k = 0; k < _webgame.translatable[e].length; ++k)
			_webgame.translatable[e][k].ClearAll().AddText(_(e));
	_webgame.update_settings_translations();
	_webgame.select_game();
	if (current === null)
		document.title = _(_webgame.gametitle);
	else
		document.title = _('$1: $2 - $3')(_(_webgame.games[current].name), Public.name, _(_webgame.gametitle));
	_webgame.update_url();
}; // }}}

_webgame.init = function(lang, languages, translations, settings, settings_translations) { // {{{
	//console.info(lang, languages, translations, settings, settings_translations);
	_webgame.system_translations = translations;
	_webgame.settings_translations = settings_translations;

	// If a single game was requested and that game exists, ignore all other games.
	if (webgame.args.game !== undefined && settings[webgame.args.game] !== undefined) {
		var obj = {};
		obj[webgame.args.game] = settings[webgame.args.game];
		settings = obj;
		obj = {};
		obj[webgame.args.game] = settings_translations[webgame.args.game];
		settings_translations = obj;
	}

	_webgame.games = settings;
	_webgame.gamelist = [];
	for (var g in _webgame.games)
		_webgame.gamelist.push(g);
	_webgame.gamelist.sort();

	// If there is only one dimension setting for all games, don't show the selector.
	var have_dimension = [false, false];
	for (var game in settings) {
		if (_webgame.games[game].use_3d === null)
			have_dimension = [true, true];
		else
			have_dimension[_webgame.games[game].use_3d] = true;
		if (have_dimension[0] && have_dimension[1])
			break;
	}
	if (!have_dimension[0] || !have_dimension[1])
		document.getElementById('interface_selector').AddClass('hidden');

	// Set up language select. {{{
	_webgame.languages = [];
	for (var language in languages)
		_webgame.languages.push(language);
	_webgame.languages.sort();
	var select = document.getElementById('language_select');
	if (_webgame.languages.length < 2) {
		document.getElementById('language_selector').AddClass('hidden');
		select.AddClass('hidden');
	}
	else {
		for (var e = 0; e < _webgame.languages.length; ++e) {
			var code = _webgame.languages[e];
			var option = select.AddElement('option').AddText(languages[code] + (code == '' ? '' : ' (' + code + ')'));
			option.value = code;
			if (lang == code)
				option.selected = true;
		}
	}
	_webgame.set_language(lang);
	document.getElementById('playername').value = my_name;
	_webgame.gametitle = document.title;
	_webgame.titlescreen = document.getElementById('title');
	_webgame.mainscreen = document.getElementById('notitle');
	_webgame.footer = document.getElementById('footer');
	_webgame.title_selection = document.getElementById('titleselection');
	_webgame.title_select = document.getElementById('title_games');
	_webgame.canvas = document.getElementById('canvas');
	_webgame.game = document.getElementById('game');
	_webgame.owner = document.getElementById('owner');
	_webgame.noowner = document.getElementById('noowner');
	_webgame.claim = document.getElementById('claim');
	_webgame.release = document.getElementById('release');
	_webgame.players = document.getElementById('players');
	_webgame.viewersdiv = document.getElementById('viewersdiv');
	_webgame.viewers = document.getElementById('viewers');
	_webgame.vdiv = document.getElementById('vdiv');
	_webgame.handle = document.getElementById('handle');
	_webgame.chatter = document.getElementById('chatter');
	_webgame.handle.AddEvent('mousedown', _webgame.resize_chat);
	_webgame.game.AddClass('hidden');
	// }}}
	// Set up settings table. {{{
	var gameselect = document.getElementById('gameselect');
	gameselect.ClearAll();
	var gamesettings = document.getElementById('settings');
	_webgame.title_games = [];
	gamesettings.ClearAll();
	_webgame.new_settings = {};
	var games = [];
	var settingstables = [];
	_webgame.select_game = function() { // {{{
		var gameselect = document.getElementById('gameselect');
		var option = gameselect.options[gameselect.selectedIndex];
		if (option.HaveClass('untranslated'))
			gameselect.AddClass('untranslated');
		else
			gameselect.RemoveClass('untranslated');
		for (var g = 0; g < games.length; ++g) {
			if (games[g].selected) {
				settingstables[g].style.display = '';
			}
			else {
				settingstables[g].style.display = 'none';
			}
		}
	} // }}}
	var radiocount = 0;
	_webgame.settingstranslatable = {};
	for (var gamename in _webgame.games) {
		_webgame.settingstranslatable[gamename] = [];
		var table = gamesettings.AddElement('table');
		settingstables.push(table);
		var option = gameselect.AddElement('option');
		_webgame.settingstranslatable[gamename].push([option, _webgame.games[gamename].name]);
		option.value = gamename;
		games.push(option);
		_webgame.new_settings[gamename] = {};
		for (var s = 0; s < _webgame.games[gamename].settings.length; ++s) {
			var setting = _webgame.games[gamename].settings[s];
			var tr = table.AddElement('tr');
			var name = tr.AddElement('td');
			var value = tr.AddElement('td');
			_webgame.settingstranslatable[gamename].push([name, setting.name]);
			var key = (setting.key === undefined ? setting.name : setting.key);
			console.assert(_webgame.new_settings[gamename][key] === undefined);
			if (setting.description !== undefined)
				tr.title = setting.description;
			if (setting.type == 'number') {
				var input = value.AddElement('input');
				input.type = 'number';
				input.value = (setting['default'] === undefined ? 0 : setting['default']);
				input.key = key;
				input.gamename = gamename;
				_webgame.new_settings[gamename][key] = Number(input.value);
				input.AddEvent('change', function() { _webgame.new_settings[this.gamename][this.key] = Number(this.value); });
			}
			else if (setting.type == 'string') {
				var input = value.AddElement('input');
				input.type = 'text';
				input.value = (setting['default'] === undefined ? key == 'name' ? _("$1's game")(my_name) : '' : setting['default']);
				input.key = key;
				input.gamename = gamename;
				_webgame.new_settings[gamename][key] = input.value;
				input.AddEvent('change', function() { _webgame.new_settings[this.gamename][this.key] = this.value; });
			}
			else if (setting.type == 'select') {
				_webgame.new_settings[gamename][key] = 0;
				var select = value.AddElement('select');
				if (setting.options.length == 1)
					tr.AddClass('hidden');
				for (var o = 0; o < setting.options.length; ++o) {
					var option = select.AddElement('option');
					// Don't translate number-only (including empty) strings. Meant for excluding number of players.
					if (typeof setting.options[o] == 'string' && !setting.options[o].match(/^\d*$/))
						_webgame.settingstranslatable[gamename].push([option, setting.options[o]]);
					else
						option.AddText(setting.options[o]);
				}
				select.gamename = gamename;
				select.key = key;
				select.AddEvent('change', function() { _webgame.new_settings[this.gamename][this.key] = this.selectedIndex; });
			}
			else if (setting.type == 'radio') {
				radiocount += 1;
				_webgame.new_settings[gamename][key] = 0;
				if (setting.options.length == 1)
					tr.AddClass('hidden');
				for (var o = 0; o < setting.options.length; ++o) {
					var option = setting.options[o];
					if (o > 0)
						value.AddElement('br');
					var label = value.AddElement('label');
					var radio = label.AddElement('input');
					radio.type = 'radio';
					radio.name = 'webgameradio' + radiocount;
					var span = label.AddElement('span');
					if (!String(option).match(/^\d*$/))
						_webgame.settingstranslatable[gamename].push([span, option]);
					else
						span.AddText(option);
					radio.gamename = gamename;
					radio.key = key;
					radio.retval = option;
					radio.AddEvent('click', function() { _webgame.new_settings[this.gamename][this.key] = this.retval; });
					if (setting['default'] == option || o == 0) {
						radio.checked = true;
						// Don't translate number-only (including empty) strings. Meant for excluding number of players.
						_webgame.new_settings[gamename][key] = option;
					}
				}
			}
			else if (setting.type == 'checkbox') {
				var input = value.AddElement('input');
				input.type = 'checkbox';
				input.checked = !!setting['default'];
				input.key = key;
				input.gamename = gamename;
				_webgame.new_settings[gamename][key] = input.checked;
				input.AddEvent('change', function() { _webgame.new_settings[this.gamename][this.key] = this.checked; });
			}
		}
	}
	_webgame.update_settings_translations();
	_webgame.select_game();
	// }}}
}; // }}}

_webgame.update_settings_translations = function() { // {{{
	for (var gamename in _webgame.games) {
		for (var i = 0; i < _webgame.settingstranslatable[gamename].length; ++i) {
			var obj_tag = _webgame.settingstranslatable[gamename][i];
			var obj = obj_tag[0];
			var tag = obj_tag[1];
			var text = _webgame.settings_translations[gamename] === undefined ? undefined : _webgame.settings_translations[gamename][tag];
			obj.RemoveClass('untranslated');
			if (text === undefined) {
				if (_webgame.system_translations[tag] !== undefined)
					text = _webgame.system_translations[tag];
				else {
					text = tag;
					if (_webgame.language != '')
						obj.AddClass('untranslated');
				}
			}
			obj.ClearAll().AddText(text);
		}
	}
} // }}}

_webgame.load_game = function(gametype, cb) { // {{{
	current = gametype;
	if (_webgame.loaded[current]) {
		// TODO: some things from setup need to be done.
		// TODO: unload old game.
		cb();
		_webgame.server.unlock();
		return;
	}
	_webgame.loaded[current] = true;
	_webgame.loading(true);
	// First load stylesheets and assets, load scripts when that is done. Then set up m.grl.
	_webgame.load_cb = cb;
	_webgame.game[current] = {};	// user accessible data.
	window.game = _webgame.game[current];
	_webgame._game[current] = {files: {}};	// internal data.
	// Set up use_3d. Rules:
	// If game only supports one of them, use that.
	// Otherwise, use user selection.
	if (_webgame.games[current].use_3d !== null) {
		// The game only supports one type.
		webgame.use_3d = _webgame.games[current].use_3d;
		_webgame.force_2d = false;
	}
	else if (document.getElementById('dimensionselect').selectedIndex == 0) {
		// The user requested a 2-D interface, so use that.
		webgame.use_3d = false;
		_webgame.force_2d = true;
	}
	else {
		// Nothing was specified, use the game's default.
		webgame.use_3d = true;
		_webgame.force_2d = false;
	}
	var loading = 0;

	// Set search paths.
	var paths = ['img', 'jta', 'gani', 'audio', 'glsl', 'text'];
	for (var i = 0; i < paths.length; ++i)
		please.set_search_path(paths[i], 'webgames/' + current + '/');
	var list, other;
	if (webgame.use_3d) {
		list = 'load3d';
		other = 'load2d';
	}
	else {
		list = 'load2d';
		other = 'load3d';
	}
	list = _webgame.games[current][list];
	other = _webgame.games[current][other];
	// Fill all objects from unused ui type so they can be referenced without an error (though they will all be undefined).
	for (var asset_index = 0; asset_index < other.length; ++asset_index) {
		var asset = other[asset_index];
		var objname = asset.object;
		var path = asset.path;
		var obj = game[asset.type];
		if (game[asset.type] === undefined)
			game[asset.type] = {};
		for (var p = 0; p < objname.length - 1; ++p) {
			if (obj[objname[p]] === undefined)
				obj[objname[p]] = {};
			obj = obj[objname[p]];
		}
	}
	for (var asset_index = 0; asset_index < list.length; ++asset_index) {
		var asset = list[asset_index];
		if (_webgame._game[current].files[asset.type] === undefined)
			_webgame._game[current].files[asset.type] = [];
		_webgame._game[current].files[asset.type].push([asset.object, asset.path]);
		loading = 1;	// Set to 1 if at least 1 file is loaded.
		//console.info('loading', asset.path);
		var search_path = asset.type == 'jta' || asset.type == 'gani' ? {search_paths: {img: 'webgames/' + current + '/' + asset.path.replace(/^(.*)\/.*?$/, '$1')}} : undefined;
		please.load(asset.path, undefined, search_path);
	}

	var head = document.getElementsByTagName('head')[0];
	// Load stylesheet.
	for (var s = 0; s < _webgame.games[current].style.length; ++s) {
		loading += 1;
		var link = head.AddElement('link');
		link.AddEvent('load', function() { _webgame.load_done('stylesheet'); });
		link.rel = 'stylesheet';
		link.href = _webgame.games[current].style[s];
	}
	_webgame.load_done = function(loaded) {
		loading -= 1;
		if (loading > 0)
			return;

		if (webgame.use_3d) {
			// Inject a square 3-D object for generating objects without a model.
			// Broken up into parts to avoid excessively long line, which triggers a lintian warning.
			var square = '{"meta": {"jta_version": [0.1]}, "attributes": [{"vertices": {"position": {"type": "Array", "hint": "Float16Array", "item": 3, ' +
				'"data": "ADgAuAAAALgAOAAAALgAuAAAALgAuAEAADgAOAGAADgAuAGAADgAuAAAADgAOAAAALgAOAAAALgAuAEAALgAOAEAADgAOAGA"}, ' +
				'"tcoords": [{"type": "Array", "hint": "Float16Array", "item": 2, "data": "ADyNBo8GADyNBpEGADyNBo8GADyNBpEGADyNBgA8ADyPBgA8ADyNBgA8ADyPBgA8"}]}, ' +
				'"polygons": {"type": "Array", "hint": "Uint16Array", "item": 1, "data": "AAABAAIAAwAEAAUABgAHAAgACQAKAAsA"}}], ' +
				'"models": {"Plane": {"parent": null, "extra": {"position": {"x": 0.0, "y": 0.0, "z": 0.0}, "rotation": {"x": 0.0, "y": -0.0, "z": 0.0}, ' +
				'"scale": {"x": 1.0, "y": 1.0, "z": 1.0}, "smooth_normals": false}, "state": {"world_matrix": {"type": "Array", "hint": "Float16Array", "item": 4, ' +
				'"data": "ADwAAAAAAAAAAAA8AAAAAAAAAAAAPAAAAAAAAAAAADw="}}, "struct": 0, "groups": {"default": {"start": 0, "count": 12}}' + '}}, "packed_data": {}}';
			please.media.assets['square'] = please.gl.__jta_model(square, 'square');
		}

		// Finish setting up files.
		for (var type in _webgame._game[current].files) {
			game[type] = {};
			for (var i = 0; i < _webgame._game[current].files[type].length; ++i) {
				var objname = _webgame._game[current].files[type][i][0];
				var path = _webgame._game[current].files[type][i][1];
				var obj = game[type];
				for (var p = 0; p < objname.length - 1; ++p) {
					if (obj[objname[p]] === undefined)
						obj[objname[p]] = {};
					obj = obj[objname[p]];
				}
				_webgame._game[current].files[type][i] = please.access(path);

				var item = objname[objname.length - 1];
				var setup_object = function(obj, item, type, idx, path) {
					// The purpose of this function is to create a scope for type and idx for each iteration of the for loop.

					// Most types call instance() when the object is called. Some have special handling.
					if (type == 'audio') {
						// Play (or stop) the audio when calling the object.
						obj[item] = function(loop) {
							// If loop is null, stop playing.
							// If loop is undefined, play the file once.
							// If loop is true, loop the file.
							// If loop is false, stop looping, but finish possible current playback.
							if (loop === null) {
								_webgame._game[current].files.audio[idx].stop();
								return;
							}
							_webgame._game[current].files.audio[idx].loop = loop === true;
							if (loop !== false) {
								_webgame._game[current].files.audio[idx].currentType = 0;
								_webgame._game[current].files.audio[idx].play();
							}
						};
					}
					else if (type == 'image') {
						// Return an img html element. Its src and asset_name can be used by others.
						obj[item] = function() { return _webgame._game[current].files[type][idx]; };
						obj[item].asset_name = path;
					}
					else {
						obj[item] = function() { return _webgame._game[current].files[type][idx].instance(); };
					}
				};
				setup_object(obj, item, type, i, path);
			}
		}
		// Load game script(s).
		var load_script = function(index, scripts) {
			if (index >= scripts.length) {
				_webgame.setup_mgrl();
				return;
			}
			var script = head.AddElement('script');
			script.AddEvent('load', function() { load_script(index + 1, scripts); });
			script.src = scripts[index];
		};
		if (_webgame.games[current].script.length == 0) {
			// There are no scripts; probably a useless game, but we shouldn't crash on it.
			console.warn("Game has no scripts; it probably won't do anything");
			_webgame.setup_mgrl();
		}
		else
			load_script(0, _webgame.games[current].script);
	};

	if (_webgame.firstgame == true) {
		_webgame.firstgame = false;
		if (webgame.use_3d)
			please.gl.set_context('canvas');
		else
			please.dom.set_context('canvas');
	}

	if (loading == 0)
		_webgame.load_done();
}; // }}}

_webgame.end = function(result) { // {{{
	//dbg('Game ended', result);
	if (game.end !== undefined)
		game.end(result);
	else
		show_chat(null, _('Game ended. Result: $1')(result));
}; // }}}

_webgame.server_reply = function(code) { // {{{
	if (game !== undefined && game.reply !== undefined)
		game.reply(code);
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
_webgame.playercolor = function(num) { // {{{
	if (game.playercolor !== undefined)
		return game.playercolor(num);
	var colors = ['#f00', '#00f', '#0f0', '#f0f', '#ff0', '#0ff', '#fff', '#000'];
	num %= colors.length;
	return colors[num];
} // }}}

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

_webgame.resize_window = function(force) { // {{{
	if (!_webgame.media_ready)
		return;
	var size = [_webgame.mainscreen.clientWidth, _webgame.mainscreen.clientHeight];
	if (size[0] == 0 || size[1] == 0)
		return;
	if (force || _webgame.canvas.width != size[0] || _webgame.canvas.height != size[1]) {
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
			var vw = webgame.viewport[2] - webgame.viewport[0];
			var vh = webgame.viewport[3] - webgame.viewport[1];
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
	if (force) {
		// __align_canvas_overlay may not have done anything, so trigger the event just in case.
		var event = new CustomEvent("mgrl_overlay_aligned");
		window.dispatchEvent(event);
	}
}; // }}}

window.AddEvent('mgrl_overlay_aligned', function() { // {{{
	for (var c = 0; c < _webgame.canvas_list.length; ++c)
		_webgame.canvas_list[c].redraw();
	for (var d = 0; d < _webgame.div_list.length; ++d)
		_webgame.div_list[d].redraw();
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
	if (game.update_canvas !== undefined && !webgame.use_3d)
		game.update_canvas(please.dom.context);
}); // }}}

_webgame.set_language = function(language) { // {{{
	_webgame.current_reply = function(reply) { _webgame.translations.apply(_webgame, reply); };
	server('webgame', 'language', language);
}; // }}}

_webgame.select_language = function() { // {{{
	var select = document.getElementById('language_select');
	_webgame.set_language(select.value);
	if (Public === undefined || Public.name === undefined)
		return;
	if (Public.name == '') {
		// Don't do custom updates for title screen.
	}
	else if (game.text_update !== undefined)
		game.text_update();
	else if (game.update !== undefined)
		game.update();
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
	server('webgame', 'name', name);
}; // }}}

// Commands triggered from buttons on website.
_webgame.title_join = function() { // {{{
	var which = _webgame.title_select.options[_webgame.title_select.selectedIndex].value;
	server('join', which);
}; // }}}

_webgame.title_view = function() { // {{{
	var which = _webgame.title_select.options[_webgame.title_select.selectedIndex].value;
	server('view', which);
}; // }}}

_webgame.title_new = function() { // {{{
	var gameselect = document.getElementById('gameselect');
	var gamename = gameselect.options[gameselect.selectedIndex].value;
	server('new', gamename, _webgame.new_settings[gamename]);
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
	if (Public.name == '') { // {{{
		// Title screen.
		document.title = _(_webgame.gametitle);
		_webgame.game.AddClass('hidden');
		// Clean up old game.
		if (oldname != '') {
			for (var key in _webgame.ui) {
				var list = _webgame.ui[key];
				_webgame.recursive_remove(list);
			}
			_webgame.clean_removing();
			_webgame.ui = {};
			if (game.end_game !== undefined)
				game.end_game();
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
		for (var g = 0; g < _webgame.title_gamelist.length; ++g) {
			// Put each game that is in both old and remote lists also in the new list. Omit the rest.
			for (var n = 0; n < games.length; ++n) {
				if (games[n][0] == _webgame.title_gamelist[g][0]) {
					new_list.push(_webgame.title_gamelist[g]);
					break;
				}
			}
		}
		// Add titles that are in the list and remove the old ones from the Select element.
		var current_item = 0;
		_webgame.title_gamelist = [];
		for (var n = 0; n < games.length; ++n) {
			// Remove games that are not in the new list from the selection.
			while (current_item < new_list.length && n < _webgame.title_select.options.length && new_list[current_item][0] != _webgame.title_select.options[n].value)
				_webgame.title_select.removeChild(_webgame.title_select.options[n]);
			// Add new games that aren't in the selection yet.
			if (current_item < new_list.length && games[n][0] == new_list[current_item][0]) {
				_webgame.title_gamelist.push(new_list[current_item]);
				continue;
			}
			// Add games that were already in the selection.
			var title_option = Create('option');
			title_option.value = games[n][0];
			title_option.players = games[n][1];
			if (n >= _webgame.title_select.options.length) {
				_webgame.title_select.appendChild(title_option);
			}
			else {
				_webgame.title_select.insertBefore(title_option, _webgame.title_select.options[n]);
			}
			title_option.update_players = function() {
				var num = 0;
				for (var p = 0; p < this.players.length; ++p) {
					if (this.players[p] !== null)
						num += 1;
				}
				this.ClearAll().AddText(this.value + ' (' + num + '/' + this.players.length + ')');
			};
			_webgame.title_gamelist.push([games[n][0], title_option]);
			current_item += 1;
		}
		// Remove games that have not been handled at the end of the list.
		while (_webgame.title_select.options.length > n)
			_webgame.title_select.removeChild(_webgame.title_select.options[n]);
		// Update all game info.
		for (var n = 0; n < _webgame.title_gamelist.length; ++n)
			_webgame.title_gamelist[n][1].update_players();
		// Hide selection if it is empty.
		if (_webgame.title_gamelist.length == 0)
			_webgame.title_selection.AddClass('hidden');
		else
			_webgame.title_selection.RemoveClass('hidden');
		// Show the titlescreen.
		_webgame.titlescreen.RemoveClass('hidden');
		_webgame.mainscreen.AddClass('hidden');
		_webgame.footer.AddClass('hidden');
		if (please.renderer.overlay !== null)
			please.renderer.overlay.AddClass('hidden');
		_webgame.loading(false);
		return;
	} // }}}
	var finish_update = function() { // {{{
		if (Public.demo)
			_webgame.body.AddClass('demo');
		else
			_webgame.body.RemoveClass('demo');
		if (Public.owner === null) {
			_webgame.owner.AddClass('hidden');
			_webgame.noowner.RemoveClass('hidden');
			if (my_num !== null)
				_webgame.claim.RemoveClass('hidden');
			else
				_webgame.claim.AddClass('hidden');
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
			icon.style.background = _webgame.playercolor(num);
			var name = tr.AddElement('td');
			var kick = tr.AddElement('td', 'kick');
			var kickbutton = kick.AddElement('button').AddText(_('Kick'));
			kickbutton.type = 'button';
			kickbutton.num = num;
			kickbutton.AddEvent('click', function() { server('webgame', 'kick', Public.players[this.num].name); });
			var swap = tr.AddElement('td', 'swap');
			var swapbutton = swap.AddElement('button').AddText(_('Swap'));
			swapbutton.type = 'button';
			swapbutton.num = num;
			swapbutton.AddEvent('click', function() { server('webgame', 'swap', this.num); });
			_webgame.playerrows.push({tr: tr, nametext: undefined, name: name, kick: kickbutton, swap: swapbutton});
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
			if (my_num !== null && i != my_num && (p.nametext === null || Public.owner == my_num))
				p.swap.RemoveClass('hidden');
			else
				p.swap.AddClass('hidden');
		}
		// Update viewers list.
		if (Public.viewers.length == 0)
			_webgame.viewersdiv.AddClass('hidden');
		else
			_webgame.viewersdiv.RemoveClass('hidden');
		while (_webgame.viewerrows.length > Public.viewers.length)
			_webgame.viewers.removeChild(_webgame.viewerrows.pop().tr);
		while (_webgame.viewerrows.length < Public.viewers.length) {
			var num = _webgame.viewerrows.length;
			var tr = _webgame.viewers.AddElement('tr');
			var icon = tr.AddElement('td').AddElement('div', 'icon');
			icon.style.background = 'black';
			var name = tr.AddElement('td');
			var kick = tr.AddElement('td', 'kick');
			var kickbutton = kick.AddElement('button').AddText(_('Kick'));
			kickbutton.type = 'button';
			kickbutton.num = num;
			kickbutton.AddEvent('click', function() { server('webgame', 'kick', Public.viewers[this.num].name); });
			_webgame.viewerrows.push({tr: tr, nametext: undefined, name: name, kick: kickbutton});
		}
		for (var i = 0; i < _webgame.viewerrows.length; ++i) {
			var p = _webgame.viewerrows[i];
			var name = Public.viewers[i].name;
			if (p.nametext !== name) {
				p.name.ClearAll().AddText(name);
				p.nametext = name;
			}
			if (my_num !== null && Public.owner == my_num)
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
			var current_top = (watch_path[0] == 'Public' ? Public : Private);
			outer: for (var c = 0; c < obj[1].length; ++c) {
				var changed = obj[1][c];
				for (var i = 0; i < changed.length && i < watch_path.length - 1; ++i) {
					if (watch_path[i + 1] != changed[i]) {
						continue outer;
					}
				}
				// This path has been matched. Fire the watch event.
				var old_value = obj[0];
				var new_value = current_top;
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
			var old_value = fire[w][1];
			var new_value = fire[w][2];
			cb(new_value, old_value, args);
		}
		if (name !== undefined && name !== null && game['update_' + name] !== undefined)
			game['update_' + name](args);
		if (game.ui !== undefined)
			_webgame.update_ui();
		if (game.update !== undefined) {
			if (args === null || args === undefined)
				game.update(name, args);
			else {
				args.splice(0, 0, name);
				game.update.apply(game, args);
			}
		}
		_webgame.clean_removing();
	} // }}}
	if (oldname == '') { // {{{
		// Hide the titlescreen.
		_webgame.titlescreen.AddClass('hidden');
		_webgame.mainscreen.RemoveClass('hidden');
		_webgame.footer.RemoveClass('hidden');
		_webgame.server.lock();
		_webgame.load_game(Public.type, function() {
			if (game.viewport !== undefined)
				webgame.viewport = game.viewport;
			please.renderer.overlay.RemoveClass('hidden');
			_webgame.game.RemoveClass('hidden');
			document.title = _('$1: $2 - $3')(_(_webgame.games[current].name), Public.name, _(_webgame.gametitle));
			document.getElementById('gamename').ClearAll().AddText(Public.name);
			if (window.camera !== undefined)
				_webgame.resize_window();
			if (game.update_canvas !== undefined && !webgame.use_3d)
				game.update_canvas(please.dom.context);
			if (game.new_game !== undefined)
				game.new_game();
			finish_update();
			_webgame.loading(false);
		});
	} // }}}
	else
		finish_update();
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

_webgame.recursive_remove = function(tree) { // {{{
	if (tree.constructor == Array) {
		for (var i = 0; i < tree.length; ++i)
			_webgame.recursive_remove(tree[i]);
		return;
	}
	_webgame.remove_node(tree);
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

	var make_sources = function(sources, pathstr, base_src, base_target, path, pos, idx) { // {{{
		for (var currentpos = pos; currentpos < path.length; ++currentpos) {
			if (base_src === undefined || base_src === null) {
				_webgame.recursive_remove(base_target);
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
					_webgame.recursive_remove(base_target.pop());
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
	}; // }}}
	for (var key in game.ui) {
		var obj = game.ui[key];
		var path = key.split('.');
		var base_src;
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
}; // }}}

_webgame.clean_removing = function() { // {{{
	while (_webgame.removing.length > 0) {
		if (webgame.use_3d) {
			var node = _webgame.removing.pop();
			if (node.overlay !== undefined) {
				please.overlay.remove_element(node.overlay.div);
				node.overlay.destroy();
			}
			node.destroy();
		}
		else {
			var node = _webgame.removing.pop();
			if (node.overlay !== undefined) {
				please.overlay.remove_element(node.overlay.div);
				node.overlay.destroy();
			}
			if (node.canvas !== undefined)
				del_canvas(node);
			else
				del_div(node);
		}
	}
}; // }}}

_webgame.handle_ui = function(key, data) { // {{{
	// data is {source: object, target: [{node}], idx: array of int}.
	var obj = game.ui[key];
	var get_value = function(attr, raw) {
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
		if (!raw && typeof target == 'function')
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
			if (the_location === undefined) {
				the_location = [0, 0, 0];
			}
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
		var current_pos = (data.target.node === undefined ? [0, 0, 0] : data.target.node.location);
		var loc = compute_location();
		var move_needed = false;
		for (var i = 0; i < 3; ++i) {
			if (loc[i] != current_pos[i])
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
			else {
				target = data.target.node;
				var overlay = get_value('overlay');
				if (overlay !== undefined) {
					target.overlay.location = overlay;
					console.info(target.location, target.overlay.location);
				}
			}
			if (target !== undefined) {
				var html = get_value('html');
				if (html !== undefined) {
					target.div.innerHTML = html;
				}
				else {
					var text = get_value('text');
					if (text !== undefined)
						target.div.ClearAll().AddText(text);
				}
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
				for (var s in target.style_keys) {
					if (style === undefined || style[s] === undefined) {
						target.div.style[s] = '';
						delete target.style_keys[s];
					}
				}
				if (style !== undefined) {
					for (var s in style) {
						target.div.style[s] = style[s];
						target.style_keys[s] = true;
					}
				}
				var image = get_value('image');
				if (image !== undefined && image !== null)
					target.div.style.backgroundImage = 'url(' + image.src + ')';
			}
			data.target.node.tag = tag;
			var visible = get_value('visible');
			visible = (visible === undefined ? true : visible);
			data.target.node.visible = visible;
			if (data.target.node.overlay !== undefined)
				data.target.node.overlay.visible = visible;
		};
		var canvas = get_value('canvas', true);	// Get raw canvas value (don't run function).
		if (data.target.node === undefined) {
			// Create this node. {{{
			var create_div = function() {
				var size = get_value('size');
				if (size !== undefined) {
					var node;
					if (typeof canvas == 'function')
						node = new_canvas(size[0], size[1], function(src) {
							var args = [src].concat(data.idx);
							canvas.apply(this, args);
						}, data.source);
					else {
						node = new_div.apply(undefined, size);
						node.div.style.backgroundSize = size[2] + 'px,' + size[3] + 'px';
					}
					node.classes = {};
					return node;
				}
				else {
					var node = new please.GraphNode();
					node.classes = {};
					node.div = please.overlay.new_element();
					node.div.bind_to_node(node);
					graph.add(node);
					node.div.AddEvent('click', function(event) {
						if (!node.selectable)
							return;
						node.dispatch('click', event);
					});
					return node;
				}
			};
			if (!webgame.use_3d) {
				data.target.node = use_removed(tag, key);
				if (data.target.node === null) {
					data.target.node = create_div();
					data.target.node.style_keys = {};
					data.target.node.location = compute_location();
				}
				else {
					// Remove class and content.
					data.target.node.ClearAll().className = '';
				}
				data.target.node.key = key;
				data.target.node.idx = data.idx;
				var overlay = get_value('overlay');
				var text = get_value('text');
				var html = get_value('html');
				if (overlay !== undefined || text !== undefined || html !== undefined) {
					data.target.node.overlay = create_div();
					data.target.node.add(data.target.node.overlay);
					data.target.node.overlay.location = compute_location();
				}
				if (obj.click !== undefined) {
					data.target.node.selectable = true;
					data.target.node.on_click = function(event) {
						this.event = event;
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
					var text = get_value('text');
					var html = get_value('html');
					if (model !== undefined) {
						data.target.node = model;
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
								data.target.node.shader.diffuse_texture = image.asset_name || image.src;
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
							//dbg('no model or size defined for', key, data.idx);
							data.target.node = new please.GraphNode();
						}
					}
					graph.add(data.target.node);
					var overlay = get_value('overlay');
					if (overlay !== undefined || text !== undefined || html !== undefined) {
						data.target.node.overlay = create_div();
						dtaa.target.node.overlay.style_keys = {};
						data.target.node.add(data.target.node.overlay);
					}
					data.target.node.location = compute_location();
					data.target.node.key = key;
					data.target.node.idx = data.idx;
					if (obj.click !== undefined) {
						data.target.node.selectable = true;
						data.target.node.on_click = function(event) {
							this.event = event;
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
			if (typeof canvas == 'function' && data.target.node.canvas !== undefined)
				data.target.node.canvas.redraw(data.source);
			// Update the click callback so it uses the new src value when called.
			if (obj.click !== undefined) {
				data.target.node.selectable = true;
				data.target.node.on_click = function(event) {
					this.event = event;
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
	var state = document.location.protocol + '//' + document.location.host + document.location.pathname;
	var sep = '?';
	var lang;
	var set = function(arg, value) {
		if (value === undefined) {
			if (webgame.args[arg] !== undefined) {
				delete webgame.args[arg];
				_webgame.argorder.splice(_webgame.argorder.indexOf(arg), 1);
			}
		}
		else {
			if (webgame.args[arg] === undefined)
				_webgame.argorder.push(arg);
			webgame.args[arg] = value;
		}
	};
	set('name', my_name);
	set('lang', _webgame.language);
	set('interface', _webgame.force_2d ? '2d' : undefined);
	for (var i = 0; i < _webgame.argorder.length; ++i) {
		var arg = _webgame.argorder[i];
		if (webgame.args[arg] === null)
			state += sep + encodeURIComponent(arg);
		else
			state += sep + encodeURIComponent(arg) + '=' + encodeURIComponent(webgame.args[arg]);
		sep = '&';
	}
	history.replaceState(null, document.title, state);
} // }}}
// }}}

function dbg() {
	var p = ['Debug'];
	for (var i = 0; i < arguments.length; ++i)
		p.push(_webgame.deepcopy(arguments[i]));
	console.debug.apply(this, p);
}
