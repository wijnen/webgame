var playerlist;
var players = [];
var connections = {};
var ids = [];
var floats = {};
var body;
var server;
var blocked = false;
var running = false;
var button;

function Float(name, set) {
	var ret = Create('span');
	ret.input = ret.AddElement('input');
	ret.input.type = 'text';
	ret.input.AddEvent('keydown', function(key) {
		if (key.keyCode == 13) {
			// Set value.
			set(Number(ret.input.value));
		}
	});
	ret.span = ret.AddElement('span').AddText('0');
	ret.new_value = function(value) {
		this.span.ClearAll().AddText(String(value));
	};
	floats[name] = ret;
	return ret;
}

function players_changed(new_players) {
	floats['players'].new_value(new_players.length);
	// Add new players.
	for (var p = players.length; p < new_players.length; ++p) {
		var tr = Create('tr');
		playerlist.appendChild(tr);
		tr.AddElement('th').AddText(String(p));
		var current = tr.AddElement('td');
		var select = tr.AddElement('td').AddElement('select');
		select.num = p;
		select.AddEvent('change', function() {
			if (blocked)
				return;
			var i = this.options[this.selectedIndex].Index;
			server.call('player', [this.num, i], {});
		});
		select.AddElement('option').AddText('-').Index = null;
		var options = {};
		for (var c = 0; c < ids.length; ++c) {
			options[ids[c]] = select.AddElement('option').AddText(connections[ids[c]]);
			options[ids[c]].Index = ids[c];
		}
		players.push({ connection: new_players[p], tr: tr, current: current, select: select, options: options });
	}
	// Remove old players.
	while (players.length > new_players.length) {
		playerlist.removeChild(players.pop().tr);
	}
	for (var p = 0; p < players.length; ++p)
		players[p].current.ClearAll().AddText(new_players[p] === null ? '-' : connections[new_players[p]]);
}

function add_connection(id) {
	ids.push(id);
	connections[id] = name;
	for (var p = 0; p < players.length; ++p) {
		var option = players[p].select.AddElement('option').AddText(name);
		option.Index = id;
		players[p].options[id] = option;
	}
}

function rename_connection(id, name) {
	connections[id] = name;
	for (var p = 0; p < players.length; ++p)
		players[p].options[id].ClearAll().AddText(name);
}

function remove_connection(id) {
	for (var p = 0; p < players.length; ++p) {
		players[p].select.removeChild(players[p].options[id]);
		delete players[p].options[id];
	}
	delete connections[id];
	ids.splice(ids.indexOf(id), 1);
}

function started() {
	running = true;
	button.ClearAll().AddText('Stop');
}

function stopped() {
	running = false;
	button.ClearAll().AddText('Start');
}

var message = {
	playerlist: players_changed,
	add_connection: add_connection,
	rename_connection: rename_connection,
	remove_connection: remove_connection,
	started: started,
	stopped: stopped
};

function open() {
	body.RemoveClass('disconnected');
}

function close() {
	body.AddClass('disconnected');
}

function init() {
	body = document.getElementsByTagName('body')[0];
	server = Rpc(message, open, close);
	button = body.AddElement('button').AddText('Start').AddEvent('click', function() {
		server.call(running ? 'stop' : 'start', [], {});
	});
	var p = body.AddElement('p').AddText('Players');
	p.Add(Float('players', function(num) {server.call('players', [num], {})}));
	playerlist = body.AddElement('table');
	var tr = playerlist.AddElement('tr');
	tr.AddElement('th').AddText('Number');
	tr.AddElement('th').AddText('Current Player');
	tr.AddElement('th').AddText('New Player');
}
