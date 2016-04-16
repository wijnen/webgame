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
				assert self._path[0] == 'public'
				server.broadcast[self._group].public_update(path)
			elif self._path[0] == 'public':
				assert self._group in self._target.connection._socket.groups
				if self._target.connection:
					self._target.connection._socket.public_update.event(path)
			else:
				if self._target.connection:
					self._target.connection._socket.private_update.event(path)
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
				assert self.path[0] == 'public'
				server.broadcast[self.group].public_update(path, len(self.data))
			elif self.path[0] == 'public':
				assert self.group in self.target.connection._socket.groups
				if self.target.connection:
					self.target.connection._socket.public_update.event(path, len(self.data))
			else:
				if self.target.connection:
					self.target.connection._socket.private_update.event(path, len(self.data))
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
		assert path[0] == 'public'
		# Send public update to everyone.
		#log('broadcast %s %s' % (repr(path), repr(value)))
		server.broadcast[group].public_update(path[1:], value)
	else:
		if path[0] == 'public':
			assert group in target._socket.groups
			#log('public %s %s' % (repr(path), repr(value)))
			# Send public information to target.
			target._socket.public_update.event(path[1:], value)
		else:
			#log('private %s %s' % (repr(path), repr(value)))
			# Send private information for target that is controlling the correct player.
			target._socket.private_update.event(path[1:], value)
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
# }}}

class Player: # Class for player objects. {{{
	pass
# }}}

class Instance: # Class for game instances. {{{
	def __init__(self, cls, name, num_players = None):
		self.timeouts = {}
		self.game = cls()
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
		# Initialize public variables.
		self.game.public = Shared_Object(['public'], None, name)
		self.game.public._live()
		self.game.public.name = name
		self.game.public.players = []
		# Set up players.
		if cls is not Title:
			if not hasattr(self.game, 'min_players'):
				self.game.min_players = __main__.min_players
			if not hasattr(self.game, 'max_players'):
				self.game.max_players = __main__.max_players
			num_players = num_players or __main__.min_players
			title_game.game.public.games.append(name)
		else:
			num_players = 0
		self.game.players = []
		for p in range(num_players):
			self.game.add_player()
		# Start game.
		self.run(time.time(), self.game.run(), None)
		log("started new instance '%s'" % name)

	def close(self):
		if self.game.public.name not in instances:
			# Already closed.
			return
		log("stopped instance '%s'" % self.game.public.name)
		del instances[self.game.public.name]
		for c in connections:
			if connections[c].instance != self:
				continue
			leave({'connection': connections[c]})
		self.game.public._die()
		for p in self.game.players:
			p.private._die()
		title_game.game.public.games.remove(self.game.public.name)

	def end_game(self, code):
		#log('done')
		self.ended = True
		self.game.broadcast.end(code)
		if all(p.connection is None for p in self.game.players):
			self.close()

	def run(self, now, f, arg):
		self.cleanup(f)
		self.game.now = now
		if type(f) == generator_type:
			try:
				#log('sending %s' % repr(arg))
				cmd = f.send(arg)
			except StopIteration as e:
				self.end_game(e.value)
				return
		else:
			cmd = f(arg)
		#log('cmd = %s' % repr(cmd))
		if cmd is None:
			self.end_game(None)
			return
		# Convert cmd to dict if it isn't.
		if isinstance(cmd, str):
			cmd = {cmd: None}
		elif isinstance(cmd, (tuple, list)):
			def mkcmd(src):
				for c in src:
					if isinstance(c, str):
						yield (c, None)
					else:
						yield (None, c)
			cmd = {x: y for x, y in mkcmd(cmd)}
		#log('new cmd: %s' % repr(cmd))
		# Schedule new timeout.
		if None in cmd:
			self.timeouts[f] = websocketd.add_timeout(cmd.pop(None), lambda: self.timeouts.pop(f) and self.run(time.time(), f, None))
		# Add new commands.
		for c in cmd:
			assert c not in self.cmds
			self.cmds[c] = (cmd[c], f)

	def cleanup(self, f):
		for k in [x for x in self.cmds if self.cmds[x][1] is f]:
			self.cmds.pop(k)
		if f in self.timeouts:
			websocketd.remove_timeout(self.timeouts.pop(f))

	def add_player(self):
		#log('%s %s %s' % (self.game.public.name, self.game.players, self.game.max_players))
		assert self.game.max_players is None or len(self.game.players) < self.game.max_players
		p = Player()
		p.connection = None
		p.private = Shared_Object(['private'], p, self.game.public.name)
		p.private._live()
		#log('appending %s' % p)
		self.game.players.append(p)
		self.game.public.players.append({})
		return len(self.game.players) - 1

	def remove_player(self, p):
		assert len(self.game.players) > self.game.min_players
		assert p < len(self.game.players)
		if self.game.players[p].connection is not None:
			self.game.players[p].connection.num = None
			self.game.players[p].connection.game = None
			self.game.players[p].connection.socket.end_game.event()
			self.game.players[p].connection = None
		self.game.players[p].private._die()
		self.game.public.players.pop(p)
		self.game.players.pop(p)

	def launch(self, f, *a, **ka):
		'''Call a function or generator, with arguments.
		The return value is discarded.'''
		fn = f(*a, **ka)
		# If it's a generator, run it.
		# If not, ignore the return value.
		if type(fn) == generator_type:
			self.run(time.time(), fn, None)
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
		self._socket.groups.add(title_game.game.public.name)
		self.num = None
		# Inform about state.
		self._socket.name.event(self.name)
		broadcast_shared(self, ['public'], self.instance.game.public)
		broadcast_shared(self, ['private'], None, title_game.game.public.name)
	def _closed(self):
		if self.num is not None:
			self.instance.game.players[self.num].connection = None
			self.instance.game.public.players[self.num]['name'] = None
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
			func, f = cmds[attr]
			instance = None
		elif self.instance is not None and attr in self.instance.cmds:
			func, f = self.instance.cmds[attr]
			instance = self.instance
		else:
			log('attribute not found: %s not in %s %s' % (attr, repr(cmds), repr(self.instance.cmds)))
			raise AttributeError('attribute %s not found' % attr)
		if isinstance(func, int):
			func = (func,)
		if isinstance(func, (tuple, list)):
			if self.num not in func:
				raise AttributeError('forbidden')
			func = None
		def wrap(*a, **ka):
			args = {'args': Args(a, ka), 'connection': self, 'player': self.num, 'command': attr}
			if func is not None:
				ret = func(args)
			else:
				ret = None
			if f is not None:
				instance.cleanup(f);
				if instance is not None:
					instance.run(time.time(), f, args)
				else:
					assert f(args) is None
			return ret
		return wrap
# }}}

def page(connection): # Response function for non websocket requests.  Falls back to websocketd.RPChttpd.page. {{{
	if any(connection.address.path == '/' + x for x in ('rpc.js', 'builders.js')):
		server.reply_js(connection, fhs.read_data(connection.address.path.rsplit('/', 1)[-1], text = False, packagename = 'python3-websocketd').read())
	elif any(connection.address.path == '/' + x for x in ('webgame.js', 'gl-matrix.js', 'mgrl.js')):
		def makeaudio(dirobj, dir):
			ret = []
			for f in os.listdir(dir):
				if os.path.splitext(f)[1][len(os.path.extsep):] not in ('wav', 'ogg', 'mp3'):
					continue
				if os.path.isdir(f):
					d = dirobj.copy()
					d.append(f)
					ret.extend(makeaudio(d, os.path.join(dir, f)))
				else:
					ret.append((dirobj, f, os.path.splitext(f)[0]))
			return ret
		audio = json.dumps(makeaudio([], fhs.read_data(os.path.join('html', 'audio'), text = False, opened = False, dir = True))).encode('utf-8')
		if not have_3d:
			use_3d = False
		elif not have_2d:
			use_3d = True
		elif '2d' in connection.query:
			use_3d = False
		else:
			use_3d = True
		server.reply_js(connection, fhs.read_data(connection.address.path.rsplit('/', 1)[-1], text = False, packagename = 'python3-webgame').read().replace(b'#3D#', b'true' if use_3d else b'false').replace(b'#LOAD#', loader_js[use_3d]).replace(b'#PREFIX#', (connection.prefix + '/').encode('utf-8')).replace(b'#AUDIO#', audio))
	elif connection.address.path == '/webgame.css':
		server.reply_css(connection, fhs.read_data(connection.address.path.rsplit('/', 1)[-1], text = False, packagename = 'python3-webgame').read())
	elif connection.address.path == '/':
		files = []
		for d in connection.server.httpdirs:
			for f in os.listdir(d):
				if not f.endswith(os.extsep + 'js'):
					continue
				files.append(("<script type='application/javascript' src='%s'></script>" % f).encode('utf-8'))
		files.sort()
		if __main__.min_players == __main__.max_players:
			range_str = "<input id='title_num_players' type='hidden' value='%d'/>" % __main__.min_players
		else:
			if __main__.max_players is None:
				player_range = '%d or more' % __main__.min_players
			else:
				player_range = 'from %d to %d' % (__main__.min_players, __main__.max_players)
			range_str = "Number of players: <input type='text' id='title_num_players'/> (%s)</span>" % player_range
		server.reply_html(connection, fhs.read_data('webgame.html', text = False, packagename = 'python3-webgame').read().replace(b'#NAME#', __main__.name.encode('utf-8')).replace(b'#BASE#', (connection.prefix + '/').encode('utf-8')).replace(b'#SOURCE#', b'\n\t\t'.join(files)).replace(b'#QUERY#', connection.address.query.encode('utf-8')).replace(b'#RANGE#', range_str.encode('utf-8')))
	else:
		if 'name' in connection.query:
			connection.data['name'] = connection.query['name'][-1]
		path = connection.address.path.split('/')
		if path[-1].startswith('2d-') or path[-1].startswith('3d-'):
			path = path[:-2] + [path[-1][:2], path[-2], path[-1][3:]]
		websocketd.RPChttpd.page(server, connection, '/'.join(path))
# }}}

class Title: # Class for default title game object. {{{
	def __init__(self):
		self.min_players = 0
		self.max_players = 0
	def run(self):
		self.public.title = __main__.name
		self.public.games = []
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
				cmd['args'][0] = i.game.public.name
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
					if len(instance.game.players) < instance.game.max_players:
						connection.num = instance.game.add_player()
					else:
						log('no more players allowed')
						continue
				connection.instance = instance
				instance.game.players[connection.num].connection = connection
				connection._socket.groups.remove(self.public.name)
				connection._socket.groups.add(cmd['args'][0])
				broadcast_shared(connection, ['public'], connection.instance.game.public)
				connection.instance.game.public.players[connection.num]['name'] = connection.name
				broadcast_shared(connection, ['private'], connection.instance.game.players[connection.num].private)
			elif command == 'return':
				if len(cmd['args']) < 2 or cmd['args'][1] >= len(instance.game.players) or instance.game.players[cmd['args'][1]].connection is not None:
					log('invalid player number to return to')
					continue
				connection.instance = instance
				connection.num = cmd['args'][1]
				instance.game.players[cmd['args'][1]].connection = connection
				connection._socket.groups.remove(self.public.name)
				connection._socket.groups.add(cmd['args'][0])
				broadcast_shared(connection, ['public'], connection.instance.game.public)
				connection.instance.game.public.players[connection.num]['name'] = connection.name
				broadcast_shared(connection, ['private'], connection.instance.game.players[connection.num].private)
			elif command == 'view':
				connection.instance = instance
				connection._socket.groups.remove(self.public.name)
				connection._socket.groups.add(cmd['args'][0])
				broadcast_shared(connection, ['public'], connection.instance.game.public)
				broadcast_shared(connection, ['private'], None)
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
	connection._socket.groups.remove(connection.instance.game.public.name)
	connection.instance = title_game
	connection._socket.groups.add(title_game.game.public.name)
	connection.num = None
	broadcast_shared(connection, ['public'], connection.instance.game.public)
	broadcast_shared(connection, ['private'], None, title_game.game.public.name)
	if end:
		end.close()
# }}}

def Game(cmd = {}, title = Title): # Main function to start a game.  Pass commands that always work, if any. {{{
	global server, title_game, have_2d, have_3d
	# Set up the game name.
	if not hasattr(__main__, 'name') or __main__.name is None:
		__main__.name = os.path.basename(sys.argv[0]).capitalize()
	# Initialize fhs module.
	if not fhs.initialized:
		fhs.init({}, packagename = __main__.name.lower(), game = True)
	# Set up other constants.
	if not hasattr(__main__, 'autokill'):
		__main__.autokill = True
	have_3d = fhs.read_data(os.path.join('html', '3d'), dir = True, opened = False) is not None
	have_2d = fhs.read_data(os.path.join('html', '2d'), dir = True, opened = False) is not None or not have_3d
	# Fill in min and max if not specified.
	if hasattr(__main__, 'num_players'):
		assert isinstance(__main__.num_players, int)
		if not hasattr(__main__, 'min_players'):
			__main__.min_players = __main__.num_players
		if not hasattr(__main__, 'max_players'):
			__main__.max_players = __main__.num_players
	assert hasattr(__main__, 'min_players') and isinstance(__main__.min_players, int)
	assert hasattr(__main__, 'max_players') and __main__.max_players is None or (isinstance(__main__.max_players, int) and __main__.max_players >= __main__.min_players)
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
	cmds['leave'] = (leave, None)
	for c in cmd:
		cmds[c] = (cmd[c], None)
	# Start up websockets server.
	config = fhs.module_get_config('webgame')
	httpdirs = [fhs.read_data(x, opened = False, multiple = True, dir = True) for x in ('html', os.path.join('html', '2d'), os.path.join('html', '3d'))]
	server = websocketd.RPChttpd(config['port'], Connection, tls = config['tls'], httpdirs = httpdirs[0] + httpdirs[1] + httpdirs[2])
	server.page = page
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
	# Set up title page.
	title_game = Instance(title, '')
	log('Game "%s" started' % __main__.name)
	# Main loop.
	websocketd.fgloop()
	# End of game.  Do anything to clean up?
# }}}
