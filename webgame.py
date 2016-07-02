# Webgame module.
# vim: set foldmethod=marker :

# Imports. {{{
import websocketd
from websocketd import log
import fhs
import sys
import os
import time
import json
import __main__
import collections
# }}}

fhs.module_init('webgame', {'port': 8891, 'tls': False})

server = None

# Shared object handling. {{{
class Shared_Object(collections.MutableMapping): # {{{
	def __init__(self, path, target, group):
		self.__dict__['_path'] = path
		self.__dict__['_target'] = target
		self.__dict__['_members'] = {}
		self.__dict__['_alive'] = False
		self.__dict__['_group'] = group
	def __setattr__(self, key, value):
		if key in self._members and isinstance(self._members[key], (Shared_Object, Shared_Array)):
			self._members[key]._die()
		self._members[key] = make_shared(self._path, self._target, key, value, send = self._alive, group = self._group)
	def __getattr__(self, key):
		return self._members[key]
	def __delattr__(self, key):
		make_shared(self._path, self._target, key, None, send = self._alive, group = self._group)
		if key in self._members and isinstance(self._members[key], (Shared_Object, Shared_Array)):
			self._members[key]._die()
		del self._members[key]
		if self.alive:
			path = self._path[1:] + [key]
			if self._target is None:
				assert self._path[0] == 'Public'
				server.broadcast[self._group].Public_update(path)
			elif self._path[0] == 'Public':
				assert self._group in self._target.connection._socket.groups
				if self._target.connection:
					self._target.connection._socket.Public_update.event(path)
			else:
				if self._target.connection:
					self._target.connection._socket.Private_update.event(path)
	def __getitem__(self, key):
		return getattr(self, key)
	def __setitem__(self, key, value):
		return setattr(self, key, value)
	def __delitem__(self, key):
		return delattr(self, key)
	def __len__(self):
		return len(self._members)
	def __iter__(self):
		yield from iter(self._members)
	def _live(self):
		self.__dict__['_alive'] = True
		for i in self._members:
			if isinstance(self._members[i], (Shared_Object, Shared_Array)):
				self._members[i]._live()
	def _die(self):
		self.__dict__['_alive'] = False
		for i in self._members:
			if isinstance(self._members[i], (Shared_Object, Shared_Array)):
				self._members[i]._die()
	def _json(self):
		ret = {}
		for k, v in self._members.items():
			if isinstance(v, (Shared_Object, Shared_Array)):
				ret[k] = v._json()
			else:
				ret[k] = v
		return ret
# }}}

class Shared_Array(collections.MutableSequence): # {{{
	def __init__(self, path, target, group):
		self.path = path
		self.target = target
		self.data = []
		self.alive = False
		self.group = group
	def __setitem__(self, index, value):
		if index < 0:
			index += len(self.data)
		assert 0 <= index < len(self.data)
		if isinstance(self.data[index], (Shared_Object, Shared_Array)):
			self.data[index]._die()
		self.data[index] = make_shared(self.path, self.target, index, value, send = self.alive, group = self.group)
	def __getitem__(self, index):
		return self.data[index]
	def __delitem__(self, index):
		if index < 0:
			index += len(self.data)
		assert 0 <= index < len(self.data)
		if isinstance(self.data[index], (Shared_Object, Shared_Array)):
			self.data[index]._die()
		for i in range(index, len(self.data) - 1):
			self[i] = make_shared(self.path, self.target, i, self[i + 1], send = self.alive, group = self.group)
		self.data.pop()
		if self.alive:
			path = self.path[1:] + ['length']
			if self.target is None:
				assert self.path[0] == 'Public'
				server.broadcast[self.group].Public_update(path, len(self.data))
			elif self.path[0] == 'Public':
				assert self.group in self.target.connection._socket.groups
				if self.target.connection:
					self.target.connection._socket.Public_update.event(path, len(self.data))
			else:
				if self.target.connection:
					self.target.connection._socket.Private_update.event(path, len(self.data))
	def __lt__(self, other):
		return list(self) < list(other)
	def __len__(self):
		return len(self.data)
	def insert(self, index, obj):
		if index < 0:
			index += len(self.data)
		assert 0 <= index <= len(self.data)
		if index < len(self.data):
			self.data.append(make_shared(self.path, self.target, len(self.data), self.data[-1], send = False, group = self.group))
			for i in range(len(self.data) - 2, index, -1):
				if isinstance(self.data[i], (Shared_Object, Shared_Array)):
					self.data[i]._die()
				self.data[i] = make_shared(self.path, self.target, i, self[i - 1], send = False, group = self.group)
			self.data[index] = make_shared(self.path, self.target, index, obj, send = False, group = self.group)
			if self.target is None or self.target.connection is not None:
				broadcast_shared(self.target, self.path, self)
		else:
			self.data.append(make_shared(self.path, self.target, index, obj, send = self.alive, group = self.group))
	def _live(self):
		self.alive = True
		for i in self.data:
			if isinstance(i, (Shared_Object, Shared_Array)):
				i._live()
	def _die(self):
		self.alive = False
		for i in self.data:
			if isinstance(i, (Shared_Object, Shared_Array)):
				i._die()
	def _json(self):
		ret = []
		for v in self.data:
			if isinstance(v, (Shared_Object, Shared_Array)):
				ret.append(v._json())
			else:
				ret.append(v)
		return ret
# }}}

def make_shared(parent_path, target, key, value, send, group): # {{{
	path = parent_path.copy()
	path.append(key)
	if isinstance(value, (tuple, list)):
		newvalue = Shared_Array(path, target, group)
		for i, x in enumerate(value):
			newvalue.append(make_shared(path, target, i, x, False, group))
		if send:
			newvalue._live()
			if target is None or target.connection is not None:
				broadcast_shared(target and target.connection, path, newvalue, group)
	elif isinstance(value, dict):
		newvalue = Shared_Object(path, target, group)
		for i in value:
			newvalue[i] = make_shared(path, target, i, value[i], False, group)
		if send:
			newvalue._live()
			if target is None or target.connection is not None:
				broadcast_shared(target and target.connection, path, newvalue, group)
	else:
		newvalue = value
		if send:
			if target is None or target.connection is not None:
				broadcast_shared(target and target.connection, path, newvalue, group)
	return newvalue
# }}}

def broadcast_shared(target, path, value, group = None): # {{{
	if isinstance(value, Shared_Object):
		assert group is None or group is value._group
		group = value._group
		value = value._json()
	elif isinstance(value, Shared_Array):
		assert group is None or group is value.group
		group = value.group
		value = value._json()
	if target is None:
		assert group is not None
		assert path[0] == 'Public'
		# Send public update to everyone.
		#log('broadcast %s %s' % (repr(path), repr(value)))
		server.broadcast[group].Public_update(path[1:], value)
	else:
		if path[0] == 'Public':
			assert group in target._socket.groups
			#log('Public %s %s' % (repr(path), repr(value)))
			# Send public information to target.
			target._socket.Public_update.event(path[1:], value)
		else:
			#log('Private %s %s' % (repr(path), repr(value)))
			# Send private information for target that is controlling the correct player.
			target._socket.Private_update.event(path[1:], value)
# }}}
# }}}

# Global variables. {{{
# All connections (both viewers and players); keys are names.
connections = {}

# String to paste into javascript for loading asserts; two versions: [2d, 3d].
loader_js = [None, None]

# Whether or not 2d and 3d versions are available.
have_2d = None
have_3d = None

# Generator type, for checking if things are generators.
generator_type = type((lambda: (yield))())

# All currently running games.
instances = {}

# Title game instance.
title_game = None

# Commands that work always.
cmds = {}

# Number of players; this is created from __main__.num_players.
_num_players = None
# }}}

class Player: # Class for player objects. {{{
	pass
# }}}

class Task: # Class for parallel tasks. {{{
	def __init__(self, generator, name):
		self.generator = generator
		self.name = name
		self.waiters = []
		self.done = False
		self.value = None
# }}}

class Instance: # Class for game instances. {{{
	def __init__(self, cls, name, num_players = None):
		self.timeouts = {}
		self.tasks = []
		self.game = cls()
		self.game.launch = self.launch
		n = name
		i = 0
		while name in instances:
			name = '%s (%d)' % (n, i)
			i += 1
		instances[name] = self
		self.game.broadcast = server.broadcast[name]
		if not hasattr(self.game, 'add_player'):
			self.game.add_player = lambda: self.add_player()
		if not hasattr(self.game, 'remove_player'):
			self.game.remove_player = lambda p: self.remove_player(p)
		# Allowed commands at this time.  Keys are command names, values are tuples of
		# (function to call or int or sequence of ints) and (generator to resume, or None).
		# Ints are players that are allowed to use this command.
		self.cmds = {}
		self.ended = False
		# Initialize Public variables.
		self.game.Public = Shared_Object(['Public'], None, name)
		self.game.Public._live()
		self.game.Public.name = name
		self.game.Public.players = []
		# Set up players.
		if name != '':
			if num_players is None:
				num_players = _num_players[0]
			if num_players < _num_players[0]:
				num_players = _num_players[0]
			if num_players > _num_players[1]:
				num_players = _num_players[1]
			title_game.game.Public.games.append(name)
		else:
			num_players = 0
		self.game.players = []
		for p in range(num_players):
			self.game.add_player()
		# Start game.
		self.launch(self.game.run(), 'main')
		log("started new instance '%s'" % name)

	def close(self):
		if self.game.Public.name not in instances:
			# Already closed.
			return
		log("stopped instance '%s'" % self.game.Public.name)
		del instances[self.game.Public.name]
		for c in connections:
			if connections[c].instance != self:
				continue
			leave({'connection': connections[c]})
		self.game.Public._die()
		for p in self.game.players:
			p.Private._die()
		if self is not title_game:
			title_game.game.Public.games.remove(self.game.Public.name)

	def end_game(self, code):
		#log('done')
		self.ended = True
		self.game.broadcast.end(code)
		if all(p.connection is None for p in self.game.players):
			self.close()

	def run(self, task, arg):
		self.cleanup(task)
		self.game.now = time.time()
		end_task = (False, None)
		try:
			#log('sending %s' % repr(arg))
			cmd = task.generator.send(arg)
		except StopIteration as e:
			task.value = e.value
			task.done = True
			end_task = (True, e.value)
		#log('cmd = %s' % repr(cmd))
		if end_task[0] or cmd is None:
			for t in task.waiters:
				websocketd.add_idle(lambda: self.run(t, end_task[1]))
			self.tasks.remove(task)
			if len(self.tasks) == 0:
				self.end_game(end_task[1])
			return
		# Convert cmd to dict if it isn't.
		if not isinstance(cmd, (tuple, list, set, frozenset, dict)):
			cmd = (cmd,)
		if isinstance(cmd, (tuple, list, set, frozenset)):
			def mkcmd(src):
				for c in src:
					if isinstance(c, (Task, str)):
						yield (c, None)
					else:
						yield (None, c)
			cmd = {x: y for x, y in mkcmd(cmd)}
		#log('new cmd: %s' % repr(cmd))
		# Check if we're waiting for a task that is already finished.
		for c in cmd:
			if isinstance(c, Task) and c.done:
				websocketd.add_idle(lambda: self.run(task, c.value))
				return
		# Schedule new timeout.
		if None in cmd:
			self.timeouts[task] = websocketd.add_timeout(cmd.pop(None), lambda: self.timeouts.pop(task) and self.run(task, None))
		# Add waiters to tasks.
		for c in cmd:
			if not isinstance(c, Task):
				continue
			c.waiters.append(task)
		# Add new commands.
		for c in cmd:
			if isinstance(c, Task):
				continue
			if c in self.cmds:
				assert task not in self.cmds[c]
			else:
				self.cmds[c] = {}
			self.cmds[c][task] = cmd[c]

	def cleanup(self, task):
		for k in [x for x in self.cmds if task in self.cmds[x]]:
			del self.cmds[k][task]
		if task in self.timeouts:
			websocketd.remove_timeout(self.timeouts.pop(task))
		for t in [x for x in self.tasks if task in x.waiters]:
			t.remove(task)

	def add_player(self):
		assert _num_players[1] is None or len(self.game.players) < _num_players[1]
		p = Player()
		p.connection = None
		p.Private = Shared_Object(['Private'], p, self.game.Public.name)
		p.Private._live()
		#log('appending %s' % p)
		self.game.players.append(p)
		self.game.Public.players.append({})
		return len(self.game.players) - 1

	def remove_player(self, p):
		assert len(self.game.players) > _num_players[0]
		assert p < len(self.game.players)
		if self.game.players[p].connection is not None:
			self.game.players[p].connection.num = None
			self.game.players[p].connection.game = None
			self.game.players[p].connection.socket.end_game.event()
			self.game.players[p].connection = None
		self.game.players[p].Private._die()
		self.game.Public.players.pop(p)
		self.game.players.pop(p)

	def launch(self, f, name = 'nameless task'):
		'''Record a generator as a task and schedule it for idle running.'''
		t = Task(f, name)
		self.tasks.append(t)
		websocketd.add_idle(lambda: self.run(t, None))
		return t
# }}}

class Args(dict): # Class for command arguments; ordered dict. {{{
	def __init__(self, a, ka):
		for k in ka:
			self[k] = ka[k]
		for i, v in enumerate(a):
			self[i] = v
		self.length = len(a)
	def __len__(self):
		return self.length
	def __iter__(self):
		for i in range(self.length):
			yield self[i]
# }}}

class Connection: # {{{
	def __init__(self, socket):
		self._socket = socket
		if 'name' in socket.data['query']:
			name = socket.data['query']['name'][0]
		else:
			name = 'anonymous'
		self.name = name
		i = 0
		while self.name in connections:
			self.name = '%s %d' % (name, i)
			i += 1
		connections[self.name] = self
		self._socket.closed = self._closed
		self.instance = title_game
		self._socket.groups.add(title_game.game.Public.name)
		self.num = None
		# Inform about state.
		self._socket.name.event(self.name)
		broadcast_shared(self, ['Public'], self.instance.game.Public)
		broadcast_shared(self, ['Private'], None, title_game.game.Public.name)
	def _closed(self):
		if self.num is not None:
			self.instance.game.players[self.num].connection = None
			self.instance.game.Public.players[self.num]['name'] = None
			if __main__.autokill and all(p.connection is None for p in self.instance.game.players):
				# Last player left; destroy game.
				self.instance.close()
			self.num = None
		del connections[self.name]
	def __getattr__(self, attr):
		'''Allow usage of registered commands.'''
		if attr.startswith('_'):
			raise AttributeError('invalid attribute name for getattr')
		if attr in cmds:
			queue = cmds[attr]
			instance = None
		elif self.instance is not None and attr in self.instance.cmds:
			queue = self.instance.cmds[attr]
			instance = self.instance
		else:
			log('attribute not found: %s not in %s %s' % (attr, repr(cmds), repr(self.instance.cmds)))
			raise AttributeError('attribute %s not found' % attr)
		def wrap(*a, **ka):
			action = False
			for task in queue.copy():
				func = queue[task]
				if isinstance(func, int):
					func = (func,)
				if isinstance(func, (tuple, list)):
					if self.num not in func:
						continue
					func = None
				action = True
				args = {'args': Args(a, ka), 'connection': self, 'player': self.num, 'command': attr}
				if func is not None:
					websocketd.add_idle(lambda: func(args) and False)
				if task is not None:
					instance.cleanup(task);
					websocketd.add_idle(lambda: instance.run(task, args))
			if not action:
				raise AttributeError('forbidden')
		return wrap
# }}}

class Title: # Class for default title game object. {{{
	def run(self):
		self.Public.title = __main__.name
		self.Public.games = []
		self.Public.min_players = _num_players[0]
		self.Public.max_players = _num_players[1]
		while True:
			cmd = (yield ('new', 'join', 'return', 'view'))
			connection = cmd['connection']
			command = cmd['command']
			num = connection.num
			#log('received title command %s' % cmd)
			if len(cmd['args']) < 1:
				log('no game name specified')
				continue
			if command == 'new':
				i = Instance(__main__.Game, *cmd['args'])
				cmd['args'][0] = i.game.Public.name
				command = 'join'	# fall through.
			if cmd['args'][0] not in instances:
				log("game doesn't exist")
				continue
			instance = instances[cmd['args'][0]]
			if command == 'join':
				for i, p in enumerate(instance.game.players):
					if p.connection is None:
						connection.num = i
						break
				else:
					if len(instance.game.players) < _num_players[1]:
						connection.num = instance.game.add_player()
					else:
						log('no more players allowed')
						continue
				connection.instance = instance
				instance.game.players[connection.num].connection = connection
				instance.game.Public.players[connection.num]['name'] = connection.name
				connection._socket.groups.remove(self.Public.name)
				connection._socket.groups.add(cmd['args'][0])
				# Private must be sent before Public, because when Public.name is set, all shared variables must be available.
				broadcast_shared(connection, ['Private'], connection.instance.game.players[connection.num].Private)
				broadcast_shared(connection, ['Public'], connection.instance.game.Public)
			elif command == 'return':
				if len(cmd['args']) < 2 or cmd['args'][1] >= len(instance.game.players) or instance.game.players[cmd['args'][1]].connection is not None:
					log('invalid player number to return to')
					continue
				connection.instance = instance
				connection.num = cmd['args'][1]
				instance.game.players[cmd['args'][1]].connection = connection
				connection._socket.groups.remove(self.Public.name)
				connection._socket.groups.add(cmd['args'][0])
				broadcast_shared(connection, ['Public'], connection.instance.game.Public)
				connection.instance.game.Public.players[connection.num]['name'] = connection.name
				broadcast_shared(connection, ['Private'], connection.instance.game.players[connection.num].Private)
			elif command == 'view':
				connection.instance = instance
				connection._socket.groups.remove(self.Public.name)
				connection._socket.groups.add(cmd['args'][0])
				broadcast_shared(connection, ['Public'], connection.instance.game.Public)
				broadcast_shared(connection, ['Private'], None)
			else:
				log('impossible command')
				continue
# }}}

def leave(args): # Player leaves the game.  This is always available except from the title game. {{{
	connection = args['connection']
	if connection.instance is title_game:
		return
	end = None
	if connection.num is not None:
		connection.instance.game.players[connection.num].connection = None
		if (__main__.autokill or connection.instance.ended) and all(p.connection is None for p in connection.instance.game.players):
			# Last player left; destroy game if it was still running.
			end = connection.instance
	connection._socket.groups.remove(connection.instance.game.Public.name)
	connection.instance = title_game
	connection._socket.groups.add(title_game.game.Public.name)
	connection.num = None
	broadcast_shared(connection, ['Public'], connection.instance.game.Public)
	broadcast_shared(connection, ['Private'], None, title_game.game.Public.name)
	if end:
		end.close()
# }}}

def Game(): # Main function to start a game. {{{
	global server, title_game, have_2d, have_3d, _num_players
	# Set up the game name.
	if not hasattr(__main__, 'name') or __main__.name is None:
		__main__.name = os.path.basename(sys.argv[0]).capitalize()
	# Initialize fhs module.
	if not fhs.initialized:
		fhs.init({}, packagename = __main__.name.lower(), game = True)
	# Set up other constants.
	if not hasattr(__main__, 'autokill'):
		__main__.autokill = True
	have_2d = fhs.read_data(os.path.join('html', '2d'), dir = True, opened = False) is not None
	have_3d = fhs.read_data(os.path.join('html', '3d'), dir = True, opened = False) is not None or not have_2d
	# Fill in min and max if not specified.
	assert hasattr(__main__, 'num_players')
	if isinstance(__main__.num_players, int):
		_num_players = (__main__.num_players, __main__.num_players)
	else:
		_num_players = __main__.num_players
	assert 1 <= _num_players[0] and (_num_players[1] is None or _num_players[0] <= _num_players[1])
	# Build asset string for inserting in js.
	for subdir, use_3d in (('2d', False), ('3d', True)):
		targets = []
		for base in ('img', 'jta', 'gani', 'audio', 'text'):
			for d in (os.path.join('html', base), os.path.join('html', subdir, base)):
				for p in fhs.read_data(d, dir = True, multiple = True, opened = False):
					targets.extend(f.encode('utf-8') for f in os.listdir(p) if not f.startswith('.') and not os.path.isdir(os.path.join(p, f)))
		if len(targets) > 0:
			loader_js[use_3d] = b'\n'.join(b"\tplease.load('" + f + b"');" for f in targets)
		else:
			# Nothing to load, but force the "finished loading" event to fire anyway.
			loader_js[use_3d] = b'\twindow.dispatchEvent(new CustomEvent("mgrl_media_ready"));'
	# Set up commands.
	cmds['leave'] = {None: leave}
	if hasattr(__main__, 'commands'):
		for c in __main__.commands:
			cmds[c] = {None: __main__.commands[c]}
	# Start up websockets server.
	config = fhs.module_get_config('webgame')
	httpdirs = [fhs.read_data(x, opened = False, multiple = True, dir = True) for x in ('html', os.path.join('html', '2d'), os.path.join('html', '3d'))]
	server = websocketd.RPChttpd(config['port'], Connection, tls = config['tls'], httpdirs = httpdirs[0] + httpdirs[1] + httpdirs[2])
	server.handle_ext('png', 'image/png')
	server.handle_ext('jpg', 'image/jpeg')
	server.handle_ext('jpeg', 'image/jpeg')
	server.handle_ext('gif', 'image/gif')
	server.handle_ext('gani', 'text/plain')
	server.handle_ext('wav', 'audio/wav')
	server.handle_ext('ogg', 'audio/ogg')
	server.handle_ext('mp3', 'audio/mp3')
	server.handle_ext('jta', 'application/octet-stream')
	server.handle_ext('txt', 'text/plain')
	server.handle_ext('frag', 'text/plain')
	server.handle_ext('vert', 'text/plain')
	server.handle_ext('glsl', 'text/plain')
	# Set up title page.
	if hasattr(__main__, 'Title'):
		title_game = Instance(__main__.Title, '')
	else:
		title_game = Instance(Title, '')
	log('Game "%s" started' % __main__.name)
	# Main loop.
	websocketd.fgloop()
	# End of game.  Do anything to clean up?
# }}}
